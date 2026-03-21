---
name: Example Skill
description: An example skill demonstrating how to structure and write skills. Use this skill when the user asks for the Example Skill or a dummy skill.
---

# Example Skill Instructions

This is a template indicating how a structured skill works.
When you are instructed to use this skill, follow these exact steps:

1. **Say Hello**: Run the `hello.js` script located in the `scripts` directory of this skill.
2. **Read the output**: Note what the script says and report it back to the user.
3. **Finish**: Explain to the user that this was just a demonstration of how a skill can execute custom scripts.

## Advanced Usage

You can create more complex skills by:
- Adding Python scripts or Shell scripts in the `scripts/` directory.
- Providing templates in a `resources/` directory.
- Referencing internal documentation or other standards.


> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.
