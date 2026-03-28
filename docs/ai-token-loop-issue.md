# AI Token Generation Loop Resolution

## The Problem

During interactive sessions, the underlying AI models (like Gemini) would occasionally become trapped in infinite generation loops. The model would repeatedly predict the exact same sequence of closing meta-tokens (e.g., `Done. End. Bye. Done. End.`), consuming large amounts of API quota and locking up the UI or the autonomous swarm workers.

## Root Causes

1. **The Auto-Regressive Trap:** LLMs predict the next token based entirely on probability. Once a model outputs a sequence like "Done. End.", those tokens forcefully skew the probability distribution toward predicting them again. Without intervention, this forms a runaway feedback loop.
2. **Loss of Stop Sequences:** This typically happens when internal LLM parser formatting (e.g., the internal thought process or tool-call syntax) becomes corrupted. Suppose a tool call has a syntax error mid-generation; the system parser may fail to trigger the required safety breakpoints that instruct the model to "stop generating and yield to the user."

## Resolution: The "Belt-and-Braces" Approach

To permanently eradicate this issue across the AI Hub's architecture, we implemented a multi-layered defense-in-depth ("belt-and-braces") strategy. This tackles the problem at the core API layer, and provides an active circuit breaker at the containerized terminal layer.

### 1. Global API Inference Hardening (`lib/ai/inference.ts`)
We updated the Genkit inference wrapper (`ai.generate`) to enforce strict API constraints uniformly across all hub interactions:
- **`maxOutputTokens`: 8192** - Acts as a hard fail-safe so that even if all other protections fail, the generation will hit a ceiling and the API call will terminate, preserving quota.
- **Token Penalties (`presencePenalty: 0.2`, `frequencyPenalty: 0.2`)** - Mathematically discourages the AI from repeatedly choosing the exact same words or tokens in a long sequence.
- **Hard `stopSequences`** - The configuration now explicitly passes known LLM exit sequences (`<|end_of_turn|>`, `<|end_tool|>`, `Done. End. Bye.`, etc.) directly to the model Provider. When the model tries to output these, generation immediately cuts off.

### 2. The Streaming N-Gram Watchdog (`tools/docker-gemini-cli/src/`)
Because swarm workers communicate with interactive CLI containers (via pseudo-terminals / PTYs), API-level configurations alone aren't always enough to stop loops happening *inside* external CLI tools. We built a real-time monitor into the container middleware.

- **Pattern Interception (`watchdog.py`):** As the CLI streams characters out, the `StreamingNGramWatchdog` buffers and continuously tokenizes the last 4096 characters on word boundaries.
- **N-Gram Detection:** It analyzes sliding windows (1 to 10 words long). If the exact identical string repeats consecutively 4 or more times, it flags the sequence as a runaway loop.
- **Circuit Breaking (`pty_manager.py`):** The moment the watchdog triggers, the middleware forcefully injects the string `\nYour output is flagged for looping content\n` directly into the terminal input buffer. This acts as a shock to the LLM's context, instantly breaking the autoregressive probability chain, forcing it to reset its trajectory and recover gracefully instead of locking up the session.
