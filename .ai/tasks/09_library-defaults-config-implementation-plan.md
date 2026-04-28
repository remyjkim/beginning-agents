# Library Defaults And User Config Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:test-driven-development for every code-changing task. Do not commit unless explicitly instructed.

**Goal:** Implement the next CLI architecture slice from `.ai/analyses/13_library-defaults-config-target-architecture.md`: user-owned global config, first-class library defaults, MCP library storage, and safer project add behavior.

**Architecture:** Keep `bgng add ...` project-scoped, keep `bgng library ...` as reusable inventory management, and add `bgng library defaults ...` for machine-wide activation. Preserve existing repo-root config behavior for development/tests while introducing `~/.agents/bgng/config.json` as the installed/user-owned global config path.

**Tech Stack:** Bun, TypeScript, Clipanion, filesystem-backed JSON config, existing `~/.agents` aggregation layout, existing CLI fixture tests.

---

## Evidence Base

- `.ai/analyses/13_library-defaults-config-target-architecture.md`
- `.ai/analyses/12_target-cli-ui-architecture.md`
- `.ai/analyses/07_per-project-config-target-architecture.md`
- `.ai/analyses/06_npm-skills-package-integrated-target-architecture.md`
- `.ai/knowledges/01_agents-cli-usage-guide.md`
- `.ai/knowledges/02_per-project-config-guide.md`
- `.ai/knowledges/03_npm-skill-bundles-guide.md`
- Current implementation:
  - `cli/core/config.ts`
  - `cli/core/library.ts`
  - `cli/core/mcp.ts`
  - `cli/core/project.ts`
  - `cli/core/project-writes.ts`
  - `cli/core/skills.ts`
  - `cli/core/sync.ts`
  - `cli/commands/add/mcp.ts`
  - `cli/commands/add/skill.ts`
  - `cli/commands/library/list.ts`
  - `cli/commands/library/show.ts`
  - `cli/commands/library/add/skill.ts`

## Current State Findings

Implemented now:

- `bgng add skill` writes project `skills.include`.
- `bgng add mcp` writes project `servers.<name> = { enabled: true }`.
- `bgng library add skill` installs package-backed skill bundles.
- `bgng library list/show` reads repo-native skills, package-backed skills, and built-in MCP registry entries.
- `bgng apply` materializes effective config.
- `bgng doctor` detects stale project overrides, unknown project refs, drift, and stale skill symlinks.
- `~/.agents/skills` remains the global curated skill publication layer.

Important gaps:

- No `~/.agents/bgng/config.json` user global config path.
- No `defaults.skills`, `defaults.mcpServers`, or `defaults.extensions` config model.
- No `bgng library defaults ...` commands.
- No persistent user MCP library under `~/.agents/library/mcp-servers.json`.
- `bgng add mcp context7` can write a redundant project override when `context7` is already globally active.
- Built-in non-optional MCP servers are implicitly global via `optional: false`, not explicit user defaults.
- Docs still describe `skills curate` as the primary global skill command.

## Target User Model

Teach and implement this distinction:

```text
bgng library add ...              make reusable inventory available
bgng library defaults add ...     make a library/built-in item active globally
bgng add ...                      make an item active for the current project
bgng apply                        write the effective state into tools
```

Examples:

```bash
bgng library add skill @acme/writing-skills
bgng library defaults add skill writing-polish
bgng apply --dry-run
```

```bash
bgng library add mcp github
bgng library defaults add mcp github
bgng apply --dry-run
```

```bash
cd ~/dev/project
bgng add mcp github
bgng apply --dry-run
```

## Non-Goals

- Do not remove or break `bgng sync`.
- Do not remove or break `bgng skills curate`.
- Do not delete existing `~/.agents/skills` symlinks.
- Do not make `bgng library add ...` activate items globally by default.
- Do not make `bgng add ...` mutate global defaults.
- Do not store secret values in config or library files.
- Do not infer arbitrary npm MCP packages into executable MCP definitions.
- Do not require network access for default test coverage.
- Do not commit unless explicitly instructed.

## Acceptance Criteria

User-visible behavior:

- `bgng library defaults list` shows global default skills, MCP servers, and extensions.
- `bgng library defaults add skill <name>` makes a known skill globally active and prints `bgng apply --dry-run` as next step.
- `bgng library defaults remove skill <name>` removes a skill from global defaults without deleting the underlying library/source.
- `bgng library defaults add mcp <name>` makes a known built-in or library MCP globally active.
- `bgng library defaults remove mcp <name>` removes a global MCP default without deleting the MCP definition.
- `bgng library add mcp <file-or-id>` registers a reusable MCP definition without enabling it globally or for a project.
- `bgng add mcp <name>` does not write a project override when `<name>` is already active by global default.
- `bgng apply --dry-run --json` reflects global defaults plus project overrides.
- `bgng doctor --json` reports missing defaults, stale project overrides, and missing MCP env requirements.

Compatibility behavior:

- Existing tests for `sync`, `skills curate`, `skills sync`, package-backed skills, project config, extensions, and `apply` still pass.
- Existing fixture runs using `AGENTS_REPO_ROOT` continue to use the fixture repo config unless the test explicitly opts into user config behavior.
- Existing `~/.agents/skills` symlinks are honored as migration input and compatibility publication state.

Quality gates:

```bash
bun test
bun run typecheck
bun run verify:release --json
git diff --check
```

## Implementation Strategy

Implement in five layers:

1. Add types and user global config path support without changing existing runtime behavior.
2. Add default resolution helpers and wire them into apply/doctor.
3. Add `library defaults` commands for skills and MCP.
4. Add persistent MCP library storage and `library add mcp`.
5. Harden UX, docs, and tests.

Do not start by rewriting `syncRepository()`. First create small pure helpers with unit tests, then integrate them into command/core flows.

## Task 1: Extend Domain Types For User Defaults And MCP Library

**Files:**

- Modify: `cli/core/types.ts`
- Test: existing typecheck

**Schema additions:**

Add to `CanonicalConfig`:

```ts
defaults?: {
  skills?: string[];
  mcpServers?: string[];
  extensions?: Record<string, ProjectExtensionConfig>;
};
```

Add user library types:

```ts
export interface UserMcpLibrary {
  version: number;
  servers: Record<string, RegistryServer>;
}
```

If metadata is needed, prefer a wrapper type later. Keep the initial MCP library schema close to `CanonicalRegistry` to reuse validation and merge logic.

**TDD steps:**

1. Add type-only references in new tests from later tasks.
2. Run:

```bash
bun run typecheck
```

Expected before implementation: type errors in tests once tests are written.

## Task 2: Add User Config Path And Load/Save Helpers

**Files:**

- Create: `cli/core/user-config.ts`
- Modify: `cli/core/paths.ts`
- Modify: `test/helpers.ts`
- Test: `test/core-user-config.test.ts`

**Core behavior:**

- `resolveUserBgngDir(agentsDir)` returns `join(agentsDir, "bgng")`.
- `resolveUserConfigPath(agentsDir)` returns `join(agentsDir, "bgng", "config.json")`.
- `loadUserConfig(path)` parses and validates version `1`.
- `saveUserConfig(path, config)` writes stable two-space JSON and creates parent dirs.
- `initializeUserConfigFromPackagedDefaults(packagedConfig)` returns a config with seeded defaults.

**Seed rules:**

- Preserve `targets`, `catalogs`, `parallel`, and `optional` from packaged config.
- Add `defaults.skills` from current curated symlink names when a migration helper is explicitly given an `agentsDir`.
- Add `defaults.mcpServers` from currently active built-in defaults:
  - include non-optional servers
  - include optional servers whose `config.optional[name] === true`
  - include Parallel MCP servers only when `config.parallel.mcp.enabled === true`
- Keep `optional` during migration for compatibility.

**Important dev/test constraint:**

Do not make `loadConfig(repoRoot)` silently prefer `~/.agents/bgng/config.json` yet. Add explicit helpers first so tests and existing flows remain stable until integration tasks opt in.

**TDD steps:**

1. Write tests for path resolution.
2. Write tests for stable save/load.
3. Write tests for seeded `defaults.mcpServers` from fixture `context7`.
4. Write tests for curated skill symlink import into `defaults.skills`.
5. Implement helpers.
6. Run:

```bash
bun test test/core-user-config.test.ts
bun run typecheck
```

## Task 3: Add Default Resolution Helpers

**Files:**

- Create: `cli/core/defaults.ts`
- Modify: `cli/core/skills.ts` if a small exported resolution helper is missing
- Modify: `cli/core/mcp.ts` or `cli/core/registry.ts` if registry merge helpers belong there
- Test: `test/core-defaults.test.ts`

**Core behavior:**

Implement pure helpers:

```ts
resolveDefaultSkillNames(config: CanonicalConfig): string[]
resolveDefaultMcpNames(config: CanonicalConfig, registry: CanonicalRegistry): string[]
mergeUserMcpLibrary(registry: CanonicalRegistry, library: UserMcpLibrary): CanonicalRegistry
applyDefaultsToConfig(config: CanonicalConfig, registry: CanonicalRegistry): CanonicalConfig
```

Implementation direction:

- `defaults.skills` is the preferred global skill default list when present.
- If `defaults.skills` is absent, existing `~/.agents/skills` curation remains the source through current sync behavior.
- `defaults.mcpServers` is the preferred explicit MCP active list when present.
- If `defaults.mcpServers` is absent, existing `optional` + non-optional behavior remains the fallback.
- For explicit `defaults.mcpServers`, construct `config.optional` so only named optional servers are active and unnamed optional servers are inactive.
- Built-in non-optional servers should be active only if named once explicit defaults are present. This is the long-term goal; migration must seed current non-optional servers so behavior does not change unexpectedly.
- Unknown default names should be returned as diagnostics by a validation helper, not silently dropped.

**TDD steps:**

1. Test fallback behavior equals current fixture behavior when no `defaults` block exists.
2. Test explicit `defaults.mcpServers` controls active MCP set.
3. Test library MCP definitions can be merged with built-in registry.
4. Test built-in ID collision behavior is deterministic and non-destructive.
5. Test unknown defaults are reported by validation helper.
6. Implement helpers.
7. Run:

```bash
bun test test/core-defaults.test.ts test/core-mcp-sync.test.ts
```

## Task 4: Wire Defaults Into Apply/Sync Without Breaking Compatibility

**Files:**

- Modify: `cli/core/sync.ts`
- Modify: `cli/core/mcp.ts`
- Modify: `cli/core/skills.ts`
- Modify: `cli/commands/apply.ts` if needed
- Modify: `cli/commands/sync.ts` if needed
- Test: `test/commands-apply.test.ts`
- Test: `test/commands-sync.test.ts`
- Test: `test/scenarios-user-journeys.test.ts`

**Behavior:**

- Existing behavior remains unchanged when no explicit `defaults` block is present.
- If `config.defaults.skills` is present, downstream skill sync uses those default skills as the global base instead of relying only on `~/.agents/skills`.
- If `config.defaults.mcpServers` is present, MCP active set uses explicit default names.
- Project `skills.include` and `skills.exclude` still apply after global defaults.
- Project `servers.<name> = { enabled: false }` can disable a globally default MCP.
- Project `servers.<name> = { enabled: true }` can enable a known non-default MCP.

**Design constraint:**

Keep `~/.agents/skills` compatibility. For this task, do not remove curation-based sync. If `defaults.skills` is absent, use current behavior. If present, include defaults by passing them through existing skill override mechanics or a clear new option.

**TDD steps:**

1. Add `commands-apply` test: config with `defaults.skills: ["alpha"]` syncs `alpha` without curated symlink.
2. Add `commands-apply` test: project excludes `alpha`, downstream skill is not linked.
3. Add `commands-mcp` or `commands-apply` test: explicit `defaults.mcpServers: ["context7"]` includes context7.
4. Add test: project disables default `context7`.
5. Implement integration.
6. Run:

```bash
bun test test/commands-apply.test.ts test/commands-sync.test.ts test/core-skills.test.ts test/core-mcp-sync.test.ts
```

## Task 5: Add `bgng library defaults list`

**Files:**

- Create: `cli/commands/library/defaults/list.ts`
- Modify: `cli/index.ts`
- Test: `test/commands-library-defaults.test.ts`
- Test: `test/commands-output-contracts.test.ts`

**Command:**

```bash
bgng library defaults list
bgng library defaults list --json
```

**Output requirements:**

Human output groups:

- `Skills`
- `MCP Servers`
- `Extensions`

For each item show:

- id/name
- status: resolved, missing, or ambiguous if applicable
- source: repo, npm, built-in, library

JSON shape:

```json
{
  "skills": [{ "id": "alpha", "status": "resolved", "source": "repo" }],
  "mcpServers": [{ "id": "context7", "status": "resolved", "source": "built-in" }],
  "extensions": [{ "id": "parallel", "status": "resolved" }]
}
```

**TDD steps:**

1. Write failing command tests.
2. Implement command using current config first; user config integration can be added after Task 7.
3. Register command in `cli/index.ts`.
4. Run:

```bash
bun test test/commands-library-defaults.test.ts test/commands-output-contracts.test.ts
```

## Task 6: Add Skill Default Add/Remove Commands

**Files:**

- Create: `cli/commands/library/defaults/add-skill.ts`
- Create: `cli/commands/library/defaults/remove-skill.ts`
- Modify: `cli/index.ts`
- Modify: `cli/core/user-config.ts`
- Modify: `cli/core/defaults.ts`
- Test: `test/commands-library-defaults.test.ts`
- Test: `test/core-user-config.test.ts`

**Commands:**

```bash
bgng library defaults add skill <skillName>
bgng library defaults remove skill <skillName>
```

Options:

```bash
--dry-run
--json
```

**Behavior:**

- Resolve skill against repo-native and package-backed inventory.
- Refuse unknown skills.
- Add/remove from `defaults.skills` in user global config.
- Preserve unrelated config fields.
- Maintain `~/.agents/skills/<skillName>` symlink when adding a default skill.
- Remove only the corresponding compatibility symlink when removing a default skill if it points to the resolved skill source; do not delete user-owned files.
- Idempotent add/remove exits `0` with `action: "already-default"` or `action: "not-default"`.
- Human output must clearly say this is a global default, not a project add.

**JSON shape:**

```json
{
  "kind": "skill",
  "id": "alpha",
  "scope": "global-default",
  "action": "added",
  "configPath": "/tmp/home/.agents/bgng/config.json",
  "next": ["bgng apply --dry-run"]
}
```

**TDD steps:**

1. Test add writes `~/.agents/bgng/config.json`.
2. Test add creates or updates `~/.agents/skills/alpha` symlink.
3. Test remove updates config and removes only the managed symlink.
4. Test package-backed skill default add works.
5. Test unknown skill fails with non-zero.
6. Test idempotency.
7. Implement commands.
8. Run:

```bash
bun test test/commands-library-defaults.test.ts test/core-skills.test.ts
```

## Task 7: Add MCP Default Add/Remove Commands

**Files:**

- Create: `cli/commands/library/defaults/add-mcp.ts`
- Create: `cli/commands/library/defaults/remove-mcp.ts`
- Modify: `cli/index.ts`
- Modify: `cli/core/defaults.ts`
- Test: `test/commands-library-defaults.test.ts`
- Test: `test/commands-mcp.test.ts`

**Commands:**

```bash
bgng library defaults add mcp <serverName>
bgng library defaults remove mcp <serverName>
```

Options:

```bash
--dry-run
--json
```

**Behavior:**

- Resolve server against built-in registry first, then user MCP library when implemented.
- Refuse unknown MCP names.
- Add/remove from `defaults.mcpServers` in user global config.
- Preserve unrelated config fields.
- Idempotent add/remove exits `0`.
- Warn if required env vars are absent, but do not store secrets and do not fail only because env is missing.
- Print `bgng apply --dry-run` as next step.

**TDD steps:**

1. Test add built-in MCP writes user global config.
2. Test remove built-in MCP updates user global config.
3. Test unknown MCP fails.
4. Test missing env warning for MCP definitions with env fields.
5. Test `apply --dry-run` includes a newly defaulted MCP.
6. Implement commands.
7. Run:

```bash
bun test test/commands-library-defaults.test.ts test/commands-mcp.test.ts test/commands-apply.test.ts
```

## Task 8: Add Persistent MCP Library Storage

**Files:**

- Create: `cli/core/mcp-library.ts`
- Modify: `cli/core/library.ts`
- Modify: `cli/core/search.ts`
- Modify: `cli/core/defaults.ts`
- Modify: `cli/core/diagnostics.ts`
- Test: `test/core-mcp-library.test.ts`
- Test: `test/core-library.test.ts`
- Test: `test/commands-library.test.ts`
- Test: `test/commands-search.test.ts`

**Core behavior:**

- Load absent library as `{ version: 1, servers: {} }`.
- Save stable JSON under `~/.agents/library/mcp-servers.json`.
- Validate server definitions using existing `RegistryServer` requirements.
- Merge built-in registry and user MCP library for lookup.
- Refuse collisions by default.
- Do not allow secret literal values to be written. Env values should be placeholders like `${TOKEN}` or empty strings; command should warn if values look like secrets.

**TDD steps:**

1. Unit test absent load.
2. Unit test save/load round trip.
3. Unit test validation rejects missing transport or invalid command shape.
4. Unit test collision detection with built-in `context7`.
5. Integration test `library list mcp` includes user library MCP entries.
6. Integration test `search mcp --library` includes user library MCP entries.
7. Implement core storage and wire read paths.
8. Run:

```bash
bun test test/core-mcp-library.test.ts test/core-library.test.ts test/commands-library.test.ts test/commands-search.test.ts
```

## Task 9: Add `bgng library add mcp`

**Files:**

- Create: `cli/commands/library/add/mcp.ts`
- Modify: `cli/index.ts`
- Modify: `cli/core/catalogs.ts` if trusted catalog add needs shared parsing
- Test: `test/commands-library.test.ts`
- Test: `test/commands-search.test.ts`

**Command:**

```bash
bgng library add mcp <file-or-catalog-id>
```

Options:

```bash
--json
--dry-run
--yes
--as <id>
--replace
```

**Supported sources in this implementation slice:**

1. Local JSON file containing either:
   - `{ "servers": { "<id>": RegistryServer } }`
   - a single `RegistryServer` plus `--as <id>`
2. Trusted MCP catalog file result when `catalogs.mcp.enabled === true`.

Do not support arbitrary npm MCP packages in this task.

**Behavior:**

- Register reusable MCP definition in `~/.agents/library/mcp-servers.json`.
- Do not add it to project config.
- Do not add it to global defaults unless `--default` is explicitly included in a later task or subtask.
- Print next steps:

```text
Next:
  bgng library defaults add mcp <id>
  bgng add mcp <id>
```

**TDD steps:**

1. Test file with multi-server registry imports selected server.
2. Test single-server file requires `--as`.
3. Test dry-run does not write.
4. Test collision fails without `--replace`.
5. Test `--replace` updates existing library entry.
6. Test output and JSON shape.
7. Implement command.
8. Run:

```bash
bun test test/commands-library.test.ts test/core-mcp-library.test.ts
```

## Task 10: Make Project `add mcp` Default-Aware

**Files:**

- Modify: `cli/commands/add/mcp.ts`
- Modify: `cli/core/library.ts` if active/default metadata is needed
- Test: `test/commands-add-mcp.test.ts`
- Test: `test/commands-library-defaults.test.ts`
- Test: `test/scenarios-user-journeys.test.ts`

**Behavior:**

- If the requested MCP is already active by global default, do not write a project override by default.
- Human output:

```text
context7 is already active by global default.
No project override needed.

Next:
  bgng apply --dry-run
```

- JSON output:

```json
{
  "kind": "mcp",
  "id": "context7",
  "scope": "project",
  "action": "already-active",
  "projectConfigPath": ".../.agents/bgng/config.json",
  "projectChanges": [],
  "next": ["bgng apply --dry-run"]
}
```

- Add `--force-project-override` only if needed by tests or user workflow; otherwise defer it.
- Project add for non-default known MCP still writes project config.
- Project add for catalog result still registers/adds as currently supported, but should avoid redundant project write if the resulting server is already defaulted.

**TDD steps:**

1. Write failing test for `add mcp context7` no-op when `context7` is a global default.
2. Write test for non-default MCP still writing project config.
3. Write JSON output test.
4. Implement.
5. Run:

```bash
bun test test/commands-add-mcp.test.ts test/scenarios-user-journeys.test.ts
```

## Task 11: Wire MCP Library Into Add/Search/Apply/Doctor

**Files:**

- Modify: `cli/core/library.ts`
- Modify: `cli/core/search.ts`
- Modify: `cli/core/project.ts`
- Modify: `cli/core/sync.ts`
- Modify: `cli/core/diagnostics.ts`
- Test: `test/commands-add-mcp.test.ts`
- Test: `test/commands-search.test.ts`
- Test: `test/commands-apply.test.ts`
- Test: `test/commands-doctor.test.ts`

**Behavior:**

- `library list mcp` shows built-in and user library MCP entries with source labels.
- `search mcp --library` searches built-in and user library entries.
- `add mcp <library-server>` can project-enable a user library MCP.
- `library defaults add mcp <library-server>` can globally default a user library MCP.
- `apply --dry-run` renders globally defaulted user library MCP servers.
- `doctor` reports:
  - defaults referencing missing MCP entries
  - project references to unknown MCP entries
  - env requirements for library MCP entries

**TDD steps:**

1. Add user library MCP fixture helper.
2. Test search/list visibility.
3. Test project add and apply.
4. Test global default add and apply.
5. Test doctor missing reference.
6. Implement integration.
7. Run:

```bash
bun test test/commands-library.test.ts test/commands-search.test.ts test/commands-add-mcp.test.ts test/commands-apply.test.ts test/commands-doctor.test.ts
```

## Task 12: Update Status, Library List, And Doctor UX

**Files:**

- Modify: `cli/commands/status.ts`
- Modify: `cli/commands/library/list.ts`
- Modify: `cli/commands/library/show.ts`
- Modify: `cli/core/diagnostics.ts`
- Test: `test/commands-status.test.ts`
- Test: `test/commands-library.test.ts`
- Test: `test/commands-doctor.test.ts`
- Test: `test/commands-output-contracts.test.ts`

**Behavior:**

- `status` includes counts for:
  - global default skills
  - global default MCP servers
  - user library MCP servers
- `library list` marks items as:
  - `available`
  - `default`
  - `project-active` when applicable
- `library show <id>` includes default status and source.
- `doctor` distinguishes:
  - stale project override because already globally defaulted
  - unknown global default
  - unknown project reference
  - missing required env var

**TDD steps:**

1. Add output contract expectations for new fields.
2. Add human output tests for status labels.
3. Add JSON output tests.
4. Implement.
5. Run:

```bash
bun test test/commands-status.test.ts test/commands-library.test.ts test/commands-doctor.test.ts test/commands-output-contracts.test.ts
```

## Task 13: Documentation Updates

**Files:**

- Modify: `README.md`
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `.ai/knowledges/02_per-project-config-guide.md`
- Modify: `.ai/knowledges/03_npm-skill-bundles-guide.md`
- Test: `test/docs-readiness.test.ts`

**Docs must explain:**

- `library add` means available, not active.
- `library defaults add` means globally active.
- `add` means current project only.
- `apply` materializes effective state.
- `~/.agents/bgng/config.json` owns user global defaults and policy.
- `~/.agents/library/mcp-servers.json` owns reusable user MCP definitions.
- `~/.agents/skills` remains compatibility publication for global/default skills.
- `skills curate` remains advanced compatibility.

**TDD steps:**

1. Update docs-readiness tests with new required phrases.
2. Update docs.
3. Run:

```bash
bun test test/docs-readiness.test.ts
```

## Task 14: Real CLI And TTY Smoke Tests

Run these manually after automated tests pass.

**Non-mutating or temp-home smoke:**

```bash
TEMP_HOME="$(mktemp -d)"
TEMP_PROJECT="$(mktemp -d)"
cd "$TEMP_PROJECT"
git init -q

AGENTS_HOME_DIR="$TEMP_HOME" \
AGENTS_DIR="$TEMP_HOME/.agents" \
AGENTS_REPO_ROOT="/Users/pureicis/dev/agents-config-saam" \
bun /Users/pureicis/dev/agents-config-saam/cli/index.ts library defaults list
```

**Skill default smoke:**

```bash
AGENTS_HOME_DIR="$TEMP_HOME" \
AGENTS_DIR="$TEMP_HOME/.agents" \
AGENTS_REPO_ROOT="/Users/pureicis/dev/agents-config-saam" \
bun /Users/pureicis/dev/agents-config-saam/cli/index.ts library defaults add skill brainstorming
```

Assert:

- `$TEMP_HOME/.agents/bgng/config.json` exists
- `$TEMP_HOME/.agents/skills/brainstorming` exists as symlink
- output says global default

**MCP default smoke:**

```bash
AGENTS_HOME_DIR="$TEMP_HOME" \
AGENTS_DIR="$TEMP_HOME/.agents" \
AGENTS_REPO_ROOT="/Users/pureicis/dev/agents-config-saam" \
bun /Users/pureicis/dev/agents-config-saam/cli/index.ts library defaults add mcp context7
```

Assert:

- `defaults.mcpServers` includes `context7`
- `bgng add mcp context7` in `$TEMP_PROJECT` does not write redundant project override

**Apply smoke:**

```bash
AGENTS_HOME_DIR="$TEMP_HOME" \
AGENTS_DIR="$TEMP_HOME/.agents" \
AGENTS_REPO_ROOT="/Users/pureicis/dev/agents-config-saam" \
bun /Users/pureicis/dev/agents-config-saam/cli/index.ts apply --dry-run --json
```

Assert:

- JSON parses
- changes include expected default skill/MCP intent
- no writes occur in dry-run

**TTY smoke:**

- Run `bgng library defaults add mcp <name>` in a PTY if guided confirmation is implemented.
- Confirm scope warning says machine-wide/global.
- Confirm no secret prompt writes secret values to disk.

## Final Verification

Run the full verification set:

```bash
bun test
bun run typecheck
bun run verify:release --json
git diff --check
```

Also run stale terminology scans:

```bash
rg -n "library add.*globally active|add mcp.*global|repo-root config.*user-editable|skills curate.*primary" README.md .ai/knowledges .ai/analyses .ai/tasks
```

Review expected no-skip status from `bun test`. If Bun reports skipped tests, document why or remove the skips before completion.

## Completion Criteria

The task is complete only when:

- all automated tests pass
- typecheck passes
- release verification passes
- real CLI smoke tests pass using temp home/project
- docs reflect the new library/default/project model
- `bgng add mcp` no longer creates redundant project overrides for globally defaulted MCPs
- no files are committed unless the user explicitly asks

## Risk Register

| Risk | Mitigation |
| --- | --- |
| Changing global config loading breaks tests | Add explicit user-config helpers first; integrate behind controlled fixture env behavior. |
| Defaults duplicate existing `~/.agents/skills` curation | Treat `~/.agents/skills` as migration input and compatibility publication layer. |
| MCP defaults conflict with `optional` semantics | Seed explicit defaults from current effective behavior; preserve `optional` during migration. |
| User library MCP entries execute unsafe commands | Require trusted catalog/file input, display command details in guided mode, never store secrets. |
| Project config starts depending on network/catalog state | Require catalog selections to be registered into library before project/default references. |
| Docs confuse library availability with activation | Use consistent phrase: library add = available, library defaults add = global, add = project. |
