# Directive Enforcer Sentry Starter Templates

## Purpose
This companion guide turns the blueprint into concrete starter scaffolds for two common ecosystems: Python (ideal for data ops and ML integration) and TypeScript (ideal for Node/Express environments). These templates are entirely toolchain-agnostic implementations of the `get_advice` abstraction layer.

---

## Python Starter Template (FastAPI)

### Suggested Structure
```text
sentry_py/
  app/
    core/
      parser.py
      graph_builder.py
    api/
      routes.py
    adapters/
      llm_adapter.py (Defines the Provider-Agnostic Context Interface)
    main.py
```

### Core Parser Skeleton (`app/core/parser.py`)
```python
import os
import re
import json
from contextlib import suppress

def extract_annotations(workspace_root: str) -> dict:
    graph = {"files": {}}
    ignore = {"node_modules", ".git", ".venv", "dist"}
    
    for root, dirs, files in os.walk(workspace_root):
        dirs[:] = [d for d in dirs if d not in ignore]
        for f in files:
            if not f.endswith((".md", ".ts", ".py", ".js")):
                continue
            
            filepath = os.path.join(root, f)
            with suppress(Exception):
                with open(filepath, 'r', encoding='utf-8') as file_obj:
                    content = file_obj.read()
                
                # Check for Meta-Syntax Markers
                if "**[agent " in content.lower():
                    context = "\n".join(content.splitlines()[:15])
                    
                    dirs = re.findall(r'> \[\!IMPORTANT\].*?\n(?:> .*?\n)+', content, re.IGNORECASE)
                    insts = re.findall(r'> \[\!NOTE\].*?\n(?:> .*?\n)+', content, re.IGNORECASE)
                    hints = re.findall(r'> \[\!TIP\].*?\n(?:> .*?\n)+', content, re.IGNORECASE)
                    
                    graph["files"][filepath] = {
                        "context_metadata": context,
                        "annotations": {
                            "directives": dirs,
                            "instructions": insts,
                            "hints": hints
                        }
                    }
    return graph
```

### Provider Adapter (`app/adapters/llm_adapter.py`)
```python
class LLMAdapter:
    def __init__(self, provider_client):
        self.client = provider_client
        self.active_context_cache = None

    def upload_context_graph(self, graph_path: str):
        # Stub: If your LLM provider supports Prompt Caching or Context Caching, hook it here.
        # Otherwise, just read the file into memory.
        pass

    def generate_advice(self, draft_instruction: str, target_file: str, inline_graph_json: str = None) -> str:
        # Stub: Construct prompt with the 3 criteria rules (Loops, Conflicts, Context Alignment).
        # Inject inline_graph_json if active_context_cache is None.
        prompt = f"Graph: {inline_graph_json}\nDraft: {draft_instruction}\nTarget: {target_file}"
        return f"[MOCK REWRITE] > [!NOTE]\n> **[Agent Instruction: Placeholder]**\n> 1. {draft_instruction}"
```

### FastAPI Entry (`app/main.py`)
```python
from fastapi import FastAPI
from pydantic import BaseModel
from app.core.parser import extract_annotations
from app.adapters.llm_adapter import LLMAdapter

app = FastAPI()
llm = LLMAdapter(None)

class SentryPayload(BaseModel):
    action: str
    target_filepath: str = ""
    draft_instruction: str = ""

@app.post("/a2a/message")
async def handle_message(req: SentryPayload):
    if req.action == "refresh_memory":
        graph = extract_annotations("/workspace")
        # Save to disk and upload to adapter
        return {"status": "Cache rebuilt"}
        
    if req.action == "get_advice":
        advice = llm.generate_advice(req.draft_instruction, req.target_filepath)
        return {"status": "success", "advice": advice}
```

---

## TypeScript Starter Template (Express)

### Suggested Structure
```text
sentry_ts/
  src/
    core/
      parser.ts
      graphBuilder.ts
    api/
      routes.ts
    adapters/
      llmAdapter.ts
    index.ts
```

### Core Parser (`src/core/parser.ts`)
```ts
import * as fs from 'fs';
import * as path from 'path';

export function extractAnnotations(workspaceRoot: string): Record<string, any> {
  const graph: Record<string, any> = { files: {} };
  const ignore = new Set(['node_modules', '.git', 'dist']);

  function walk(dir: string) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (ignore.has(file)) continue;
      
      const filepath = path.join(dir, file);
      const stat = fs.statSync(filepath);
      
      if (stat.isDirectory()) {
        walk(filepath);
      } else if (file.match(/\.(ts|js|md|py)$/)) {
        const content = fs.readFileSync(filepath, 'utf8');
        if (content.toLowerCase().includes('**[agent ')) {
           const context = content.split('\n').slice(0, 15).join('\n');
           // Regex extraction stubs
           graph.files[filepath] = {
             context_metadata: context,
             annotations: { directives: [], instructions: [], hints: [] }
           };
        }
      }
    }
  }
  
  walk(workspaceRoot);
  return graph;
}
```

### Express Entry (`src/index.ts`)
```ts
import express from 'express';
import { extractAnnotations } from './core/parser';

const app = express();
app.use(express.json());

app.post('/a2a/message', (req, res) => {
  const { action, target_filepath, draft_instruction } = req.body.payload;
  
  if (action === 'refresh_memory') {
    const graph = extractAnnotations('/workspace');
    // Save graph and cache
    res.json({ status: 'Cache rebuilt' });
  } else if (action === 'get_advice') {
    // LLM invocation stub
    const advice = `> [!NOTE]\n> **[Agent Instruction]**\n> 1. ${draft_instruction}`;
    res.json({ status: 'success', advice });
  }
});

app.listen(8080, () => console.log('Sentry listening on 8080'));
```
