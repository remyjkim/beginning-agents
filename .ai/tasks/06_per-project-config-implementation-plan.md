# Per-Project Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-project configuration overrides to `beginning-agents` so each project directory can customize which MCP servers, skills, and targets are active while `~/.agents` remains the canonical content container.

**Architecture:** See `.ai/analyses/07_per-project-config-target-architecture.md` for full design. Per-project config lives at `<project>/.agents/bgng/config.json`, patches the central config via shallow merge, and is discovered by walking CWD upward. Downstream sync code receives an effective merged config transparently.

**Tech Stack:** Bun, TypeScript, Clipanion, filesystem-backed state, existing `~/.agents` curated-layer model.

**TDD:** Every task follows red-green-refactor. `bun test` + `tsc --noEmit` must pass as regression gates after each task.

---

## Implementation Strategy

These decisions are locked before any code is written:

1. **Central config is the baseline** — per-project config only stores differences
2. **`.agents/bgng/config.json`** is the per-project file location — avoids collision with ecosystem `.agents/skills/`
3. **First match wins** — discovery walks upward, stops at first `.agents/bgng/config.json`, no layering
4. **Merge happens once, early** — `syncRepository()` produces an effective config/registry before calling `syncMcp()` or `syncSkills()`
5. **Downstream modules are unaware** — `buildActiveServers()`, `syncMcp()`, `syncSkills()` receive effective state, not raw overrides
6. **Zero breaking changes** — no project config → behavior identical to current

---

## Task 1: Add per-project types

**Files:** `cli/core/types.ts`

Add to existing types file:

```typescript
export type ServerOverride =
  | { enabled: boolean }
  | RegistryServer;

export interface ProjectConfig {
  version: number;
  servers?: Record<string, ServerOverride>;
  skills?: {
    include?: string[];
    exclude?: string[];
  };
  targets?: Record<TargetName, { enabled: boolean }>;
}
```

**Type design notes:**

`ServerOverride` is a discriminated union by shape:
- Toggle: object with only `enabled` (no `transport`, `command`, `url`)
- Full definition: has `transport` + `command`/`url` (same shape as `RegistryServer`)

The disambiguator function (needed later in merge logic):

```typescript
function isServerToggle(override: ServerOverride): override is { enabled: boolean } {
  return !("transport" in override);
}
```

This function belongs in `cli/core/project.ts` (Task 2), not in types. Mentioned here so the type design rationale is clear.

**Test:** `tsc --noEmit` passes. No runtime tests needed — this is type-only.

**Commit:** `[feat:project] add per-project config types`

---

## Task 2: Implement project config discovery, loading, and merge

**Files:** `cli/core/project.ts` (new), `test/core-project.test.ts` (new)

### `findProjectConfig(startDir: string): string | null`

Walk from `startDir` upward. At each level, check if `.agents/bgng/config.json` exists. Return the full path on first hit, or `null` at filesystem root.

```typescript
export function findProjectConfig(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, ".agents", "bgng", "config.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
```

### `loadProjectConfig(configPath: string): ProjectConfig`

Read and parse JSON. Validate `version === 1` — throw for unknown versions with a clear message.

### `mergeProjectConfig(config, registry, project): { config: CanonicalConfig; registry: CanonicalRegistry }`

Produce effective config and registry by applying project overrides:

**Server merge:**
```
for each (name, override) in project.servers:
  if isServerToggle(override):
    if override.enabled === false:
      remove name from effective optional (set to false)
    if override.enabled === true:
      add name to effective optional (set to true)
  else:
    add full server definition to effective registry
```

**Skill merge:** Return the include/exclude lists as-is — they are consumed by `syncSkills()` later (Task 5). The merge function packages them into the effective output.

**Target merge:**
```
for each (name, override) in project.targets:
  effective.targets[name].enabled = override.enabled
```

### `scaffoldProjectConfig(projectDir: string, options?: { force?: boolean }): string`

Create `.agents/bgng/config.json` with `{ "version": 1 }`. Return the created file path. Throw if file exists and `!options?.force`.

### Tests (`test/core-project.test.ts`)

**Discovery:**
- Finds config in CWD (`.agents/bgng/config.json` exists at startDir)
- Finds config in ancestor directory (walk up 2 levels)
- Returns null when no config exists
- When config exists at both CWD and ancestor, returns CWD one (nearest wins)

**Loading:**
- Parses valid project config
- Handles minimal config (`{ "version": 1 }`) — returns empty overrides
- Throws for unknown version (e.g., `{ "version": 99 }`)
- Throws for malformed JSON

**Merge — servers:**
- Toggle `enabled: false` removes an active server from effective set
- Toggle `enabled: true` activates an optional server
- Full server definition adds to effective registry
- No overrides → effective config equals central config (identity merge)

**Merge — skills:**
- Include list is passed through in effective output
- Exclude list is passed through in effective output
- Both empty/absent → no skill overrides in effective output

**Merge — targets:**
- Override `enabled: false` disables a centrally enabled target
- Override `enabled: true` enables a centrally disabled target
- Unmentioned targets inherit central state

**Commit:** `[feat:project] implement discovery, loading, and merge`

---

## Task 3: Implement `bgng init` command

**Files:** `cli/commands/init.ts` (new), `cli/index.ts` (modified), `test/commands-init.test.ts` (new)

### Command: `bgng init`

```typescript
class InitCommand extends BaseCommand {
  static override paths = [["init"]];
  static override usage = { description: "Create per-project configuration" };

  force = Option.Boolean("--force", false);

  async execute() {
    const projectDir = process.cwd();
    const configPath = scaffoldProjectConfig(projectDir, { force: this.force });
    // Check if .agents/ or .agents/bgng/ is gitignored — warn if so
    // Print confirmation
  }
}
```

Register in `cli/index.ts`.

### Gitignore detection

Check if a `.gitignore` file exists in the project directory and whether it contains patterns that would exclude `.agents/` or `.agents/bgng/`. If so, print a warning: the config won't be shared with collaborators.

Keep this simple — read `.gitignore`, check for `.agents` as a substring. Don't implement full gitignore pattern matching.

### Tests (`test/commands-init.test.ts`)

- Creates `.agents/bgng/config.json` with `{ "version": 1 }` scaffold
- Exits non-zero when file already exists (without `--force`)
- `--force` overwrites existing config
- Created file is valid JSON with version field

**Commit:** `[feat:project] add bgng init command`

---

## Task 4: Wire project config into sync pipeline

**Files:** `cli/core/sync.ts` (modified), `cli/context.ts` (modified), `test/commands-sync.test.ts` (extended), `test/sync-mcp-compat.test.ts` (extended)

### Changes to `cli/context.ts`

Add `projectConfigPath: string | null` to `AgentsContext`. In `createAgentsContext()`, call `findProjectConfig(process.cwd())` and store the result.

### Changes to `cli/core/sync.ts`

In `syncRepository()`, after loading central config and registry:

```typescript
const projectConfigPath = findProjectConfig(normalized.repoRoot);
let effectiveConfig = config;
let effectiveRegistry = registry;

if (projectConfigPath) {
  const projectConfig = loadProjectConfig(projectConfigPath);
  const merged = mergeProjectConfig(config, registry, projectConfig);
  effectiveConfig = merged.config;
  effectiveRegistry = merged.registry;
  result.changes.push(`project config: ${projectConfigPath}`);
}
```

Note: the CWD-based discovery should use the actual working directory, not `repoRoot`. The repo root is the bgng repo; the project root is where the user is working. This likely means `syncRepository()` needs to accept an optional `projectDir` or `cwd` parameter rather than deriving it from `repoRoot`.

**Design decision:** Add `cwd?: string` to `SyncOptions`. Default to `process.cwd()`. `findProjectConfig` uses this, not `repoRoot`.

Pass `effectiveConfig` and `effectiveRegistry` to `syncMcp()` and `buildActiveServers()`.

### Tests

**`test/commands-sync.test.ts` additions:**
- Sync with project config applies server overrides
- Sync with project config applies target overrides
- Sync without project config is unchanged (regression)
- Dry-run reports project config path in changes
- `--json` output includes project config info

**`test/sync-mcp-compat.test.ts` additions:**
- `sync-mcp.ts` wrapper works with project config in CWD (if applicable — may not need this if the wrapper doesn't use project config)

**Commit:** `[feat:project] wire project config into sync pipeline`

---

## Task 5: Wire project config into skills sync

**Files:** `cli/core/skills.ts` (modified), `test/core-skills.test.ts` (extended)

### Changes to `syncSkills()`

Add optional parameters for project skill overrides:

```typescript
interface SkillSyncOverrides {
  include?: string[];
  exclude?: string[];
}
```

In the sync logic:
- **Include:** For each skill name in `include`, if it exists in any repo scope but is not centrally curated, treat it as curated for this sync. Locate the skill source via `findRepoSkill()` and create symlinks as if it were curated.
- **Exclude:** For each skill name in `exclude`, skip it during symlink creation even if it is centrally curated.
- **Exclude wins:** If a name appears in both include and exclude, exclude takes precedence.

### How overrides flow in

`syncRepository()` extracts `project.skills` from the merged result and passes it to `syncSkills()`. This keeps the merge function simple (it doesn't need to resolve skill paths) and keeps skill path logic in `skills.ts` where it belongs.

### Tests (`test/core-skills.test.ts` additions)

- Include adds a non-curated skill to the sync output
- Exclude removes a curated skill from the sync output
- Exclude wins over include for the same skill name
- Include for a nonexistent skill name produces a warning (not an error)
- Without overrides, behavior is unchanged (regression)

**Commit:** `[feat:project] add skill include/exclude overrides to sync`

---

## Task 6: Update `bgng status` for project awareness

**Files:** `cli/commands/status.ts` (modified), `cli/core/output.ts` (modified if needed), `test/commands-status.test.ts` (extended)

### Human output

When project config is active, add a "Project" section after the existing output:

```
Project: /Users/remy/dev/my-app/.agents/bgng/config.json

  Server overrides:  2 (1 disabled, 1 added)
  Skill overrides:   3 included, 1 excluded
  Target overrides:  codex disabled
```

When no project config is active, omit this section entirely.

### JSON output

Add optional `project` key to JSON output:

```json
{
  "repoRoot": "...",
  "agentsDir": "...",
  "project": {
    "configPath": "/Users/remy/dev/my-app/.agents/bgng/config.json",
    "servers": { "overrideCount": 2 },
    "skills": { "includeCount": 3, "excludeCount": 1 },
    "targets": { "overrideCount": 1 }
  }
}
```

### Tests

- Shows project section when project config exists
- Omits project section when no project config (regression)
- JSON output includes `project` key when config exists
- JSON output omits `project` key when no config

**Commit:** `[feat:project] show project config in bgng status`

---

## Task 7: Update `bgng doctor` for project diagnostics

**Files:** `cli/core/diagnostics.ts` (modified), `cli/commands/doctor.ts` (modified if needed), `test/commands-doctor.test.ts` (extended)

### New diagnostic checks

Add to `buildDoctorReport()` when project config is provided:

1. **Unknown server reference** — project config toggles a server name that doesn't exist in the central registry (and it's not a full definition). Likely a typo or stale reference.

2. **Unknown skill reference** — project config includes or excludes a skill name that doesn't exist in any repo skill scope. Likely a typo or removed skill.

3. **Stale project config** — project config has overrides, but they all match what the central config would produce anyway (e.g., disabling a server that's already disabled centrally). Not harmful, but noisy.

### Output format

Follow the existing `renderDoctorReport` sectioned list format:

```
Project config issues:
- Unknown server reference: "nonexistent-server"
- Unknown skill reference: "deleted-skill"
- Stale override: server "markdownify" is already disabled centrally
```

### Tests

- Detects unknown server reference in project config
- Detects unknown skill reference in project config
- Detects stale override (matches central default)
- Clean project config produces no warnings
- No project config produces no project diagnostics (regression)

**Commit:** `[feat:project] add project config diagnostics to doctor`

---

## Task 8: Integration and output contract tests

**Files:** `test/commands-output-contracts.test.ts` (extended), `test/scenarios-user-journeys.test.ts` (extended)

### Output contracts

Extend the existing output contract tests to cover:
- `bgng init` produces non-empty output
- `bgng status` with project config produces valid human and JSON output
- `bgng doctor` with project config produces valid human and JSON output
- `bgng sync` with project config produces valid output

### User journey: per-project setup

New scenario in `test/scenarios-user-journeys.test.ts`:

```
1. User runs `bgng init` in a project directory
2. User edits .agents/bgng/config.json to disable a server and add a project-local one
3. User runs `bgng sync --dry-run` and sees the effective changes
4. User runs `bgng status` and sees project section
5. User runs `bgng doctor` and gets clean report
```

### User journey: invalid project config

```
1. User has a project config that references a nonexistent server
2. User runs `bgng doctor` and gets a warning
3. User runs `bgng sync` and the unknown toggle is ignored (not an error)
```

### Regression

Verify that all existing tests still pass — the existing user journey scenarios should be completely unaffected by the project config feature.

**Commit:** `[test:project] add integration and output contract tests`

---

## Task 9: Documentation

**Files:** `.ai/knowledges/01_agents-cli-usage-guide.md` (modified), `README.md` (modified)

### Usage guide additions

Add a "Per-Project Configuration" section covering:
- What per-project config is and when to use it
- `bgng init` to scaffold
- Override schema with examples (server toggle, full server, skill include/exclude, target override)
- How discovery works (walks upward, first match wins)
- How to check effective state (`bgng status`, `bgng sync --dry-run`)
- How to diagnose issues (`bgng doctor`)

### README additions

Brief mention in the features section and a pointer to the usage guide for details.

**Commit:** `[doc:project] document per-project configuration`

---

## Task 10: Final certification

Run the full quality gate:

```bash
bun test                           # all tests pass
tsc --noEmit                       # no type errors
bun run verify:release             # release readiness check
```

Verify:
- All new tests pass
- All existing tests pass (zero regressions)
- TypeScript compiles clean
- `verify:release` reports no issues
- `bgng init` + `bgng sync` + `bgng status` + `bgng doctor` work end-to-end in a real project directory

**Commit:** none (verification only)

---

## Dependency Graph

```
Task 1 (types)
  └→ Task 2 (core project module)
       ├→ Task 3 (bgng init command)
       ├→ Task 4 (wire into sync pipeline)
       │    └→ Task 5 (wire into skills sync)
       ├→ Task 6 (bgng status updates)
       └→ Task 7 (bgng doctor updates)
            └→ Task 8 (integration tests)
                 └→ Task 9 (documentation)
                      └→ Task 10 (final certification)
```

Tasks 3, 4, 6, 7 can be worked in parallel once Task 2 is complete. Task 5 depends on Task 4. Task 8 depends on all command-level tasks (3, 5, 6, 7).

## Files Inventory

### New files
| File | Purpose |
|------|---------|
| `cli/core/project.ts` | Discovery, loading, merge logic |
| `cli/commands/init.ts` | `bgng init` command |
| `test/core-project.test.ts` | Unit tests for project module |
| `test/commands-init.test.ts` | Integration tests for init command |

### Modified files
| File | Change |
|------|--------|
| `cli/core/types.ts` | Add `ProjectConfig`, `ServerOverride` types |
| `cli/core/sync.ts` | Project config discovery and merge in `syncRepository()` |
| `cli/core/skills.ts` | Accept include/exclude overrides in `syncSkills()` |
| `cli/core/diagnostics.ts` | Project config diagnostic checks |
| `cli/context.ts` | Add `projectConfigPath` to `AgentsContext` |
| `cli/index.ts` | Register `InitCommand` |
| `cli/commands/status.ts` | Show project section |
| `cli/commands/doctor.ts` | Pass project config to diagnostics |
| `test/commands-sync.test.ts` | Project config sync tests |
| `test/commands-status.test.ts` | Project section tests |
| `test/commands-doctor.test.ts` | Project diagnostic tests |
| `test/commands-output-contracts.test.ts` | Extended contracts |
| `test/scenarios-user-journeys.test.ts` | New journey scenarios |
| `.ai/knowledges/01_agents-cli-usage-guide.md` | Per-project docs |
| `README.md` | Feature mention |

### Unchanged files
| File | Reason |
|------|--------|
| `cli/core/config.ts` | Central config only |
| `cli/core/registry.ts` | Central registry only |
| `cli/core/mcp.ts` | Receives effective config transparently |
| `cli/core/paths.ts` | No new configured paths |
| `cli/core/fs.ts` | Generic utilities |
| `cli/core/output.ts` | Rendering (unless status needs new helpers) |
| `sync-mcp.ts` | Compatibility wrapper, unchanged |
| `package.json` | No new dependencies |
