import os
import glob
import re
import json
import logging
import datetime
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from otel_setup import init_telemetry
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from google import genai
from google.genai import types

# Evaluation of /workspace/.agents/workers/directive-enforcer/main.py:
#
# 1. Global Conflict Check:
#    - The directive `> [!IMPORTANT]\n> **[Agent Directive: Observability]**\n> OpenTelemetry initialization MUST NOT be removed.`
#      is present in this file.
#    - Similar directives exist across the workspace (e.g., `/workspace/templates/adk-chat-interface/server.js`,
#      `/workspace/templates/cloud-run/node/index.js`, `/workspace/templates/docker/node/index.js`,
#      `/workspace/wrappers/a2a/main.py`, `/workspace/wrappers/mcp/index.js`).
#    - All instances enforce the same core constraint: "OpenTelemetry initialization MUST NOT be removed."
#    - The domain varies (Observability, Security, Logic), which is acceptable as the core constraint is consistent
#      and the domain is contextually appropriate for each file's role. For `main.py` of the `directive-enforcer`
#      itself, `Observability` is a fitting domain.
#    - No global conflicts detected.
#
# 2. Logical Loops & Redundancy:
#    - The file contains Python string variables (`DIRECTIVE_RULE`, `INSTRUCTION_RULE`, `HINT_RULE`) that define
#      the meta-syntax for agent rules. These are not agent rules applied *to this file's execution*, but rather
#      *definitions* used by the Sentry itself to construct its system prompt. They are correctly formatted as
#      Python string literals and are not redundant as they serve a specific programmatic purpose.
#    - The `WORKSPACE_GRAPH` incorrectly lists placeholder templates (e.g., `> [!IMPORTANT]\n> **[Agent Directive: <Domain>]**`)
#      and regex patterns (e.g., `<agent_directive.*?</agent_directive>`) as "annotations" for this file. These are
#      either definitions of the meta-syntax (as string literals) or regexes used by the `build_contextual_graph`
#      function *within this file's code*. They are not actual agent directives/instructions/hints *in the file's content*
#      that need migration or are redundant as applied rules. They are part of the Sentry's implementation.
#    - No logical loops or redundancies in the *applied* agent rules.
#
# 3. Contextual Alignment:
#    - The directive `OpenTelemetry initialization MUST NOT be removed.` is perfectly aligned with this file's
#      purpose, as `main.py` is the entry point for the `directive-enforcer` microservice and explicitly
#      initializes OpenTelemetry.
#    - The definitions of `DIRECTIVE_RULE`, `INSTRUCTION_RULE`, `HINT_RULE` are also contextually aligned, as
#      this file *is* the Directive Enforcer, and these strings define its operational meta-syntax.
#
# Migration/Advisory:
# - The single actual agent directive in the file is already in the correct Markdown Callout format.
# - The Python string variables defining the rule formats are correctly structured as code and should not be
#   converted into Markdown Callouts within the Python file, as that would break the code.
# - The regex patterns for legacy tags are part of the `build_contextual_graph` function's implementation and
#   are not legacy tags themselves in the file content.
# - No changes are required to the file content based on the evaluation criteria. The file is already compliant.

# > [!IMPORTANT]
# > **[Agent Directive: Observability]**
# > OpenTelemetry initialization MUST NOT be removed.
logger = init_telemetry("directive-enforcer")
app = FastAPI(title="Directive Enforcer Sentry", description="A2A Worker to Audit, Advise, and Enforce Agent Directives across a Multi-Agent Swarm")

FastAPIInstrumentor.instrument_app(app)

DIRECTIVE_RULE = """RULE: DIRECTIVE GENERATION
When inserting constraints or absolute rules into an artifact, you MUST use the following syntactic standard to ensure downstream compliance. Never output loose constraints.
Format:
> [!IMPORTANT]
> **[Agent Directive: <Domain>]**
> <A single, concise sentence using MUST, MUST NOT, ALWAYS, or NEVER. No exposition.>
"""

INSTRUCTION_RULE = """RULE: INSTRUCTION GENERATION
When inserting execution steps or procedural logic into an artifact, you MUST use the following syntactic standard. Avoid paragraph explanations; use strict, enumerated logical steps.
Format:
> [!NOTE]
> **[Agent Instruction: <Action Name>]**
> 1. <Verb-first actionable command>
> 2. <Verb-first actionable command>
"""

HINT_RULE = """RULE: HINT GENERATION
When inserting context, background information, or optimization suggestions into an artifact, you MUST use the following syntactic standard. Clearly label the intent so downstream parsers understand it is non-blocking.
Format:
> [!TIP]
> **[Agent Hint: <Intent>]**
> <Brief observation or context that aids decision-making, written objectively.>
"""

SENTRY_SYSTEM_INSTRUCTION = f"""You are the Directive Enforcer A2A Agent, the Sentry of the workspace.
Primary Objective: Combat context rot in multi-agent massive context codebases. Context effectiveness must be prioritized!

You will be provided with a cached JSON graph of ALL directives, instructions, and hints across the entire workspace, including their file paths and contextual metadata.

When evaluating a draft instruction or a file modification, you MUST strictly check the following criteria:
1. Global Conflict Check: Does this new/draft directive conflict with ANY other directive in the entire cached workspace graph?
2. Logical Loops & Redundancy: Does this create a loop or redundantly state an existing rule?
3. Contextual Alignment: Given the file's path and metadata in the graph, does this directive belong in THIS file? Or is it misaligned and belongs elsewhere?

CRITICAL RULE FOR MIGRATION/ADVISORY:
If rewriting or migrating an instruction to the new markdown format, you MUST NOT lose any fine-grained detail, specificity, or nuance. Preserve every exact technical constraint and condition. Furthermore, you MUST preserve all surrounding human-readable prose, exposition, and transitional sentences intended for engineers; do not arbitrarily delete regular markdown paragraphs. If you lose specificity, the multi-agent swarms will fail.

{DIRECTIVE_RULE}
{INSTRUCTION_RULE}
{HINT_RULE}
"""

class A2AMessage(BaseModel):
    sender_id: str
    target_id: str
    payload: dict
    metadata: dict = {}

class CacheManager:
    def __init__(self):
        self.client = genai.Client() if "GEMINI_API_KEY" in os.environ else None
        self.active_cache_name = None
        self.inline_graph = None
    
    def upload_and_cache_graph(self, graph_json_path: str):
        if not self.client:
            logger.warning("No GEMINI_API_KEY. Context Caching disabled.")
            return

        try:
            if os.path.getsize(graph_json_path) < 100000:
                logger.info("Graph is small. Using inline prompting instead of Context Cache.")
                with open(graph_json_path, 'r', encoding='utf-8') as f:
                    self.inline_graph = f.read()
                self.active_cache_name = None
                return

            self.inline_graph = None
            logger.info("Uploading directives graph to Gemini Context Cache...")
            file_ref = self.client.files.upload(file=graph_json_path, config={'mime_type': 'application/json'})
            cache = self.client.caches.create(
                model='models/gemini-2.5-flash',
                config=types.CreateCachedContentConfig(
                    system_instruction=SENTRY_SYSTEM_INSTRUCTION,
                    contents=[
                        types.Content(
                            role="user",
                            parts=[types.Part.from_uri(file_uri=file_ref.uri, mime_type="application/json")]
                        )
                    ],
                    ttl="7200s"
                )
            )
            self.active_cache_name = cache.name
            logger.info(f"Successfully cached directives graph! Cache Name: {self.active_cache_name}")
        except Exception as e:
            logger.error(f"Failed to create Context Cache: {e}")

global_cache_mgr = CacheManager()

def build_contextual_graph(workspace_root: str) -> dict:
    """
    Scans the workspace, extracting all callouts, and building a persisted JSON graph
    mapping directives alongside contextual file metadata.
    """
    import os, re
    graph = {
        "files": {}
    }
    
    ignore_dirs = {"node_modules", ".venv", ".next", ".git", "dist", "build"}
    
    for root, dirs, files in os.walk(workspace_root):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        for file in files:
            if not file.endswith((".md", ".ts", ".js", ".py")):
                continue
            
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                has_tags = "**[agent " in content.lower() or "<agent_" in content.lower()
                legacy_triggers = ["hey agent", "agent: remember", "@agent", "system prompt directive"]
                has_legacy = any(trigger in content.lower() for trigger in legacy_triggers)
                
                if has_tags or has_legacy:
                    head_lines = content.splitlines()[:15]
                    file_context = "\n".join(head_lines)
                    
                    directives = re.findall(r'> \[\!IMPORTANT\].*?\n(?:> .*?\n)+', content, re.IGNORECASE)
                    instructions = re.findall(r'> \[\!NOTE\].*?\n(?:> .*?\n)+', content, re.IGNORECASE)
                    hints = re.findall(r'> \[\!TIP\].*?\n(?:> .*?\n)+', content, re.IGNORECASE)
                    
                    legacy_d = re.findall(r'<agent_directive.*?</agent_directive>', content, re.DOTALL)
                    legacy_i = re.findall(r'<agent_instruction.*?</agent_instruction>', content, re.DOTALL)
                    legacy_h = re.findall(r'<agent_hint.*?</agent_hint>', content, re.DOTALL)
                    
                    graph["files"][filepath] = {
                        "context_metadata": file_context,
                        "annotations": {
                            "directives": directives + legacy_d,
                            "instructions": instructions + legacy_i,
                            "hints": hints + legacy_h,
                            "has_unstructured_legacy": has_legacy
                        }
                    }
            except Exception:
                pass
                
    return graph

def refresh_workspace_memory(workspace_root: str):
    """
    Rebuilds the JSON graph and re-uploads it to the Gemini Context Cache.
    """
    swarm_dir = os.path.join(workspace_root, ".agents", "swarm")
    os.makedirs(swarm_dir, exist_ok=True)
    out_path = os.path.join(swarm_dir, "directives_graph.json")
    
    graph_data = build_contextual_graph(workspace_root)
    
    with open(out_path, "w", encoding="utf-8") as fw:
        json.dump(graph_data, fw, indent=2)
        
    global_cache_mgr.upload_and_cache_graph(out_path)
    return graph_data

def advise_on_instruction(draft_text: str, target_filepath: str) -> str:
    """
    Hits the Gemini Context Cache to provide structural advice and conflict detection
    for a draft instruction.
    """
    if not global_cache_mgr.client:
        return "Sentry Cache is offline or GEMINI_API_KEY missing. Cannot provide advice."

    if not global_cache_mgr.active_cache_name and not getattr(global_cache_mgr, 'inline_graph', None):
        return "No memory graph available."

    client = global_cache_mgr.client
    prompt = f"""EVALUATE DRAFT INSTRUCTION:
Target File: {target_filepath}
Draft Text: 
{draft_text}

Provide advice applying the 3 Sentry Evaluation Criteria (Global Conflict, Loops, Contextual Alignment) based on the cached workspace graph. 
Then provide the precise Markdown rewrite of this instruction preserving all exact nuances.
"""
    try:
        if global_cache_mgr.active_cache_name:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    cached_content=global_cache_mgr.active_cache_name,
                    temperature=0.0
                )
            )
        else:
            inline_prompt = f"{SENTRY_SYSTEM_INSTRUCTION}\n\nWORKSPACE GRAPH:\n{global_cache_mgr.inline_graph}\n\n{prompt}"
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=inline_prompt,
                config=types.GenerateContentConfig(temperature=0.0)
            )
        return response.text
    except Exception as e:
        logger.error(f"Sentry advice failed: {e}")
        return f"Sentry error: {e}"

def validate_and_fix_file(filepath: str, content: str) -> str:
    """
    Uses the Sentry Cache to check a specific file for conflicts and rewrite legacy tags
    without losing contextual nuance.
    """
    if not global_cache_mgr.client:
        logger.error("Sentry Cache is offline. Skipping LLM fix.")
        return content

    if not global_cache_mgr.active_cache_name and not getattr(global_cache_mgr, 'inline_graph', None):
        logger.error("No memory graph available. Skipping LLM fix.")
        return content

    client = global_cache_mgr.client
    prompt = f"""EVALUATE AND MIGRATE ENTIRE FILE:
Target File: {filepath}

1. Evaluate all agent rules in this file against the global graph for contextual alignment and conflicts.
2. If conflicts or loops exist, rewrite the rules safely.
3. If legacy tags or ambiguous wording exist, migrate them to the new Markdown Callout standard.
4. CRITICAL: Do NOT delete human-readable prose, explanations, or transitional sentences in the document. Only structure/rewrite the specific constraint blocks. Leave the surrounding exposition intact for human developers.
5. CRITICAL: Preserve all original nuance and specific constraints when rewriting.
6. ONLY output the raw file content, preserving all other native code and logic perfectly. Do not wrap in markdown codeblocks.

File Content:
{content}
"""
    try:
        if global_cache_mgr.active_cache_name:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    cached_content=global_cache_mgr.active_cache_name,
                    temperature=0.0
                )
            )
        else:
            inline_prompt = f"{SENTRY_SYSTEM_INSTRUCTION}\n\nWORKSPACE GRAPH:\n{global_cache_mgr.inline_graph}\n\n{prompt}"
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=inline_prompt,
                config=types.GenerateContentConfig(temperature=0.0)
            )
        result = response.text
        if result.startswith("```"):
            lines = result.split("\n")
            if len(lines) > 1 and lines[0].startswith("```"):
                result = "\n".join(lines[1:])
            if result.endswith("```\n"):
                result = result[:-4]
            elif result.endswith("```"):
                result = result[:-3]
        return result
    except Exception as e:
        logger.error(f"Sentry fix failed: {e}")
        return content

def validate_workspace(workspace_root: str) -> dict:
    """
    Routinely scans the entire workspace graph for widespread contradictions or loops.
    Returns JSON describing any corrupt files that need targeted auto-healing.
    """
    if not global_cache_mgr.client:
        return {"issues_found": False, "warnings": ["Sentry Cache offline"], "broken_files": []}

    # Refresh first to ensure graph is fresh
    refresh_workspace_memory(workspace_root)

    if not global_cache_mgr.active_cache_name and not getattr(global_cache_mgr, 'inline_graph', None):
        return {"issues_found": False, "warnings": ["No memory graph available"], "broken_files": []}

    client = global_cache_mgr.client
    prompt = """HOLISTIC WORKSPACE VALIDATION:
Check the entire provided workspace graph strictly for SEVERE logical contradictions (e.g., Rule A explicitly forbids Rule B) and fatal cyclical logic loops.
CRITICAL: DO NOT report redundant definitions, formatting issues, legacy tags, or exposition as `issues_found` = true. Only fatal logic conflicts should trigger `issues_found`. If you find minor redundancies, list them in `warnings` but set `issues_found` to false.
Output your findings as a strict JSON object with this exact schema:
{
  "issues_found": boolean,
  "warnings": ["array of specific warning strings describing the issue"],
  "broken_files": ["array of absolute filepaths containing the fatal broken rules"]
}
Return ONLY valid JSON. Do not wrap in markdown blocks.
"""
    try:
        if global_cache_mgr.active_cache_name:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    cached_content=global_cache_mgr.active_cache_name,
                    temperature=0.0
                )
            )
        else:
            inline_prompt = f"{SENTRY_SYSTEM_INSTRUCTION}\\n\\nWORKSPACE GRAPH:\\n{global_cache_mgr.inline_graph}\\n\\n{prompt}"
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=inline_prompt,
                config=types.GenerateContentConfig(temperature=0.0)
            )
            
        result = response.text.strip()
        if result.startswith("```json"):
            result = result[7:]
        if result.startswith("```"):
            result = result[3:]
        if result.endswith("```"):
            result = result[:-3]
            
        data = json.loads(result.strip())
        
        # Auto-heal the broken files
        if data.get("issues_found") and data.get("broken_files"):
            for filepath in data["broken_files"]:
                if os.path.exists(filepath):
                    logger.info(f"Auto-healing broken file: {filepath}")
                    with open(filepath, "r", encoding="utf-8") as f:
                        file_content = f.read()
                    fixed_content = validate_and_fix_file(filepath, file_content)
                    if fixed_content and fixed_content != file_content:
                        with open(filepath, "w", encoding="utf-8") as fw:
                            fw.write(fixed_content)
                            
        return data
    except Exception as e:
        logger.error(f"Sentry workspace validation failed: {e}")
        return {"issues_found": False, "warnings": [f"Sentry validation failed: {e}"], "broken_files": []}

def generate_architectural_graph(workspace_root: str) -> str:
    """
    Prompts Gemini to analyze the active Sentry Context cache and reconstruct the 
    dependencies and origins of the directives into a Mermaid diagram.
    Writes directly to docs/agent-directives-graph.md.
    """
    if not global_cache_mgr.client:
        return "Sentry Cache is offline or GEMINI_API_KEY missing. Cannot generate graph."

    if not global_cache_mgr.active_cache_name and not getattr(global_cache_mgr, 'inline_graph', None):
        return "No memory graph available."

    client = global_cache_mgr.client
    prompt = """GENERATE ARCHITECTURAL GRAPH:

Using the entire workspace graph, generate a single comprehensive Mermaid `graph TD` diagram that maps out ALL extracted strict directives, instructions, and hints.

1. Group the origin files in a `subgraph Codebase Files`.
2. Group the nodes for rules in a `subgraph Agent Rules` (broken down into Directives, Instructions, Hints).
3. Group related core themes into a `subgraph Core Concepts`, and link the rules to those concepts.
4. Draw arrows from the files to the rules they contain (`-- "contains" -->`).
5. Output ONLY the raw markdown containing the title `# Agent Directives Graph`, a brief description, and the ````mermaid` codeblock. Do not include any other markdown chat formatting around the document.
6. CRITICAL: Do NOT use literal double quotes (") inside node labels. Convert all inner double quotes to single quotes (') so the Mermaid parser does not crash.
"""
    try:
        if global_cache_mgr.active_cache_name:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    cached_content=global_cache_mgr.active_cache_name,
                    temperature=0.0
                )
            )
        else:
            inline_prompt = f"{SENTRY_SYSTEM_INSTRUCTION}\n\nWORKSPACE GRAPH:\n{global_cache_mgr.inline_graph}\n\n{prompt}"
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=inline_prompt,
                config=types.GenerateContentConfig(temperature=0.0)
            )

        result = response.text
        
        # Safety net to fix unescaped double quotes inside Mermaid labels
        result = re.sub(r'\["(.*?)"\]', lambda m: '["' + m.group(1).replace('"', "'") + '"]', result)
        
        out_path = os.path.join(workspace_root, "docs", "agent-directives-graph.md")
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as fw:
            fw.write(result.strip())
        logger.info(f"Graph successfully written to {out_path}")
        return "Graph successfully generated."
    except Exception as e:
        logger.error(f"Sentry graph generation failed: {e}")
        return f"Sentry graph generation failed: {e}"

@app.post("/a2a/message")
async def receive_message(message: A2AMessage):
    logger.info(f"Received A2A message from {message.sender_id} to {message.target_id}")
    try:
        action = message.payload.get("action")
        workspace_root = message.payload.get("workspace_root", "/workspace")
        
        if action == "refresh_memory":
            logger.info("Rebuilding persistent workspace memory graph...")
            refresh_workspace_memory(workspace_root)
            return {"status": "success", "response_payload": {"message": "Memory graph refreshed and cached."}}
            
        elif action == "get_advice":
            draft = message.payload.get("draft_instruction", "")
            target_file = message.payload.get("target_filepath", "Unknown")
            advice = advise_on_instruction(draft, target_file)
            return {"status": "success", "response_payload": {"advice": advice}}
            
        elif action == "validate_file":
            filepath = message.payload.get("filepath")
            if not os.path.exists(filepath):
                raise HTTPException(status_code=404, detail="File not found")
            
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
                
            fixed_content = validate_and_fix_file(filepath, content)
            if fixed_content and fixed_content != content:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(fixed_content)
                return {"status": "success", "response_payload": {"status": "fixed"}}
            return {"status": "success", "response_payload": {"status": "clean"}}

        elif action == "generate_graph":
            logger.info("Generating architectural graph...")
            msg = generate_architectural_graph(workspace_root)
            return {"status": "success", "response_payload": {"message": msg}}

        elif action == "validate_workspace":
            logger.info("Initiating holistic workspace validation...")
            data = validate_workspace(workspace_root)
            return {"status": "success", "response_payload": data}

        else:
            return {"status": "ignored", "message": "Action not recognized by Sentry."}
            
    except Exception as e:
        logger.error(f"Failed to process A2A message: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal Sentry execution failed")

if __name__ == '__main__':
    # When spinning up, if we have a workspace mounted, immediately build logic cache
    # This works in isolated docker if mapped to /workspace.
    if os.path.exists("/workspace") and "GEMINI_API_KEY" in os.environ:
        refresh_workspace_memory("/workspace")
        
    port = int(os.environ.get('PORT', 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)