import os
import glob
import re
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from otel_setup import init_telemetry
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from google import genai

# <agent_directive priority="HIGH" domain="Observability">
# DO NOT remove OpenTelemetry initialization.
# </agent_directive>
logger = init_telemetry("directive-enforcer")
app = FastAPI(title="Directive Enforcer Agent", description="A2A Worker to Audit and Enforce Agent Directives, Instructions, and Hints")

FastAPIInstrumentor.instrument_app(app)

# The rigid rules injected into the agent's context for checking compliance
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

class A2AMessage(BaseModel):
    sender_id: str
    target_id: str
    payload: dict
    metadata: dict = {}

def fix_file_with_llm(filepath, content):
    """
    Uses Gemini to rewrite the file content, enforcing unambiguous directives,
    preventing loops, resolving conflicting logic, and replacing legacy instructions.
    """
    if "GEMINI_API_KEY" not in os.environ:
        logger.error("GEMINI_API_KEY is not set. Cannot run in fix mode.")
        return content

    client = genai.Client()
    prompt = f"""You are the Directive Enforcer A2A Agent.
Your task is to review the following file content and enforce strict agent directives, instructions, and hints.

1. Find any unstructured, ambiguous, or legacy agent instructions (like 'Hey agent', 'Agent: remember to') and rewrite them into the precise Markdown structures defined below.
2. Evaluate ANY existing `**[Agent Directive:`, `**[Agent Instruction:`, `**[Agent Hint:`, or legacy XML tag variants like `<agent_directive>`.
   - Ensure they are up to date and aligned with the artifact they are embedded in.
   - Ensure they do not have logical loops.
   - Ensure they do not have conflicting logic or intent.
   - Make sure they have clear, unambiguous intent.
3. If they are flawed, rewrite them or resolve the conflict using the precise XML structures.

{DIRECTIVE_RULE}
{INSTRUCTION_RULE}
{HINT_RULE}

IMPORTANT RULES:
1. Output ONLY the raw content of the file. Do not wrap in ``` code blocks.
2. Preserve all other code, formatting, and logic exactly as it is.
3. Only modify the agent hints, instructions, and directives. If they use the old XML tags, you MUST translate them instantly to the new Markdown callout standard.

File Content:
{content}
"""
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt
        )
        result = response.text
        # Strip code block wrappers if the model accidentally included them
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
        logger.error(f"Failed to fix file with LLM: {str(e)}")
        return content

def generate_graph_with_llm(workspace_root, extracted_tags):
    """
    Passes all extracted agent annotations to Gemini to generate
    a comprehensive Mermaid relationship diagram.
    """
    if "GEMINI_API_KEY" not in os.environ:
        logger.error("GEMINI_API_KEY is not set. Cannot run in graph mode.")
        return

    client = genai.Client()
    
    docs_dir = os.path.join(workspace_root, "docs")
    os.makedirs(docs_dir, exist_ok=True)
    out_path = os.path.join(docs_dir, "agent-directives-graph.md")
    
    # We might have a LOT of tags, so we'll join them
    all_tags = "\n\n".join(extracted_tags)
    
    prompt = f"""You are an expert system mapping AI.
I have extracted all the strict Agent Directives, Instructions, and Hints from my workspace.
Your job is to generate a comprehensive Mermaid diagram (using `graph TD` or `graph LR`) that visualizes these rules, how they relate to the codebase, domains, actions, and each other.

Here are the extracted tags grouped by file:
{all_tags}

IMPORTANT RULES:
1. ONLY output the raw markdown for the file. 
2. Include a short `# Agent Directives Graph` title and a brief paragraph explaining the graph.
3. Then embed the ```mermaid codeblock containing the complete relationship diagram. Make sure to escape invalid characters inside node names. Do NOT output anything else.
"""
    try:
        print(f"Generating Mermaid graph via LLM from {len(extracted_tags)} files with tags...")
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt
        )
        
        with open(out_path, "w", encoding="utf-8") as fw:
            fw.write(response.text)
            
    except Exception as e:
        logger.error(f"Failed to generate graph with LLM: {str(e)}")

def scan_workspace_for_directives(workspace_root: str, mode: str = "identify"):
    """
    Scans the workspace for legacy unstructured hints and enforces the strict XML-style tags.
    In 'fix' mode, invokes the LLM to rewrite the artifact and overwrite the file.
    """
    results = {
        "valid_directives": 0,
        "valid_instructions": 0,
        "valid_hints": 0,
        "legacy_warnings": [],
        "files_fixed": 0
    }
    
    # We will search common textual files
    search_patterns = ["**/*.md", "**/*.ts", "**/*.js", "**/*.py"]
    
    for pattern in search_patterns:
        for filepath in glob.glob(os.path.join(workspace_root, pattern), recursive=True):
            if "node_modules" in filepath or ".venv" in filepath or ".next" in filepath:
                continue
                
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    original_content = f.read()
                    
                needs_fixing = False
                legacy_found = False
                
                # Enhanced heuristical check for unstructured guidance
                lines = original_content.split('\n')
                trigger_phrases = [
                    "hey agent", "agent: remember", "@agent", 
                    "system prompt directive", "instruct the ai", 
                    "instructions for the ai agent"
                ]
                for i, line in enumerate(lines):
                    lower_line = line.lower()
                    if any(trigger in lower_line for trigger in trigger_phrases):
                        if "**[agent " not in lower_line and "<agent_" not in lower_line:
                            legacy_found = True
                            results["legacy_warnings"].append(
                                f"File: {filepath}:{i+1} - Found unstructured agent guidance."
                            )
                
                # If there are existing tags or blockquotes, they might need conflict/loop resolution
                has_tags = "**[agent " in original_content.lower() or "<agent_" in original_content.lower()
                
                if legacy_found or has_tags:
                    if mode == "fix":
                        print(f"[{filepath}] Applying LLM fix...")
                        new_content = fix_file_with_llm(filepath, original_content)
                        if new_content and new_content != original_content:
                            with open(filepath, 'w', encoding='utf-8') as fw:
                                fw.write(new_content)
                            results["files_fixed"] += 1
                            # Update content variable so tally uses the new correct tags
                            original_content = new_content
                    elif mode == "graph" and has_tags:
                        # Extract the markdown callout blocks so we can build a graph
                        directives = re.findall(r'> \[\!IMPORTANT\].*?\n(?:> .*?\n)+', original_content, re.IGNORECASE)
                        instructions = re.findall(r'> \[\!NOTE\].*?\n(?:> .*?\n)+', original_content, re.IGNORECASE)
                        hints = re.findall(r'> \[\!TIP\].*?\n(?:> .*?\n)+', original_content, re.IGNORECASE)
                        
                        # Fallback for legacy xml temporarily
                        legacy_d = re.findall(r'<agent_directive.*?</agent_directive>', original_content, re.DOTALL)
                        legacy_i = re.findall(r'<agent_instruction.*?</agent_instruction>', original_content, re.DOTALL)
                        legacy_h = re.findall(r'<agent_hint.*?</agent_hint>', original_content, re.DOTALL)
                        
                        if directives or instructions or hints:
                            if "extracted_tags" not in results:
                                results["extracted_tags"] = []
                            
                            file_blocks = [f"File: {filepath}"]
                            file_blocks.extend(directives + legacy_d)
                            file_blocks.extend(instructions + legacy_i)
                            file_blocks.extend(hints + legacy_h)
                            results["extracted_tags"].append("\n".join(file_blocks))
                
                # Tally correct syntaxes
                results["valid_directives"] += len(re.findall(r'\*\*\[Agent Directive:', original_content, re.IGNORECASE))
                results["valid_instructions"] += len(re.findall(r'\*\*\[Agent Instruction:', original_content, re.IGNORECASE))
                results["valid_hints"] += len(re.findall(r'\*\*\[Agent Hint:', original_content, re.IGNORECASE))
                    
            except Exception as e:
                logger.warning(f"Could not read/process {filepath}: {e}")
                
    return results

@app.post("/a2a/message")
async def receive_message(message: A2AMessage):
    logger.info(f"Received A2A message from {message.sender_id} to {message.target_id}")
    try:
        action = message.payload.get("action")
        mode = message.payload.get("mode", "identify")
        
        if action == "enforce_directives":
            workspace_root = message.payload.get("workspace_root", "/app")
            logger.info(f"Scanning workspace {workspace_root} in mode '{mode}'...")
            
            audit_results = scan_workspace_for_directives(workspace_root, mode=mode)
            
            if mode == "graph" and "extracted_tags" in audit_results and audit_results["extracted_tags"]:
                generate_graph_with_llm(workspace_root, audit_results["extracted_tags"])
            
            if audit_results["legacy_warnings"] and mode == "identify":
                print(f"--- DIRECTIVE ENFORCER WARNINGS ---")
                for w in audit_results["legacy_warnings"]:
                    print(w)
                print(f"-----------------------------------")
            
            return {
                "status": "success",
                "delivered_to": message.target_id,
                "response_payload": audit_results
            }
        else:
            return {"status": "ignored", "message": "Action not recognized by this worker"}
            
    except Exception as e:
        logger.error(f"Failed to process A2A message: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal agent execution failed")

if __name__ == '__main__':
    import sys
    import argparse
    from dotenv import load_dotenv

    # Load local .env so GEMINI_API_KEY is available when running locally
    load_dotenv()

    if len(sys.argv) > 1 and sys.argv[1] == "--cli-run":
        parser = argparse.ArgumentParser()
        parser.add_argument("--cli-run", type=str, help="Workspace path to scan")
        parser.add_argument("--mode", type=str, default="identify", choices=["identify", "fix", "graph"])
        args = parser.parse_args()
        
        workspace_path = args.cli_run if args.cli_run else os.getcwd()
        mode = args.mode
        
        verb = "Enforcement" if mode == "fix" else ("Graph" if mode == "graph" else "Audit")
        print(f"Starting CLI {verb} run on {workspace_path} [Mode: {mode}]...")
        results = scan_workspace_for_directives(workspace_path, mode=mode)
        
        if mode == "graph" and "extracted_tags" in results and results["extracted_tags"]:
            generate_graph_with_llm(workspace_path, results["extracted_tags"])
            print("Graph successfully generated at docs/agent-directives-graph.md")
            sys.exit(0)
            
        print(f"Valid Directives: {results['valid_directives']}")
        print(f"Valid Instructions: {results['valid_instructions']}")
        print(f"Valid Hints: {results['valid_hints']}")
        
        if mode == "fix":
            print(f"Files Fixed: {results['files_fixed']}")
            sys.exit(0)
        else:
            if results['legacy_warnings']:
                print("\nWARNING: Found unstructured legacy guidance!")
                for w in results['legacy_warnings']:
                    print(f"  {w}")
                sys.exit(1)
            else:
                print("All clear! No legacy unstructured agent guides found.")
                sys.exit(0)
                
    port = int(os.environ.get('PORT', 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
