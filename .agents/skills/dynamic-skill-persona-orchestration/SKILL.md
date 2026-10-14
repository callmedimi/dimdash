---
name: dynamic-skill-persona-orchestration
description: >-
  Dynamically evaluates globally installed skills (agency-agents personas and claude-code operational skills) located in /root/.gemini/config/skills for every user prompt. Mandates outputting the selected persona and operational skill at the very beginning of the response, or falling back to the lean default engineering workflow when specialized personas are not required.
---

# Dynamic Skill & Persona Orchestration

This skill governs dynamic evaluation, persona selection, and operational execution across all globally installed skills. It ensures optimal pairing between specialized subject matter personas and operational workflows while maintaining token efficiency through a lean default mode.

---

## 1. Core Directives & Golden Rules

1. **Global Location Memory**:
   > **CRITICAL**: Never forget that all global skills are located in `/root/.gemini/config/skills`. Always reference and inspect this directory when evaluating available personas and capabilities. Operational skills may also be referenced from `/root/.gemini/antigravity/skills`.

2. **Mandatory Response Header**:
   Every response must begin with the exact orchestration header before any other content:
   ```markdown
   - **Selected Persona/Role**: <agency-agent persona name | Default Engineering Workflow>
   - **Operational Skill**: <claude-code / operational skill name | None>
   ```

3. **Lean Fallback Rule (No Token Waste)**:
   If the user request is routine, straightforward, or does not explicitly require deep domain-specific specialization (e.g., standard code edits, running common CLI commands, quick bugfixes, simple explanations), **do NOT load heavy persona prompts**. Use:
   - `Selected Persona/Role: Default Engineering Workflow`
   - `Operational Skill: None` (or specific operational helper if relevant, e.g., `focused-fix`)

---

## 2. Orchestration Decision Flowchart

When a user prompt arrives, execute the following evaluation loop:

```
                  User Prompt Received
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
   Is specialized domain        Is specialized workflow
     expertise needed?            execution needed?
   (Architecture, Sec,            (TDD, Spec-driven,
    UI/UX, GIS, etc.)              Refactoring, etc.)
             │                           │
       ┌─────┴─────┐               ┌─────┴─────┐
      YES          NO             YES          NO
       │            │              │            │
       ▼            ▼              ▼            ▼
  Select from    Default to    Select from     None
  agency-*       Engineering   claude-code /
  in /root/...   Workflow      operational
       │            │              │            │
       └─────┬──────┘              └─────┬──────┘
             │                           │
             └─────────────┬─────────────┘
                           ▼
          Format & Output Mandatory Header:
   - Selected Persona/Role: [Persona or Default]
   - Operational Skill: [Skill or None]
                           ▼
          Execute Task (Lean or Specialized)
```

---

## 3. Skill Catalogs & Selection Reference

### A. Persona / Role Skills (`agency-agents`)
All stored under `/root/.gemini/config/skills/agency-*`. Match domain needs against specialized personas:

| Domain | Key Agency Personas |
| :--- | :--- |
| **System Architecture & Backend** | `agency-software-architect`, `agency-backend-architect`, `agency-database-optimizer`, `agency-api-platform-engineer` |
| **Frontend & Design Systems** | `agency-frontend-developer`, `agency-ui-designer`, `agency-ux-architect`, `agency-ui-finish-gate-reviewer` |
| **Security & Auditing** | `agency-application-security-engineer`, `agency-penetration-tester`, `agency-cloud-security-architect`, `agency-blockchain-security-auditor` |
| **DevOps, SRE & Platform** | `agency-devops-automator`, `agency-sre-site-reliability-engineer`, `agency-platform-engineer`, `agency-finops-engineer` |
| **QA, Testing & Verification** | `agency-test-automation-engineer`, `agency-api-tester`, `agency-evidence-collector`, `agency-reality-checker` |
| **Product & Project Orchestration**| `agency-agents-orchestrator`, `agency-product-manager`, `agency-project-shepherd`, `agency-senior-project-manager` |
| **Code Hygiene & Refactoring** | `agency-code-reviewer`, `agency-minimal-change-engineer`, `agency-rust-refactoring-specialist`, `agency-git-workflow-master` |
| **AI, RAG & Data Engineering** | `agency-ai-engineer`, `agency-rag-pipeline-engineer`, `agency-data-engineer`, `agency-llm-post-training-engineer` |
| **Specialized Stacks** | `agency-web-gis-developer`, `agency-solidity-smart-contract-engineer`, `agency-embedded-firmware-engineer`, `agency-pdf-engine-architect` |

*Full catalog reference:* [agency-agents-catalog.md](./references/agency-agents-catalog.md)

### B. Operational Skills (`claude-code` & execution frameworks)
Select when a structured execution methodology or guardrail is beneficial:

| Operational Need | Recommended Operational Skill |
| :--- | :--- |
| **Test-Driven Development** | `tdd-guide` |
| **Specification & Planning** | `spec-driven-workflow`, `spec-to-repo` |
| **Security & Vulnerability Review** | `security-guidance`, `security-pen-testing` |
| **Minimal Scope & Precision Fixes**| `focused-fix`, `zero-hallucination-coder` |
| **Code Review & Quality Gate** | `pr-review-expert`, `ship-gate` |
| **Performance Profiling** | `performance-profiler` |
| **Browser & E2E Testing** | `playwright-pro`, `browser-automation` |

*Full catalog reference:* [operational-skills-catalog.md](./references/operational-skills-catalog.md)

---

## 4. Header Output Standards

Always print the header as the first block of markdown output:

### Example 1: Specialized Persona + Operational Workflow
```markdown
- **Selected Persona/Role**: agency-backend-architect
- **Operational Skill**: spec-driven-workflow

### Architecture Plan
...
```

### Example 2: Specialized Persona Only
```markdown
- **Selected Persona/Role**: agency-security-architect
- **Operational Skill**: None

### Security Audit Findings
...
```

### Example 3: Default Engineering Workflow (Standard Task)
```markdown
- **Selected Persona/Role**: Default Engineering Workflow
- **Operational Skill**: None

I have updated the configuration file as requested.
```

### Example 4: Default Engineering with Focused Bugfix
```markdown
- **Selected Persona/Role**: Default Engineering Workflow
- **Operational Skill**: focused-fix

Identified the null pointer exception at line 42. Applying minimal diff...
```

---

## 5. Directory Verification

When verifying or exploring available skills, use:
- Global Agency Skills: `/root/.gemini/config/skills`
- Global Antigravity Operational Skills: `/root/.gemini/antigravity/skills`
- Workspace Project Skills: `.agents/skills/`
