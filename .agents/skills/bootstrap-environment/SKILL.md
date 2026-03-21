---
name: Bootstrap Environment
description: Autonomously bootstraps the development environment, installing all required dependencies and logging into external services (Git, Google Cloud).
---

# Bootstrap Environment Skill

This skill is designed to set up a clean or fresh cloned repository for development. It triggers an interactive initialization script that automates the setup of necessary tooling.

When instructed to bootstrap the environment or set up the repository, perform the following steps:

1. **Verify State**: Confirm that the user wants to bootstrap the environment. It is a good idea to ensure you have a clear terminal.
2. **Execute Script**: Run the following command in the terminal to start the bootstrap process:
   ```bash
   npm run bootstrap
   ```
   *Note: Because this script is interactive, it may ask for user input such as Git credentials or Google Cloud login prompts. Read the terminal output and use the `send_command_input` tool when the script asks questions.*
3. **Prompt Handling**:
   - For Git configuration, provide the necessary information if it asks.
   - For Google Cloud, if the script asks "Would you like to run `gcloud auth login` now? (y/N)", provide 'y' if authentication is needed. Note that `gcloud auth login` will open a browser window for the user to complete the login on their machine.

4. **Completion**: Once the terminal output indicates success (`✔ Bootstrap Complete! Your workspace is ready.`), report back to the user that the environment is fully bootstrapped.

**IMPORTANT:** Always read the standard output and ensure the script doesn't exit with errors. If it fails (e.g., missing `gcloud` CLI), let the user know what dependency is missing on their machine.


> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.
