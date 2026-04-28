# Extensions Architecture Investigation: Beads And Parallel

## Purpose

This investigation evaluates how `beginning-harness` / `bgng` should support project-level external capability families under an `extensions` model, using Beads as the first concrete target and Parallel as the existing capability that should eventually move into the same architecture.

The goal is to clarify what should be built before writing an implementation plan.

## Current `bgng` Support

`bgng` currently supports several pieces that can be composed manually:

- packaged MCP registry in `mcp-servers.json`
- packaged target config in `config.json`
- per-project overrides in `<project>/.agents/bgng/config.json`
- repo-native skills under `skills/shared`
- package-backed skill bundles under `~/.agents/packages/skills`
- project-aware `sync`, `status`, and `doctor`

What does not exist yet:

- no `bgng extensions ...` command group
- no extension registry or extension metadata model
- no first-class Beads support
- no normalized extension status / doctor / setup lifecycle
- Parallel is represented as a special top-level config block rather than as a general extension

This means Beads can be integrated today only by manually adding a project MCP server or manually installing Beads outside `bgng`. That is not enough for a polished project-level feature.

## External Research: Beads

Primary sources:

- Beads docs introduction: https://gastownhall.github.io/beads/
- Beads installation docs: https://gastownhall.github.io/beads/getting-started/installation
- Beads quickstart: https://gastownhall.github.io/beads/getting-started/quickstart
- Beads IDE setup: https://gastownhall.github.io/beads/getting-started/ide-setup
- Beads Claude Code integration: https://gastownhall.github.io/beads/integrations/claude-code
- Beads MCP server docs: https://gastownhall.github.io/beads/integrations/mcp-server
- Beads GitHub repo: https://github.com/gastownhall/beads

Key findings:

- Beads is a project-local issue tracker and agent memory tool centered on the `bd` CLI.
- The documented quickstart is system install, then `bd init` inside each project.
- The recommended setup for shell-capable coding agents is CLI + hooks/rules.
- Beads positions MCP as the alternative for MCP-only environments.
- Beads has built-in `bd setup` recipes for multiple tools, including Claude, Cursor, Codex, Gemini, Aider, and others.
- Beads commands support structured output via `--json`, which is important for coding agents.
- Beads has rich diagnostics through `bd doctor`, including `--json` and `--agent`.
- Beads uses `.beads/` project state, with Dolt-backed storage.
- The npm package is `@beads/bd`, exposes `bd`, and is currently published.

Local command checks on this machine:

- `bd` is installed at `~/.local/bin/bd`.
- `bd version` reports `bd version 1.0.0 (Homebrew)`.
- `beads-mcp` is not installed.
- `bd setup --list` reports recipes including `claude`, `codex`, `cursor`, `gemini`, `aider`, `mux`, `opencode`, and `windsurf`.
- `bd init --help` shows non-interactive flags including `--quiet`, `--non-interactive`, `--skip-agents`, `--skip-hooks`, `--stealth`, `--shared-server`, `--role`, and setup-related options.
- `bd doctor --help` shows useful health modes including `--json`, `--agent`, `--dry-run`, `--check-health`, and `--server`.

## External Research: Parallel

Primary sources:

- Parallel developer tools overview: https://docs.parallel.ai/integrations/developer-quickstart
- Parallel CLI docs: https://docs.parallel.ai/integrations/cli
- Parallel agent skills docs: https://docs.parallel.ai/integrations/agent-skills
- Parallel MCP quickstart: https://docs.parallel.ai/integrations/mcp/quickstart

Key findings:

- Parallel recommends CLI + Skills for coding agents with terminal access.
- Parallel positions MCP for chat assistants and MCP-aware environments.
- Parallel CLI exposes broader API coverage than MCP, including APIs not available through MCP.
- Parallel has an existing local prerequisite and auth lifecycle: install CLI, then `parallel-cli login` or API key.
- Current `bgng` support already follows the right operational direction but does so through a special `parallel` config block and repo-native skills rather than a general extension model.

Local command checks on this machine:

- `parallel-cli` is installed at `~/.local/bin/parallel-cli`.
- `parallel-cli --help` lists `auth`, `login`, `search`, `extract`, `fetch`, `research`, `enrich`, `findall`, `monitor`, and related commands.

## Terminology Recommendation

Use `extensions`, not `integrations`.

Recommended distinction:

- `extension`: a reusable harness module managed by `bgng`
- `extension adapter`: the implementation code for one extension family
- `extension mode`: how the capability is exposed, such as CLI, skill, MCP, hooks, or project config
- `skill bundle`: npm-distributed skill content only
- `MCP server`: one possible tool transport, not the extension itself

This avoids conflating three different things:

- package-backed skill bundles
- MCP server definitions
- full external capability families like Beads and Parallel

## Proposed Extension Model

An extension should be a first-class domain object with:

- id
- display name
- description
- scope support: global, project, or both
- required external commands
- optional external commands
- default mode
- optional modes
- skills it provides or recommends
- MCP servers it can enable
- project setup actions
- status checks
- doctor checks
- docs URLs

Example conceptual shape:

```ts
interface ExtensionDefinition {
  id: string;
  displayName: string;
  scope: Array<"global" | "project">;
  defaultMode: "cli-skill" | "mcp" | "hybrid";
  commands: Array<{ name: string; required: boolean; installHint: string }>;
  skills: Array<{ name: string; source: "repo" | "package"; defaultIncluded: boolean }>;
  mcpServers: Array<{ name: string; defaultEnabled: boolean; scope: "global" | "project" }>;
  setupActions: Array<string>;
  docs: Array<{ label: string; url: string }>;
}
```

This does not need to be a JSON schema in v1. It can begin as typed in-repo definitions under `cli/core/extensions`.

## Recommended Command Surface

Add a new top-level group:

```bash
bgng extensions list
bgng extensions show <name>
bgng extensions status [name]
bgng extensions doctor [name]
bgng extensions setup <name>
```

For Beads-specific project setup, the ergonomic command would be:

```bash
bgng extensions setup beads
```

Optional flags for Beads:

- `--dry-run`
- `--json`
- `--target=codex|claude|cursor`
- `--mcp`
- `--stealth`
- `--skip-bd-init`
- `--skip-bd-setup`

Avoid a large command family at first. Extension setup should be discoverable through one verb with focused flags.

## Beads Extension Strategy

Beads should be a project-scoped extension.

Default mode:

- CLI + Beads-owned editor setup + optional `bgng` skill

Default setup should:

1. Verify `bd` exists.
2. Report installation hints if missing:
   - `brew install beads`
   - `npm install -g @beads/bd`
   - Beads install script, if the user chooses that path
3. Check whether the current project has `.beads/`.
4. If absent, run a non-interactive project init:
   - likely `bd init --quiet --non-interactive`
5. Run Beads-owned setup checks for selected targets:
   - `bd setup codex --check`
   - `bd setup claude --check`
   - `bd setup cursor --check`
6. Optionally run setup recipes:
   - `bd setup codex`
   - `bd setup claude`
   - `bd setup cursor`
7. Optionally include a repo-native `beads-task-tracking` skill in project config.
8. Run `bd doctor --json` or `bd doctor --agent --json` and summarize project health.

Important design choice:

- Do not reimplement Beads issue tracking in `bgng`.
- Do not duplicate Beads' setup recipe content unless there is a clear gap.
- Prefer invoking Beads' own setup checks because Beads owns its project files, hooks, and agent context.

Potential repo-native skill:

```text
skills/shared/beads-task-tracking/SKILL.md
```

Purpose:

- teach agents when to use `bd`
- require JSON output where possible
- avoid interactive `bd edit`
- use `bd ready`, `bd create`, `bd update --claim`, `bd close`, `bd sync`, `bd doctor`

This skill should be intentionally short and should direct agents to `bd prime` for detailed current workflow context.

## Beads MCP Strategy

Beads MCP should be optional and secondary.

Reasons:

- Beads docs recommend CLI + hooks for shell-capable coding agents.
- MCP has higher context overhead.
- `beads-mcp` is a separate install from `bd`.
- Beads MCP itself supports multi-project routing with `workspace_root`, so a global single server is often better than many per-project MCP entries.

Recommended v1:

- Do not enable Beads MCP by default.
- Add `bgng extensions setup beads --mcp` only after CLI setup is supported.
- If implemented, the MCP entry should be opt-in and should check for `beads-mcp`.

Possible MCP definition:

```json
{
  "description": "Beads MCP server for project issue tracking",
  "transport": "stdio",
  "command": "beads-mcp",
  "args": [],
  "optional": true
}
```

For project-specific MCP routing, prefer environment only when there is a clear reason:

```json
{
  "env": {
    "BEADS_WORKING_DIR": "/path/to/project"
  }
}
```

But Beads' MCP docs recommend a single MCP server with workspace routing where possible, so per-project MCP instances should not be the default.

## Parallel Extension Strategy

Parallel should become a global extension with optional MCP overlay.

Current state:

- repo-native Parallel skills exist
- `parallel-cli` is the default path
- `parallel-search` and `parallel-task` MCP servers exist behind `config.parallel.mcp.enabled`

Target state:

- Parallel is represented by an extension definition
- `config.parallel` either migrates to or is mirrored by `extensions.parallel`
- existing behavior remains backward compatible

Recommended v1 migration:

- Keep existing `config.parallel` support.
- Add extension metadata around it.
- Add `bgng extensions status parallel` and `bgng extensions doctor parallel`.
- Later add `bgng extensions setup parallel` to verify `parallel-cli`, auth, skills, and MCP toggle.

Do not force all existing Parallel behavior through package-backed skill bundles. Built-in first-party skills can remain repo-native.

## Config Model Options

### Option A: Keep extension state in existing config fields

Example:

```json
{
  "parallel": {
    "cli": { "enabled": true },
    "mcp": { "enabled": false }
  }
}
```

Pros:

- minimal migration
- preserves current behavior

Cons:

- does not scale cleanly to Beads or future extensions
- requires custom top-level keys for every extension

### Option B: Add a new `extensions` object

Example:

```json
{
  "extensions": {
    "parallel": {
      "enabled": true,
      "modes": {
        "cli": true,
        "skills": true,
        "mcp": false
      }
    },
    "beads": {
      "enabled": true,
      "scope": "project",
      "modes": {
        "cli": true,
        "skills": true,
        "mcp": false
      }
    }
  }
}
```

Pros:

- clear long-term model
- supports Beads and Parallel uniformly
- avoids more bespoke top-level config

Cons:

- requires migration or compatibility handling

### Recommendation

Use Option B as the target model, but implement compatibility gradually.

First implementation:

- introduce typed extension definitions in code
- add `extensions` commands
- keep `config.parallel` behavior untouched
- allow future `extensions.parallel` to override or mirror `config.parallel`
- allow project config to hold extension settings later

## Project Config Implications

Beads is mostly project-scoped, so project config should eventually support extension settings.

Possible future shape:

```json
{
  "version": 1,
  "extensions": {
    "beads": {
      "enabled": true,
      "modes": {
        "cli": true,
        "skills": true,
        "mcp": false
      },
      "targets": ["codex", "claude"]
    }
  },
  "skills": {
    "include": ["beads-task-tracking"]
  }
}
```

Do not add this before the extension command surface exists.

## Safety Requirements

The extension system must keep the repo's existing safety posture:

- setup commands support `--dry-run`
- no automatic project mutation from `status` or `doctor`
- external command execution is explicit
- destructive Beads operations are never wrapped casually
- `bd init --force` is not run unless explicitly requested
- `bd doctor --fix` is not run by default
- MCP enablement is opt-in

For Beads, the most sensitive actions are:

- initializing `.beads/`
- installing hooks
- writing editor setup files
- writing or changing `AGENTS.md`
- enabling MCP state

These should be visible in dry-run output.

## Testing Strategy

Test without touching the real home directory or real project state.

Unit tests:

- extension definition loading
- extension list/show/status output formatting
- command availability checks
- Beads status parsing from mocked command output
- project state detection for `.beads/`

Command tests:

- `bgng extensions list`
- `bgng extensions show beads`
- `bgng extensions status beads --json`
- `bgng extensions doctor beads --json`
- `bgng extensions setup beads --dry-run`

Integration-style tests:

- use fake `bd` executable in a temp `PATH`
- verify setup command order
- verify missing `bd` produces install hints
- verify existing `.beads/` avoids `bd init`
- verify target flags map to `bd setup <recipe> --check`

Manual verification:

- run `bgng extensions status beads` in a repo without `.beads`
- run `bgng extensions setup beads --dry-run`
- run against a temp project and confirm `.beads` behavior
- verify no real user config is touched in dry-run

## Open Questions

1. Should `bgng extensions setup beads` run Beads' own `bd setup` recipes by default, or only check and recommend them?
2. Should the Beads skill be curated globally or only included through project config?
3. Should `bgng init` grow an `--extension beads` option, or should extension setup remain under `bgng extensions setup beads`?
4. Should `extensions` state enter `config.json` immediately, or should v1 be command-only with typed definitions?
5. Should existing docs and config rename "Optional Integrations" to "Extensions" in one migration, or gradually?

## Recommended Implementation Order

1. Rename user-facing terminology from "integrations" to "extensions" where applicable in docs.
2. Add extension core types and static definitions for `parallel` and `beads`.
3. Add `bgng extensions list/show/status/doctor`.
4. Add repo-native `beads-task-tracking` skill.
5. Add Beads status and doctor checks.
6. Add `bgng extensions setup beads --dry-run`.
7. Add real Beads setup execution with explicit flags.
8. Add optional Beads MCP overlay only after CLI setup is stable.
9. Move or mirror Parallel config under the extension model without breaking existing `config.parallel`.

## Recommendation

Build a general `extensions` architecture before adding Beads as a one-off.

The extension model should treat Beads and Parallel as capability families:

- Beads: project-scoped, CLI-first, hooks/rules-aware, optional MCP.
- Parallel: global, CLI+skills-first, optional MCP.

This preserves the strongest existing pattern in `bgng`: central orchestration with explicit curation and safe sync. It also avoids turning every external tool into a raw MCP server, which would conflict with both Beads' and Parallel's own recommendations for terminal-capable coding agents.
