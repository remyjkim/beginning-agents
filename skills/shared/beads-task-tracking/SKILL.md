---
name: beads-task-tracking
description: Use when a project uses Beads (`bd`) for issue tracking, task handoff, agent memory, or work claiming.
---

# Beads Task Tracking

Use Beads when the project has `.beads/`, when the user mentions `bd`, or when work should be tracked as issues/tasks instead of ad hoc TODOs.

## Core Workflow

Prefer non-interactive, machine-readable commands:

```bash
bd ready --json
bd create "Title" --type task --priority 2 --json
bd update <id> --claim --json
bd close <id> --reason "completed" --json
bd doctor --json
```

Run this when you need the complete current workflow context:

```bash
bd prime
```

## Rules

- Use `bd ready --json` before choosing new work when the project is Beads-managed.
- Claim work with `bd update <id> --claim --json` before making substantive changes.
- Create new issues with `bd create ... --json` when new work or defects are discovered.
- Close completed work with `bd close <id> --reason "..." --json`.
- Avoid interactive `bd edit`; use explicit update commands instead.
- Do not run `bd init --force` unless the user explicitly asks for destructive reinitialization.
- Do not run `bd doctor --fix` unless the user explicitly asks for repair.
