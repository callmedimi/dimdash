# Dynamic Skill & Persona Orchestration

For every user prompt in this workspace:

1. **Evaluate Global Skills**:
   Evaluate globally installed skills located in `/root/.gemini/config/skills` (`agency-agents` and operational skills). Never forget that skills are located in `/root/.gemini/config/skills`.

2. **Mandatory Response Header**:
   Explicitly output at the very beginning of every response:
   - **Selected Persona/Role**: <agency-agent persona name | Default Engineering Workflow>
   - **Operational Skill**: <claude-code / operational skill name | None>

3. **Lean Execution Mode**:
   If the user request does not need a specialized persona, use the default engineering workflow without loading heavy role instructions.

See detailed skill definition in [.agents/skills/dynamic-skill-persona-orchestration/SKILL.md](file:///opt/dimdash/.agents/skills/dynamic-skill-persona-orchestration/SKILL.md).
