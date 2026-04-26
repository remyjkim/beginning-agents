# beginning-agents

`beginning-agents` is a Bun-powered CLI and canonical config repository for keeping local coding-agent tools in sync.

It gives you one place to manage:

- MCP server definitions
- shared agent skills
- per-project overrides
- synced local state for Claude Code, Codex, Cursor, and `~/.agents`

The command is:

```bash
bgng
```

## Why This Exists

Local agent setups tend to drift. One tool gets a new MCP server, another has an older skill directory, and a project needs a slightly different config than the global default.

`beginning-agents` treats that setup as configuration you can inspect, version, dry-run, and apply deliberately.

It is useful when you want:

- one canonical MCP registry instead of separate hand-edited tool configs
- one curated skill layer shared across compatible agents
- project-specific overrides without rewriting global config
- diagnostics for stale links, drifted config, and missing generated files
- an operator CLI that reports before it mutates

If you only need a single MCP config file for one tool, this project is probably more structure than you need.

## Requirements

- Bun 1.2+
- Node.js for MCP servers that use `node`
- npm when installing the published package or adding npm skill bundles
- optional local tools such as `parallel-cli` or `markdownify-mcp` only when you enable those integrations

## Install

### Install the published package

```bash
npm install -g beginning-agents
bgng status
```

The published package includes a packaged canonical repo. By default, global `bgng` uses that packaged config source.

### Work from a checkout

Use this mode if you want to edit the registry, maintain your own fork, add built-in skills, or develop the CLI:

```bash
git clone https://github.com/remyjkim/beginning-agents.git
cd beginning-agents
bun install
bun run bgng -- status
```

You can also point a global install at a checkout:

```bash
export AGENTS_REPO_ROOT=/path/to/beginning-agents
bgng status
```

For local development, link the package:

```bash
bun link
bgng --help
```

## Quickstart

Start by inspecting before writing:

```bash
bgng status
bgng skills list
bgng mcp list
bgng sync --dry-run
```

If the dry run looks right, apply the synced state:

```bash
bgng sync
```

That first run gives you:

- a system overview
- the current skill inventory
- the active MCP inventory
- a planned-change preview
- an explicit apply step

## What It Changes On Disk

`bgng` can read and write local agent configuration under:

- `~/.agents`
- `~/.claude`
- `~/.codex`
- `~/.cursor`
- `<project>/.agents/bgng/config.json`

The normal sync path is conservative:

- `bgng sync --dry-run` previews changes
- sync creates or replaces managed symlinks and generated MCP config
- stale downstream skill symlinks are reported, not deleted
- `bgng doctor` reports issues without fixing them

## Usage Modes

### Packaged canonical config

Use the published package when you want the default config and CLI behavior:

```bash
npm install -g beginning-agents
bgng sync --dry-run
```

### Editable canonical config

Use a checkout when you want to own the source of truth:

```bash
export AGENTS_REPO_ROOT=/path/to/beginning-agents
bgng status
```

In checkout mode, edit:

- [config.json](./config.json) for target and optional-server toggles
- [mcp-servers.json](./mcp-servers.json) for MCP server definitions
- [skills](./skills) for built-in skill content

## Command Reference

General commands:

- `bgng status`
- `bgng doctor`
- `bgng init`
- `bgng sync`

MCP commands:

- `bgng mcp list`
- `bgng mcp sync`

Skill commands:

- `bgng skills list`
- `bgng skills curate <skillName>`
- `bgng skills uncurate <skillName>`
- `bgng skills sync`
- `bgng skills packages add <packageSpec>`
- `bgng skills packages list`
- `bgng skills packages show <packageName>`

Most inspection commands support `--json`. Sync commands support `--dry-run`.

Use command help for the exact surface:

```bash
bgng --help
bgng sync --help
bgng skills packages add --help
```

## How Sync Works

The core model has three layers:

- source: repo config, built-in skills, and package-backed extension bundles
- curated state: `~/.agents/skills`
- downstream state: Claude, Codex, Cursor, and generated MCP config files

`bgng sync` applies both MCP and skills:

```bash
bgng sync --dry-run
bgng sync
```

Run only one side when needed:

```bash
bgng sync --mcp-only
bgng sync --skills-only
```

Limit sync to one target:

```bash
bgng sync --target=claude
bgng mcp sync --target=cursor
```

## MCP Registry

MCP servers are defined in [mcp-servers.json](./mcp-servers.json). Target config and optional toggles live in [config.json](./config.json).

Inspect active MCP state:

```bash
bgng mcp list
bgng mcp list --json
```

Apply active MCP state:

```bash
bgng mcp sync --dry-run
bgng mcp sync
```

Notes:

- `platform-provided` entries can live in the registry but are excluded from generated local tool configs
- optional servers are included only when enabled
- Parallel MCP is controlled by `config.parallel.mcp.enabled`

## Skill Library

Built-in skills live in:

- `skills/shared`
- `skills/claude-only`
- `skills/codex-only`
- `skills/experimental`

Curated shared skills are published through:

```text
~/.agents/skills
```

Typical built-in skill flow:

```bash
bgng skills list
bgng skills curate <skillName>
bgng skills sync --dry-run
bgng skills sync
```

Only shared skills can be curated into `~/.agents/skills`. Claude-only and Codex-only skills sync directly to their target-specific skill directories.

## Extension Skill Bundles

`beginning-agents` supports package-backed extension skill bundles for skills that should be available without being added to the built-in first-party tree.

Typical flow:

```bash
bgng skills packages add <npm-package-or-local-path>
bgng skills packages list
bgng skills packages show <packageName>
bgng skills curate <skillName>
bgng skills sync
```

The distinction matters:

- added means the bundle is available under `~/.agents/packages/skills`
- curated means a shared skill is linked into `~/.agents/skills`
- synced means the curated skill is linked into downstream tool directories

Current package-backed bundle support includes add, list, show, inventory, curation, and sync. Update and remove lifecycle commands are intentionally not part of the first implementation.

## Per-Project Configuration

Use per-project config when one project needs a different effective view than the global default.

Create a project config:

```bash
cd /path/to/project
bgng init
```

This creates:

```text
<project>/.agents/bgng/config.json
```

Project config can:

- enable or disable MCP servers for one project
- add project-local MCP server definitions
- include or exclude skills during sync
- enable or disable targets locally

Discovery walks upward from the current working directory and uses the nearest config file.

Useful workflow:

```bash
bgng status
bgng sync --dry-run
bgng doctor
```

Current limitation: per-project `skills.include` resolves repo-native skills only. General `bgng skills curate <skillName>` supports both repo-native shared skills and package-backed shared skills.

## Diagnostics

Use `doctor` when local state looks wrong:

```bash
bgng doctor
bgng doctor --json
```

It reports:

- broken symlinks
- stale downstream skill links
- MCP drift
- missing generated config files
- project config issues

It does not mutate local state.

## Compatibility Wrapper

The legacy sync entrypoint remains available from a repo checkout:

```bash
bun run sync-mcp.ts
bun run sync-mcp.ts --dry-run
bun run sync-mcp.ts --mcp-only
bun run sync-mcp.ts --skills-only
bun run sync-mcp.ts --target=claude
```

New workflows should prefer `bgng`, but `sync-mcp.ts` stays wired to the same extracted core modules.

## Optional Integrations

Baseline CLI usage does not require external tools beyond Bun, Node.js, and npm.

Optional integrations include:

- Parallel CLI-backed skills
- Parallel MCP overlay
- local `markdownify-mcp`

### Parallel

Parallel is integrated in two layers:

- default: CLI-backed shared skills
- optional: globally enabled Parallel MCP servers

Default shared skills:

- `parallel-web-search`
- `parallel-web-extract`
- `parallel-deep-research`
- `parallel-data-enrichment`

Those skills assume `parallel-cli` is installed and authenticated separately.

Install:

```bash
curl -fsSL https://parallel.ai/install.sh | bash
```

Authenticate:

```bash
parallel-cli login
parallel-cli auth
```

To enable the optional Parallel MCP overlay, edit [config.json](./config.json):

```json
"parallel": {
  "cli": { "enabled": true },
  "mcp": { "enabled": true }
}
```

Then run:

```bash
bgng mcp sync
```

### Markdownify

`markdownify` is treated as an optional local MCP dependency.

The registry entry uses:

```json
"command": "node",
"args": ["markdownify-mcp/dist/index.js"]
```

If you enable it, make sure the path in [mcp-servers.json](./mcp-servers.json) matches your local installation and the optional toggle in [config.json](./config.json) is enabled.

## Safety Model

The safety model is intentionally simple:

- preview first with `--dry-run`
- inspect machine state with `status`
- diagnose drift with `doctor`
- curate skills explicitly before syncing them
- treat package-backed bundles as available content, not automatically exposed behavior
- keep cleanup report-only until a command explicitly supports repair or pruning

## Contributing

Community contributions are welcome when they preserve the conservative sync model and include tests for behavior changes.

Start with:

```bash
bun install
bun test
bun run typecheck
bun run verify:release --json
```

Then read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

## Documentation Map

- [CONTRIBUTING.md](./CONTRIBUTING.md): contributor setup, verification, and pull request expectations
- [docs/maintainers/README.md](./docs/maintainers/README.md): release and operational documentation for maintainers
- [.ai/knowledges/01_agents-cli-usage-guide.md](./.ai/knowledges/01_agents-cli-usage-guide.md): detailed operator guide
- [.ai/knowledges/02_per-project-config-guide.md](./.ai/knowledges/02_per-project-config-guide.md): per-project config reference
- [.ai/knowledges/03_npm-skill-bundles-guide.md](./.ai/knowledges/03_npm-skill-bundles-guide.md): package-backed skill bundle reference
