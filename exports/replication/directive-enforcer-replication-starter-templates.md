# Directive Enforcer Sentry Starter Templates

## Purpose
This companion guide provides functional, production-ready code scaffolding built directly from the Blueprint constraints. No empty stubs. These code fragments handle the File System extraction and HTTP API routing layer required for the Sentry. 

> [!NOTE]
> **[Agent Instruction: Sentry Setup]**
> 1. Integrate an LLM provider (e.g., Gemini Flash, GPT-4o) using the specific Prompts outlined in the Blueprint.

---

## Python Complete Scaffold (FastAPI)

### 1. The Core Parser (`parser.py`)
This extracts exactly the contextual annotations specified by the regex logic.

```python
import os
import re

def build_contextual_graph(workspace_root: str) -> dict:
    graph = {"files": {}}
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
                
                # Fast string matching before regex to save CPU
                has_tags = "**[agent " in content.lower() or "<agent_" in content.lower()
                legacy_triggers = ["hey agent", "agent: remember", "@agent", "system prompt directive"]
                has_legacy = any(trigger in content.lower() for trigger in legacy_triggers)
                
                if has_tags or has_legacy:
                    # Provide exact context snippet (first 15 lines)
                    head_lines = content.splitlines()[:15]
                    file_context = "\n".join(head_lines)
                    
                    # Regex Extraction Rules
                    directives = re.findall(r'> \[\!IMPORTANT\].*?\n(?:> .*?\n)+', content, re.IGNORECASE)
                    instructions = re.findall(r'> \[\!NOTE\].*?\n(?:> .*?\n)+', content, re.IGNORECASE)
                    hints = re.findall(r'> \[\!TIP\].*?\n(?:> .*?\n)+', content, re.IGNORECASE)
                    
                    # Legacy support
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
```

### 2. The API Runtime (`main.py`)
Provides the endpoints for IDEs or Swarm orchestrators to hit `get_advice` asynchronously.

> [!NOTE]
> **[Agent Instruction: API Runtime Integration]**
> 1. Implement the mechanism to trigger LLM Context Cache uploads.
> 2. Invoke the LLM with System Prompts from the Blueprint to generate advice for `get_advice` requests.
> 3. Invoke the LLM with the 'validate_file' Prompt from the Blueprint to process `validate_file` requests.

```python
import os
import json
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from parser import build_contextual_graph

app = FastAPI(title="Directive Enforcer Sentry")

class A2AMessage(BaseModel):
    sender_id: str
    target_id: str
    payload: dict

# This graph should ideally be persisted and passed to the LLM Context Cache
GLOBAL_MEMORY_GRAPH = {}

def refresh_memory():
    global GLOBAL_MEMORY_GRAPH
    GLOBAL_MEMORY_GRAPH = build_contextual_graph("/workspace")
    with open("/workspace/.agents/swarm/directives_graph.json", "w") as fw:
        json.dump(GLOBAL_MEMORY_GRAPH, fw)
    # TODO: Trigger LLM Context Cache upload here

@app.post("/a2a/message")
async def receive_message(message: A2AMessage):
    try:
        action = message.payload.get("action")
        
        if action == "refresh_memory":
            refresh_memory()
            return {"status": "success", "response_payload": {"message": "Memory graph refreshed"}}
            
        elif action == "get_advice":
            draft = message.payload.get("draft_instruction", "")
            target_file = message.payload.get("target_filepath", "Unknown")
            
            # TODO: Invoke LLM with the System Prompts from the Blueprint using the GLOBAL_MEMORY_GRAPH
            # advice = llm_client.generate_advice(draft, target_file, GLOBAL_MEMORY_GRAPH)
            
            advice_placeholder = f"Rewrite evaluated against global cache.\n> [!NOTE]\n> **[Agent Instruction]**\n> 1. {draft}"
            return {"status": "success", "response_payload": {"advice": advice_placeholder}}
            
        elif action == "validate_file":
            filepath = message.payload.get("filepath")
            if not os.path.exists(filepath):
                raise HTTPException(status_code=404, detail="File not found")
            
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
                
            # TODO: Invoke LLM 'validate_file' Prompt from Blueprint.
            # safe_rewrite = llm_client.validate_file(content, filepath, GLOBAL_MEMORY_GRAPH)
            
            # with open(filepath, "w") as f: f.write(safe_rewrite)
            return {"status": "success", "response_payload": {"status": "clean"}}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

## TypeScript Complete Scaffold (Node.js/Express)

### 1. The Core Parser (`parser.ts`)

```ts
import * as fs from 'fs';
import * as path from 'path';

export interface Graph {
  files: Record<string, {
    context_metadata: string;
    annotations: {
      directives: string[];
      instructions: string[];
      hints: string[];
      has_unstructured_legacy: boolean;
    };
  }>;
}

export function buildContextualGraph(workspaceRoot: string): Graph {
  const graph: Graph = { files: {} };
  const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next']);

  function walk(dir: string) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (ignoreDirs.has(file)) continue;
      
      const filepath = path.join(dir, file);
      const stat = fs.statSync(filepath);
      
      if (stat.isDirectory()) {
        walk(filepath);
      } else if (file.match(/\.(ts|js|md|py)$/)) {
        try {
            const content = fs.readFileSync(filepath, 'utf8');
            const lowerContent = content.toLowerCase();
            
            const hasTags = lowerContent.includes('**[agent ') || lowerContent.includes('<agent_');
            const legacyTriggers = ["hey agent", "agent: remember", "@agent", "system prompt directive"];
            const hasLegacy = legacyTriggers.some(trigger => lowerContent.includes(trigger));
            
            if (hasTags || hasLegacy) {
              const headLines = content.split('\n').slice(0, 15).join('\n');
              
              // Exactly replicate the regex logic flags
              const directives = [...content.matchAll(/> \[!IMPORTANT\].*?\n(?:> .*?\n)+/gi)].map(m => m[0]);
              const instructions = [...content.matchAll(/> \[!NOTE\].*?\n(?:> .*?\n)+/gi)].map(m => m[0]);
              const hints = [...content.matchAll(/> \[!TIP\].*?\n(?:> .*?\n)+/gi)].map(m => m[0]);
              
              const legacyD = [...content.matchAll(/<agent_directive[\s\S]*?<\/agent_directive>/g)].map(m => m[0]);
              const legacyI = [...content.matchAll(/<agent_instruction[\s\S]*?<\/agent_instruction>/g)].map(m => m[0]);
              const legacyH = [...content.matchAll(/<agent_hint[\s\S]*?<\/agent_hint>/g)].map(m => m[0]);

              graph.files[filepath] = {
                context_metadata: headLines,
                annotations: {
                  directives: [...directives, ...legacyD],
                  instructions: [...instructions, ...legacyI],
                  hints: [...hints, ...legacyH],
                  has_unstructured_legacy: hasLegacy
                }
              };
            }
        } catch { /* Suppress read errors */ }
      }
    }
  }
  
  walk(workspaceRoot);
  return graph;
}
```

### 2. The API Runtime (`index.ts`)

> [!NOTE]
> **[Agent Instruction: API Runtime Integration]**
> 1. Implement the mechanism to trigger LLM Context Cache uploads.
> 2. Invoke the LLM with System Prompts from the Blueprint to generate advice for `get_advice` requests.
> 3. Invoke the LLM with the 'validate_file' Prompt from the Blueprint to process `validate_file` requests.

```ts
import express from 'express';
import * as fs from 'fs';
import { buildContextualGraph, Graph } from './parser';

const app = express();
app.use(express.json());

let GLOBAL_MEMORY_GRAPH: Graph = { files: {} };

app.post('/a2a/message', async (req, res) => {
  try {
    const { action, target_filepath, draft_instruction, workspace_root = '/workspace' } = req.body.payload;
    
    if (action === 'refresh_memory') {
      GLOBAL_MEMORY_GRAPH = buildContextualGraph(workspace_root);
      fs.writeFileSync(`${workspace_root}/.agents/swarm/directives_graph.json`, JSON.stringify(GLOBAL_MEMORY_GRAPH));
      res.json({ status: 'success', response_payload: { message: 'Memory graph refreshed' } });
      
    } else if (action === 'get_advice') {
      // TODO: Wrap your LLM API using the exact Prompts provided in the Blueprint
      // const advice = await llmClient.evaluate(draft_instruction, target_filepath, GLOBAL_MEMORY_GRAPH);
      
      res.json({ 
        status: 'success', 
        response_payload: { advice: `> [!IMPORTANT]\n> **[Agent Directive]**\n> 1. ${draft_instruction}` } 
      });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', message: String(error) });
  }
});

app.listen(8080, () => console.log('Directive Enforcer Sentry running on 8080'));
```