# Directive Enforcer Agent Documentation

The **Directive Enforcer** is a Python-based A2A worker agent built into `hlbw-ai-hub`. Its primary role is to enforce unambiguous, strict, Markdown Callout structures (Meta-Syntax) on any agent instructions, hints, or directives embedded across the workspace artifacts.

The enforcer resolves ambiguity by rejecting loose natural language prompts (e.g., *"hello agent, don't forget to"*), preventing infinite LLM loops, and consolidating conflicting logic.

## 1. The Three Tiers of Automated Execution

Because AI agents can easily get confused by legacy comments like `"make sure to run the tests"`, the Directive Enforcer forces all instructions into three distinct, structured Markdown alerts: when modifying configuration files, boilerplates, or documentation.

### The `<agent_directive>` (Markdown `> [!IMPORTANT]`)

These are explicit constraints that act as hard guardrails. They map directly to specific architectural domains (e.g., Security, Formatting, Logic).

**Example:**

```markdown
> [!IMPORTANT]
> **[Agent Directive: Security]**
> Agents MUST NEVER commit raw Stripe API keys to any branch.
```

### The `<agent_instruction>` (Markdown `> [!NOTE]`)

These map to strict execution workflows, breaking down complex tasks into specific chronological steps.

**Example:**

```markdown
> [!NOTE]
> **[Agent Instruction: Bootstrapping Service]**
> 1. Read the environment file configuration.
> 2. Spin up the docker-compose stack.
> 3. Verify the container health endpoint returns 200.
```

### The `<agent_hint>` (Markdown `> [!TIP]`)

These provide vital downstream situational context. They are non-blocking observations that help a future agent safely navigate the codebase.

**Example:**

```markdown
> [!TIP]
> **[Agent Hint: Context]**
> The authentication module is mocked in local development. Real Google SSO tokens will intentionally fail validation until deployed.
```

## 2. Operating Architecture (The Sentry)

The Directive Enforcer no longer runs as a sporadic CLI command. It operates as a continuous, Dockerized A2A Sentry microservice.

### Holistic Context Caching

On boot, the Sentry container maps the repository and extracts all agent annotations across the codebase into a Persistent JSON Graph. It then uploads this graph into a **Google GenAI Context Cache**, grating the LLM cheap and instantaneous "omniscience" over every rule in every file. (If the workspace is too small for context caching, it automatically routes the logic as an inline string payload).

### Continuous Swarm Integration

During agent swarming operations, the Master Agent Coordinator automatically invokes the Sentry just before a Git merge occurs (`scripts/swarm/manage-worktree.ts`). The Sentry evaluates all modified files for conflicting logic, redundant guidelines, or malformed tags, and automatically rewrites the files safely before they touch the mainline branch.

### Advisory Protocol (`get_advice`)

The Sentry's `http://localhost:8080/a2a/message` endpoint offers LLM-driven architectural advice on draft instructions, leveraging the entire cached workspace context. For the explicit directives on when and how agents MUST consult the Sentry, refer to the [Directive Enforcer Sentry Protocol](/workspace/docs/features/directive-enforcer-sentry.md) and the [Directive Enforcer Sentry Skill](/workspace/.agents/skills/directive-enforcer-sentry/SKILL.md).

For an in-depth explanation of the Sentry's automated validation rules, semantic logic enforcement, and the JSON payload schema, please refer to the **[Directive Enforcer Sentry Protocol](/workspace/docs/features/directive-enforcer-sentry.md)**.

---

## 3. Architecture & Location

The Directive Enforcer runs seamlessly alongside the rest of the node-based Master Control Plane but uses an isolated Python ecosystem for high-compute LLM processing.

*   **Worker Source Code**: `.agents/workers/directive-enforcer/main.py`
*   **Docker Container**: `.agents/workers/directive-enforcer/Dockerfile`
*   **Dependencies**: Uses `requirements.txt` (FastAPI, opentelemetry, google-genai).
*   **Invocation**: Deployed via isolated Docker run mapping the workspace volume to `/workspace`. Listens continuously on Port `8080`.
*   **Worker Skill**: The semantic breakdown of the internal Sentry is in `.agents/skills/directive-enforcer/SKILL.md`.
*   **Advisory Caller Skill**: The required instructions for IDE agents / sub-agents to invoke the Sentry are maintained in **[`.agents/skills/directive-enforcer-sentry/SKILL.md`](/workspace/.agents/skills/directive-enforcer-sentry/SKILL.md)**.