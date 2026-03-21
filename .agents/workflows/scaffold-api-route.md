---
description: How to scaffold a new Next.js App Router API Route with standard Wot-Box boilerplate
---
// turbo-all

This workflow is entirely auto-running to maximize velocity.

1. Parse the requested route path (e.g. `items/upload`).
2. Run standard bash commands to create the directory structure `app/api/{route}/`.
3. Create the `route.ts` file.
4. Inject standard Next.js App Router API boilerplate template containing a `GET` and `POST` method.
5. Ensure NextResponse is imported from `next/server`.
6. Inject basic boilerplate error handling (`try/catch` resolving to a 500 JSON response).


> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.
