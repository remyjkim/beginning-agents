# Per-Project Configuration Target Architecture

## Scope

Define the architecture for per-project configuration overrides in `beginning-harness` so that different project directories can customize which MCP servers, skills, and targets are active while the central `~/.agents` remains the shared harness content container.

## Executive Summary

The `bgng` CLI currently operates on a single global configuration. All projects get the same MCP servers, skills, and targets. This is limiting — a Python project shouldn't need a React MCP server, and a frontend repo shouldn't see Go skills.

This document defines a per-project override system with these core decisions:

1. Per-project config lives at `<project>/.agents/bgng/config.json`
2. Overrides patch the central config — they don't replace it
3. The central `~/.agents` and bgng repo remain the sole content owners
4. Discovery walks CWD upward; first match wins; no layering
5. Merge happens once early; downstream code receives an effective config transparently
6. Zero breaking changes to existing behavior when no project config exists

## Problem

The current system treats all projects identically:

1. Every project gets every active MCP server from the central registry
2. Every project gets every curated skill
3. Every project syncs to every enabled target
4. A project that needs a local-only MCP server (e.g., project database) has no place to define it

Users working across multiple projects with different tooling needs must either:
- Manually toggle servers/skills in central config when switching projects
- Maintain multiple bgng repo checkouts and swap `AGENTS_REPO_ROOT`
- Accept that every project has every tool, creating noise

## Current Architecture

### Content ownership

```
~/.agents/
  skills/                    ← curated skill symlinks
  generated/                 ← generated config files

<bgng-repo>/
  config.json                ← central config (targets, optional toggles, parallel)
  mcp-servers.json           ← central MCP server registry
  skills/{shared,claude-only,codex-only,experimental}/
```

### Config flow

```
config.json + mcp-servers.json
  → buildActiveServers() filters servers
  → syncMcp() writes to each target's config file
  → syncSkills() symlinks curated skills to each target
```

### Key types

- `CanonicalConfig` — targets, parallel, optional toggles
- `CanonicalRegistry` — server definitions
- `SyncOptions` / `NormalizedSyncOptions` — path overrides and flags
- `SyncResult` — changes and warnings

## Target Architecture

### File location

```
my-project/
  .agents/
    skills/              ← ecosystem standard (Codex, gh skill, etc.)
    bgng/
      config.json        ← per-project overrides
```

The `.agents/bgng/` namespace avoids collision with the cross-tool `.agents/skills/` convention used by Codex CLI, `gh skill install`, and the Agent Skills standard (agentskills.io).

### Per-project config schema

```typescript
interface ProjectConfig {
  version: 1;
  servers?: Record<string, ServerOverride>;
  skills?: {
    include?: string[];
    exclude?: string[];
  };
  targets?: Record<TargetName, { enabled: boolean }>;
}

type ServerOverride =
  | { enabled: boolean }
  | RegistryServer;
```

A `ServerOverride` is disambiguated by shape:
- **Toggle** (only `enabled` field): flips an existing server on or off
- **Full definition** (has `command`/`url`/`transport`): adds a project-local server to the active set

### Merge semantics

Given central config `C`, central registry `R`, and project config `P`:

**Servers:**
1. Start with `buildActiveServers(R, C)` as the baseline active set
2. For each entry in `P.servers`:
   - If toggle with `enabled: false` → remove from active set
   - If toggle with `enabled: true` → add from `R` (overrides central optional toggle)
   - If full definition → add to active set as a project-local server

**Skills:**
1. Start with the centrally curated skill set
2. If `P.skills.include` is set → treat named skills as curated for this sync only (create symlinks even if not centrally curated)
3. If `P.skills.exclude` is set → skip named skills even if curated centrally
4. `exclude` wins over `include` if a skill appears in both

**Targets:**
1. Start with `C.targets`
2. For each entry in `P.targets` → override `enabled` for that target
3. All other target properties (configPath, format, mcpKey) inherit from central

### Discovery

`findProjectConfig(startDir)` walks from `startDir` upward toward filesystem root, checking for `.agents/bgng/config.json` at each level. First match wins. No layering of multiple project configs.

```
/Users/remy/dev/my-project/packages/frontend/  ← CWD
/Users/remy/dev/my-project/packages/           ← check
/Users/remy/dev/my-project/                    ← check (found here → stop)
```

### Config flow with project overrides

```
1. Resolve central context (existing)
2. findProjectConfig(cwd)
3. If found:
   a. loadProjectConfig(path)
   b. mergeProjectConfig(centralConfig, centralRegistry, projectConfig)
   c. Pass effective config/registry to syncMcp() + syncSkills()
4. If not found:
   a. Existing behavior, unchanged
```

The merge happens once, early. `syncMcp()`, `buildActiveServers()`, `syncSkills()` receive the effective config/registry and have no awareness of project overrides. This preserves the existing module boundaries.

## Module Changes

### New module: `cli/core/project.ts`

Owns all per-project config logic:

| Function | Purpose |
|----------|---------|
| `findProjectConfig(startDir)` | Walk CWD upward, return path or null |
| `loadProjectConfig(configPath)` | Parse and validate `.agents/bgng/config.json` |
| `mergeProjectConfig(config, registry, project)` | Produce effective config + registry |
| `scaffoldProjectConfig(projectDir, options?)` | Create initial config for `bgng init` |

### New types in `cli/core/types.ts`

- `ProjectConfig` — the per-project override schema
- `ServerOverride` — toggle or full definition union
- `EffectiveConfig` — optional: typed wrapper for merged output (or reuse `CanonicalConfig` + `CanonicalRegistry` directly)

### Modified: `cli/core/sync.ts`

`syncRepository()` gains project config awareness:
- After loading central config/registry, call `findProjectConfig(cwd)`
- If found, load and merge
- Pass effective config/registry to downstream functions
- Record project config path in `SyncResult` for reporting

### Modified: `cli/core/skills.ts`

`syncSkills()` accepts optional include/exclude lists:
- `include`: create symlinks for named skills even if not centrally curated
- `exclude`: skip named skills even if curated

### Modified: `cli/core/diagnostics.ts`

New diagnostic checks in `buildDoctorReport()`:
- Unknown server reference in project config (toggle references nonexistent central server)
- Unknown skill reference in project config (include/exclude names a nonexistent skill)
- Stale project config (overrides that match central defaults — no effective change)

### Modified: `cli/context.ts`

`AgentsContext` gains `projectConfigPath: string | null`, resolved during `createAgentsContext()`.

### Unchanged modules

- `cli/core/config.ts` — loads/saves central config only
- `cli/core/registry.ts` — loads/saves central registry only
- `cli/core/mcp.ts` — operates on whatever config/registry it receives
- `cli/core/paths.ts` — no new configured paths
- `cli/core/fs.ts` — generic utilities
- `cli/core/output.ts` — rendering

## Command Surface

### New: `bgng init`

```
bgng init [--force]
```

- Creates `.agents/bgng/config.json` in CWD with `{ "version": 1 }`
- Errors if file already exists (unless `--force`)
- Warns if `.agents/` or `.agents/bgng/` is gitignored (config won't be shared with collaborators)
- Prints confirmation with next-step hint

### Modified: `bgng sync`

No new flags. Behavior changes contextually:
- Project config discovered → syncs using merged effective config, reports project config path
- No project config → existing behavior, unchanged

### Modified: `bgng status`

When project config is active, adds project section:
- Project config path
- Effective server count (with override count)
- Effective skill count (with include/exclude counts)
- Effective target list (noting project-disabled targets)

`--json` output gains optional `project` key.

### Modified: `bgng doctor`

Additive diagnostic checks for project config validation (see diagnostics section above).

## Compatibility

### Zero breaking changes

- No project config → all behavior identical to current
- Central config.json and mcp-servers.json schemas unchanged
- sync-mcp.ts compatibility wrapper unchanged
- All existing command flags and output formats preserved

### .gitignore

`bgng init` does not modify `.gitignore`. The config is designed to be checked in. A warning is printed if `.agents/` appears gitignored.

### Version field

`"version": 1` in project config. `loadProjectConfig()` validates the version and throws a clear error for unknown versions, providing a clean upgrade path.

### Last-sync-wins

When `bgng sync` runs inside a project with overrides, the target config files (`~/.claude/settings.json`, etc.) reflect that project's view. Running `bgng sync` in a different project overwrites with that project's view. This is intentional and matches how tools like `.nvmrc` work — the active project determines the environment.

## Example

Central config has 6 servers active, 12 curated skills, all 3 targets enabled.

```json
// ~/dev/python-api/.agents/bgng/config.json
{
  "version": 1,
  "servers": {
    "context7": { "enabled": true },
    "chrome-devtools": { "enabled": false },
    "project-db": {
      "description": "Local Postgres MCP",
      "transport": "stdio",
      "command": "npx",
      "args": ["pg-mcp", "--conn", "postgres://localhost/myapi"],
      "optional": false
    }
  },
  "skills": {
    "include": ["python-debugging", "sqlalchemy-patterns"],
    "exclude": ["react-patterns", "css-utilities"]
  },
  "targets": {
    "cursor": { "enabled": false }
  }
}
```

Effective state for this project:
- 6 central servers − chrome-devtools + project-db = **6 servers**
- 12 curated skills + 2 included − 2 excluded = **12 skills**
- claude + codex active, cursor disabled = **2 targets**
