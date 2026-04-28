# Target CLI UI Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the target `bgng` CLI architecture from `.ai/analyses/12_target-cli-ui-architecture.md`: `init`, `add`, `search`, `library`, `apply`, `status`, `doctor`, and advanced `extensions` / `skills` / `mcp` surfaces with compatibility for existing commands.

**Architecture:** This is an additive CLI evolution, not a rewrite. Keep existing `sync`, `skills`, `mcp`, and `extensions` commands working, add clearer aliases and project-first workflows on top, then move documentation toward the new surface. The implementation should preserve one source of truth per concern: global `config.json` for machine-wide defaults and catalog policy, project `.agents/bgng/config.json` for project intent, and the local library/package cache for installed inventory state.

**Tech Stack:** Bun, TypeScript, Clipanion, filesystem-backed project state, existing `~/.agents` curation/package layout, npm CLI for package-backed skill catalog/install, existing temp-fixture CLI tests.

---

## Evidence Base

- `.ai/analyses/12_target-cli-ui-architecture.md`
- `.ai/analyses/07_per-project-config-target-architecture.md`
- `.ai/analyses/11_extensions-architecture-beads-parallel-investigation.md`
- `.ai/knowledges/01_agents-cli-usage-guide.md`
- `.ai/knowledges/02_per-project-config-guide.md`
- `.ai/knowledges/03_npm-skill-bundles-guide.md`
- `/Users/pureicis/dev/carto/frontend_v1/.ai/knowledges/29_clipanion_manual.md`
- `npm help search` on this machine, npm `10.9.4`

## Current State Findings

Implemented now:

- `bgng init` creates minimal project config.
- `bgng sync` is the top-level materialization command.
- `bgng skills sync` and `bgng mcp sync` exist.
- `bgng skills packages add/list/show` can ingest package-backed skill bundles.
- `bgng skills curate` works for repo-native and package-backed shared skills.
- `bgng extensions list/show/status/doctor/setup` exists for Beads and Parallel.
- Project config merge supports `servers`, `skills`, `extensions`, and `targets`.

Important gaps:

- No `bgng apply` primary command.
- No `bgng mcp apply` alias.
- No `bgng add ...` project-first command group.
- No `bgng library ...` command group.
- No `bgng search ...` command group.
- No global `catalogs` config shape.
- `bgng init` is minimal-only; it does not default to guided mode.
- Pre-implementation gap: per-project `skills.include` did not resolve package-backed skills, even though those skills were available in inventory and curation.
- Project config write helpers exist under `cli/core/extensions/project-config.ts`, but generic `add skill` / `add mcp` should not import from an extension namespace.

## Implementation Strategy

Build this in compatibility-preserving layers:

1. **Fix resolution foundations first**
   - Package-backed skills must be resolvable from project `skills.include`.
   - Doctor must treat package-backed skill references as known.
   - This prevents `add skill` from writing project config that `sync` cannot apply.

2. **Introduce `apply` before changing user flows**
   - Add `bgng apply` as the primary top-level materialization command.
   - Keep `bgng sync` as compatibility.
   - Add `bgng mcp apply` as an advanced alias for `bgng apply --mcp-only`.

3. **Extract generic project config mutation helpers**
   - Move or wrap the existing extension project-config read/write helpers into a generic core module.
   - All project mutations should preserve unrelated fields and stable JSON formatting.

4. **Add project-first `add` commands using existing capabilities**
   - `add extension parallel` should call the same core behavior as `extensions setup parallel`.
   - `add skill <name>` should add a known local skill to project `skills.include`.
   - `add mcp <name>` should add a known MCP server to project `servers`.
   - Catalog-backed add behavior comes after `library` and `search` exist.

5. **Add `library` as a user-facing wrapper over current local inventory**
   - Use existing repo-native skills, package-backed skill bundles, and canonical MCP registry as the first local library sources.
   - Do not add a new JSON library database until a concrete need appears.

6. **Add `search` with source adapters**
   - Default search reads local library first, then configured catalog adapters.
   - `--library` restricts to local inventory.
   - `--catalog` restricts to online/external catalogs.
   - Skill catalog MVP can use `npm search --json`; ingestion remains guarded by existing `npm pack --ignore-scripts` and `bundle.json` validation.
   - MCP catalog MVP should use configured trusted catalog files/URLs or remain local-only until a safe source is selected. Do not infer arbitrary npm packages into executable MCP server definitions.

7. **Make guided UX last**
   - First make every mutation scriptable and testable.
   - Then add guided `init` and argumentless `add skill` / `add mcp` flows.
   - Non-TTY must require explicit flags and never silently choose interactive defaults.

## Target Command Surface

Primary:

```bash
bgng init
bgng init --non-interactive
bgng add extension <name>
bgng add skill [name-or-query]
bgng add mcp [name-or-query]
bgng search skill <query>
bgng search mcp <query>
bgng library list [skills|mcp|tools]
bgng library show <id>
bgng library add skill <package-spec>
bgng apply [--dry-run] [--json] [--target=claude|codex|cursor] [--skills-only|--mcp-only]
bgng status
bgng doctor
```

Compatibility and advanced:

```bash
bgng sync
bgng skills sync
bgng skills curate <name>
bgng skills packages add/list/show
bgng mcp sync
bgng mcp apply
bgng extensions setup/list/show/status/doctor
```

## Non-Goals For This Plan

- Do not remove `sync`.
- Do not rename project config fields to `assets`.
- Do not add a user-authored `assets` block.
- Do not add an untrusted generic MCP npm inference engine.
- Do not store secrets in project config.
- Do not implement package remove/update unless required by tests for the new library surface.
- Do not commit unless explicitly instructed.

## Task 1: Fix Package-Backed Project Skill Include Resolution

**Files:**

- Modify: `cli/core/skills.ts`
- Modify: `cli/core/diagnostics.ts`
- Test: `test/core-skills.test.ts`
- Test: `test/commands-sync.test.ts`
- Test: `test/commands-doctor.test.ts` or `test/scenarios-user-journeys.test.ts`
- Docs later: `.ai/knowledges/02_per-project-config-guide.md`, `.ai/knowledges/03_npm-skill-bundles-guide.md`

**Step 1: Write failing core test**

Add a test proving `syncSkills(..., { include: ["hello-skill"] })` links a package-backed shared skill without global curation.

Use existing `createInstalledBundle()` helper inside `test/core-skills.test.ts`.

Expected current failure:

- warning includes `unknown skill override include: hello-skill`
- downstream symlinks are absent

**Step 2: Run failing test**

```bash
bun test test/core-skills.test.ts
```

Expected: the new package-backed include test fails.

**Step 3: Implement minimal fix**

In `cli/core/skills.ts`:

- reuse the existing internal package lookup path
- change `syncSkills()` include resolution from `findRepoSkill()` to the existing available-skill resolution
- keep `exclude` precedence unchanged

Implementation direction:

```ts
const skill = await findAvailableSkill(options.repoRoot, options.agentsDir, name);
```

Do not make package-backed skills globally curated as a side effect.

**Step 4: Fix doctor knowledge**

In `cli/core/diagnostics.ts`, project config validation should consider package-backed skills known.

Implementation direction:

- replace `listRepoSkills(repoRoot)` in project issue validation with `buildSkillInventory(repoRoot, agentsDir, homeDir)` or a smaller helper such as `listAvailableSkillNames(repoRoot, agentsDir)`
- update `detectStaleSkillSymlinks()` to resolve included skills from repo or packages, matching `syncSkills()`

**Step 5: Add project-level integration test**

Create a fixture project config:

```json
{
  "version": 1,
  "skills": {
    "include": ["hello-skill"]
  }
}
```

Install a package-backed bundle into `fixture.agentsDir`, then run:

```bash
bun test test/commands-sync.test.ts
```

Assert:

- `bgng sync --dry-run` mentions `hello-skill`
- `bgng sync` creates Claude/Codex downstream symlinks
- `bgng doctor` does not report `Unknown skill reference: "hello-skill"`

**Step 6: Run focused tests**

```bash
bun test test/core-skills.test.ts test/commands-sync.test.ts test/commands-doctor.test.ts
```

Expected: all pass.

## Task 2: Add `apply` And MCP Apply Aliases

**Files:**

- Create: `cli/commands/apply.ts`
- Create: `cli/commands/mcp/apply.ts`
- Modify: `cli/index.ts`
- Optionally modify: `cli/commands/sync.ts` to share implementation
- Test: `test/commands-apply.test.ts`
- Test: `test/commands-mcp.test.ts`
- Test: `test/commands-output-contracts.test.ts`
- Test: `test/scenarios-user-journeys.test.ts`

**Step 1: Write failing tests**

Create `test/commands-apply.test.ts`:

- `bgng apply --dry-run` behaves like `bgng sync --dry-run`
- `bgng apply --json --dry-run` emits parseable JSON
- `bgng apply --mcp-only --dry-run` omits skill sync changes
- `bgng apply --skills-only --dry-run` omits MCP changes
- `bgng apply --target=claude --dry-run` limits target output
- `bgng apply --mcp-only --skills-only` fails with a usage error

Add `test/commands-mcp.test.ts` coverage:

- `bgng mcp apply --dry-run` works
- `bgng mcp apply --json --dry-run` emits parseable JSON
- `bgng mcp sync --dry-run` remains supported

**Step 2: Run failing tests**

```bash
bun test test/commands-apply.test.ts test/commands-mcp.test.ts
```

Expected: `apply` and `mcp apply` are unknown.

**Step 3: Implement `ApplyCommand`**

Create `cli/commands/apply.ts` using the same options as `SyncCommand`:

- `--dry-run`
- `--json`
- `--mcp-only`
- `--skills-only`
- `--target`

Call `syncRepository()` exactly as `SyncCommand` does.

Keep output through `renderJson()` / `renderSyncResult()`.

**Step 4: Reduce duplication**

Either:

- extract a shared `runApplyLikeCommand(command)` helper, or
- keep duplication small for now and ensure tests lock behavior

Do not remove `SyncCommand`.

**Step 5: Implement `McpApplyCommand`**

Recommended implementation:

- use `syncRepository({ mcpOnly: true, ... })`
- support `--dry-run`, `--json`, `--target`
- output through the same renderers

This guarantees top-level and MCP-namespaced apply use the same project-aware code path.

**Step 6: Register commands**

Modify `cli/index.ts`:

```ts
cli.register(ApplyCommand);
cli.register(McpApplyCommand);
```

**Step 7: Update output contract tests**

Add:

- `["apply", "--dry-run"]`
- `["apply", "--dry-run", "--json"]`
- `["mcp", "apply", "--dry-run"]`
- `["mcp", "apply", "--dry-run", "--json"]`

**Step 8: Run focused tests**

```bash
bun test test/commands-apply.test.ts test/commands-mcp.test.ts test/commands-output-contracts.test.ts
```

Expected: all pass.

## Task 3: Extract Generic Project Config Write Helpers

**Files:**

- Create: `cli/core/project-writes.ts`
- Modify: `cli/core/extensions/project-config.ts`
- Modify: `cli/core/project.ts` only if shared types need to move
- Test: `test/core-project-writes.test.ts`
- Test: `test/core-extension-commands.test.ts`
- Test: `test/commands-extensions.test.ts`

**Step 1: Write failing tests**

Create `test/core-project-writes.test.ts` for:

- `readProjectConfigForWrite(projectDir)` returns `{ version: 1 }` when absent
- `writeProjectConfigForWrite(projectDir, config)` creates `.agents/bgng/config.json`
- `includeProjectSkill(projectDir, "alpha")` preserves existing fields and avoids duplicates
- `setProjectServerOverride(projectDir, "github", { enabled: true })` preserves existing fields
- `setProjectExtensionConfig(projectDir, "parallel", {...})` preserves existing extension fields unless explicitly overwritten

**Step 2: Run failing tests**

```bash
bun test test/core-project-writes.test.ts
```

Expected: module not found.

**Step 3: Implement helper module**

Create `cli/core/project-writes.ts`.

Core functions:

```ts
export function projectConfigPath(projectDir: string): string;
export function readProjectConfigForWrite(projectDir: string): ProjectConfig;
export function writeProjectConfigForWrite(projectDir: string, config: ProjectConfig): string;
export function includeProjectSkill(projectDir: string, skillName: string): string;
export function setProjectServerOverride(projectDir: string, name: string, override: ServerOverride): string;
export function setProjectExtensionConfig(projectDir: string, extensionName: string, extensionConfig: ProjectExtensionConfig): string;
```

Rules:

- preserve unknown top-level keys
- preserve unrelated `skills`, `servers`, `extensions`, and `targets`
- sort arrays only if existing code already does so; otherwise preserve insertion order
- format with `JSON.stringify(config, null, 2) + "\n"`

**Step 4: Update extension config helper**

In `cli/core/extensions/project-config.ts`:

- remove duplicated read/write functions or re-export from `project-writes.ts`
- keep extension-specific functions where they make sense

**Step 5: Run focused tests**

```bash
bun test test/core-project-writes.test.ts test/core-extension-commands.test.ts test/commands-extensions.test.ts
```

Expected: all pass.

## Task 4: Add `bgng add extension`

**Files:**

- Create: `cli/commands/add/extension.ts`
- Modify: `cli/index.ts`
- Modify: `cli/core/extensions/parallel.ts` if command needs reusable dry-run payload
- Modify: `cli/core/extensions/beads.ts` if command needs reusable dry-run payload
- Test: `test/commands-add-extension.test.ts`
- Test: `test/commands-output-contracts.test.ts`
- Test: `test/scenarios-user-journeys.test.ts`

**Step 1: Write failing tests**

Create tests for:

- `bgng add extension parallel --mcp` writes `extensions.parallel = { enabled: true, skills: true, mcp: true }`
- `bgng add extension parallel --skip-skills` writes `skills: false`
- `bgng add extension parallel --dry-run --json` does not write config and emits planned change
- `bgng add extension beads --target=codex --include-skill` writes semantic Beads config
- unknown extension exits non-zero with a usage error

**Step 2: Run failing tests**

```bash
bun test test/commands-add-extension.test.ts
```

Expected: `add extension` unknown.

**Step 3: Implement command**

Use Clipanion path:

```ts
static override paths = [["add", "extension"]];
```

Options:

- positional `extensionName`
- `--dry-run`
- `--json`
- Parallel: `--mcp`, `--skip-skills`
- Beads: `--target`, `--include-skill`

Initial recommendation:

- `add extension parallel` should delegate to `planParallelSetup()` / `ensureParallelProjectExtensionConfig()`.
- `add extension beads` should write semantic project config through `ensureBeadsProjectExtensionConfig()`.
- Do not run external `bd init` or `bd setup` from `add extension beads` in the first slice. Leave external setup under `extensions setup beads`.

Reason:

`add` means project activation. `extensions setup` remains the advanced operation that can invoke external commands.

**Step 4: Human output**

Human output should be action-oriented:

```text
Added Parallel extension to this project.
Updated /path/project/.agents/bgng/config.json

Next:
  bgng apply --dry-run
```

For Beads:

```text
Added Beads extension to this project.
Updated /path/project/.agents/bgng/config.json

Next:
  bgng extensions setup beads --target=codex
  bgng apply --dry-run
```

**Step 5: JSON output**

Stable shape:

```json
{
  "kind": "extension",
  "id": "parallel",
  "projectConfigPath": "/path/.agents/bgng/config.json",
  "projectChanges": [
    { "kind": "extension", "id": "parallel", "action": "enabled" }
  ],
  "next": ["bgng apply --dry-run"]
}
```

**Step 6: Register and test**

Register in `cli/index.ts`.

Run:

```bash
bun test test/commands-add-extension.test.ts test/commands-extensions.test.ts test/scenarios-user-journeys.test.ts
```

Expected: all pass.

## Task 5: Add Local Skill Resolution And `bgng add skill`

**Files:**

- Create: `cli/core/library.ts`
- Create: `cli/commands/add/skill.ts`
- Modify: `cli/index.ts`
- Modify: `cli/core/skills.ts` if exported helpers are needed
- Test: `test/core-library.test.ts`
- Test: `test/commands-add-skill.test.ts`
- Test: `test/scenarios-user-journeys.test.ts`

**Step 1: Write failing core tests**

Create `test/core-library.test.ts` for:

- `listLibrarySkills(repoRoot, agentsDir, homeDir)` returns repo-native and package-backed skills
- `findLibrarySkill(..., "alpha")` returns a repo-native skill
- `findLibrarySkill(..., "hello-skill")` returns a package-backed skill
- unknown skill returns `null`

**Step 2: Implement `cli/core/library.ts` local skill functions**

Initial types:

```ts
export type LibrarySource = "repo" | "npm" | "registry";

export interface LibrarySkill {
  id: string;
  kind: "skill";
  name: string;
  scope: SkillScope;
  source: LibrarySource;
  sourceId?: string;
  sourceVersion?: string;
  path: string;
  curated: boolean;
}
```

Implementation can wrap `buildSkillInventory()`.

**Step 3: Write failing command tests**

Create `test/commands-add-skill.test.ts`:

- `bgng add skill alpha` creates project config with `skills.include: ["alpha"]`
- running it twice does not duplicate `alpha`
- `bgng add skill hello-skill` works for package-backed skill installed in `~/.agents/packages/skills`
- `bgng add skill missing --library` fails and does not create misleading config
- `bgng add skill alpha --dry-run --json` emits planned change without writing

**Step 4: Implement command**

Use Clipanion path:

```ts
static override paths = [["add", "skill"]];
```

Options:

- optional positional `queryOrName`
- `--library`
- `--dry-run`
- `--json`
- `--yes` reserved for future catalog installs

First slice behavior:

- if `queryOrName` is exact local match, write `skills.include`
- if no match and `--library`, fail
- if no match and no catalog support exists yet, fail with a clear message:

```text
No local skill found: <query>
Catalog search is not implemented yet. Try bgng search skill <query> after Task 8.
```

Do not silently curate the skill globally.

**Step 5: Run focused tests**

```bash
bun test test/core-library.test.ts test/commands-add-skill.test.ts
```

Expected: all pass.

## Task 6: Add Local MCP Resolution And `bgng add mcp`

**Files:**

- Modify: `cli/core/library.ts`
- Create: `cli/commands/add/mcp.ts`
- Modify: `cli/index.ts`
- Test: `test/core-library.test.ts`
- Test: `test/commands-add-mcp.test.ts`
- Test: `test/commands-mcp.test.ts`

**Step 1: Write failing core tests**

Extend `test/core-library.test.ts`:

- `listLibraryMcpServers(repoRoot)` returns canonical registry servers
- `findLibraryMcpServer(repoRoot, "context7")` returns a server definition
- optional/platform-provided servers are still listed with metadata
- unknown MCP returns `null`

**Step 2: Implement library MCP functions**

In `cli/core/library.ts`:

```ts
export interface LibraryMcpServer {
  id: string;
  kind: "mcp";
  source: "registry";
  server: RegistryServer;
}
```

Use `loadRegistry(repoRoot)`.

**Step 3: Write failing command tests**

Create `test/commands-add-mcp.test.ts`:

- `bgng add mcp context7` writes `servers.context7 = { enabled: true }`
- `bgng add mcp markdownify` can enable optional server
- `bgng add mcp missing --library` fails
- `bgng add mcp context7 --dry-run --json` does not write config
- command preserves existing project `skills` and `extensions`

**Step 4: Implement command**

Use Clipanion path:

```ts
static override paths = [["add", "mcp"]];
```

Options:

- optional positional `queryOrName`
- `--library`
- `--dry-run`
- `--json`
- `--yes` reserved for future catalog installs

First slice behavior:

- exact local/canonical match writes project server toggle `{ enabled: true }`
- if no match and `--library`, fail
- if no match and catalog support is not implemented, fail with search guidance

Do not store secrets. If the selected server has `env`, output required variables in next steps.

**Step 5: Run focused tests**

```bash
bun test test/core-library.test.ts test/commands-add-mcp.test.ts test/commands-mcp.test.ts
```

Expected: all pass.

## Task 7: Add `bgng library` Skill And MCP Inventory Commands

**Files:**

- Create: `cli/commands/library/list.ts`
- Create: `cli/commands/library/show.ts`
- Create: `cli/commands/library/add/skill.ts`
- Modify: `cli/index.ts`
- Modify: `cli/core/library.ts`
- Test: `test/commands-library.test.ts`
- Test: `test/commands-output-contracts.test.ts`
- Test: `test/scenarios-user-journeys.test.ts`

**Step 1: Write failing tests**

Create `test/commands-library.test.ts`:

- `bgng library list` shows skills and MCP entries
- `bgng library list skills --json` returns skill items
- `bgng library list mcp --json` returns MCP items
- `bgng library show alpha --json` returns a skill
- `bgng library show context7 --json` returns an MCP server
- `bgng library add skill <local-bundle-path>` installs a package-backed skill bundle
- `library add skill` does not add skill to project config unless a future `--project` flag is implemented

**Step 2: Run failing tests**

```bash
bun test test/commands-library.test.ts
```

Expected: `library` commands unknown.

**Step 3: Implement list command**

Paths:

```ts
static override paths = [["library", "list"]];
```

Positional optional kind:

- `skills`
- `mcp`
- `tools`

For `tools`, return empty list with a clear human message for now.

**Step 4: Implement show command**

Path:

```ts
static override paths = [["library", "show"]];
```

Resolution order:

1. exact skill id
2. exact MCP id
3. package name if useful for installed skill bundles

If ambiguous, fail with a clear disambiguation message.

**Step 5: Implement `library add skill`**

Path:

```ts
static override paths = [["library", "add", "skill"]];
```

Delegate to the same core ingestion used by `skills packages add`:

- `buildSkillInventory()`
- `ingestSkillPackage()`

Human output should say the bundle was installed into the local library.

**Step 6: Keep old commands**

Do not remove:

- `bgng skills packages add`
- `bgng skills packages list`
- `bgng skills packages show`

They remain advanced/compatibility surfaces.

**Step 7: Run focused tests**

```bash
bun test test/commands-library.test.ts test/commands-skills-packages.test.ts test/commands-output-contracts.test.ts
```

Expected: all pass.

## Task 8: Add Global Catalog Config Shape

**Files:**

- Modify: `cli/core/types.ts`
- Modify: `config.json`
- Modify: `test/helpers.ts`
- Test: `test/core-config.test.ts`
- Test: `test/core-catalogs.test.ts`

**Step 1: Write failing tests**

Add tests that:

- config without `catalogs` still loads
- config with `catalogs.npmSkills.enabled` loads
- disabled catalog prevents catalog search

**Step 2: Extend types**

In `CanonicalConfig`:

```ts
catalogs?: {
  npmSkills?: {
    enabled: boolean;
    searchLimit?: number;
  };
  mcp?: {
    enabled: boolean;
    sources?: Array<{ type: "file"; path: string } | { type: "url"; url: string }>;
  };
};
```

Keep all fields optional for backward compatibility.

**Step 3: Update default `config.json`**

Add conservative defaults:

```json
"catalogs": {
  "npmSkills": {
    "enabled": true,
    "searchLimit": 20
  },
  "mcp": {
    "enabled": false,
    "sources": []
  }
}
```

Reason:

- skill catalog search can be backed by npm and still validated at install time
- MCP online catalog should not be enabled until a trusted source exists

**Step 4: Update fixture config**

Modify `createFixtureConfig()` in `test/helpers.ts` to include catalog defaults only if needed by tests. Tests should also cover absence of `catalogs` for compatibility.

**Step 5: Run focused tests**

```bash
bun test test/core-config.test.ts test/core-catalogs.test.ts
```

Expected: all pass.

## Task 9: Add `search` Core And `bgng search skill`

**Files:**

- Create: `cli/core/catalogs.ts`
- Create: `cli/core/search.ts`
- Create: `cli/commands/search/skill.ts`
- Modify: `cli/index.ts`
- Test: `test/core-search.test.ts`
- Test: `test/commands-search.test.ts`

**Step 1: Write failing core tests**

Create `test/core-search.test.ts`:

- local skill results are returned before catalog results
- `libraryOnly: true` suppresses catalog lookup
- `catalogOnly: true` suppresses local lookup
- disabled `catalogs.npmSkills.enabled` suppresses npm lookup
- npm command failure returns warnings, not a crash, when local results exist

Use a fake npm executable in a temp `PATH` for deterministic tests.

**Step 2: Implement catalog search abstraction**

In `cli/core/catalogs.ts`:

```ts
export interface CatalogSearchResult {
  id: string;
  kind: "skill-package" | "mcp";
  title: string;
  description?: string;
  source: "npm" | "mcp-catalog";
  packageName?: string;
  version?: string;
  verified: boolean;
}
```

For npm skill search:

- run `npm search <query> --json --searchlimit=<n>`
- parse package metadata
- mark results as `verified: false` until `library add skill` validates `bundle.json`
- prefer packages with relevant keywords if/when bundle keywords are defined

Do not call `npm pack` during search.

**Step 3: Implement search composition**

In `cli/core/search.ts`:

- query local library via `library.ts`
- query enabled catalogs unless `--library`
- return results grouped by `sourceGroup: "library" | "catalog"`
- include warnings from failed catalog adapters

**Step 4: Write command tests**

Create `test/commands-search.test.ts`:

- `bgng search skill alpha --json` returns local `alpha`
- `bgng search skill hello --library --json` does not invoke fake npm
- `bgng search skill writing --json` includes fake npm results when enabled
- `bgng search skill writing --catalog --json` excludes local results
- human output labels `Local library` and `Online catalogs`

**Step 5: Implement command**

Path:

```ts
static override paths = [["search", "skill"]];
```

Options:

- positional `query`
- `--library`
- `--catalog`
- `--project`
- `--json`

`--project` can initially be a ranking hint only. It does not need advanced semantic ranking in the first slice.

**Step 6: Run focused tests**

```bash
bun test test/core-search.test.ts test/commands-search.test.ts
```

Expected: all pass.

## Task 10: Connect `add skill` To Catalog Install Flow

**Files:**

- Modify: `cli/commands/add/skill.ts`
- Modify: `cli/core/search.ts`
- Modify: `cli/core/library.ts`
- Test: `test/commands-add-skill.test.ts`
- Test: `test/scenarios-user-journeys.test.ts`

**Step 1: Write failing tests**

Add tests:

- when local skill is missing and catalog returns one package with one skill, `bgng add skill <query> --yes` installs the package and writes project `skills.include`
- when package contains multiple skills, non-interactive command fails unless exact skill can be selected or `--all` is passed
- `--library` prevents catalog install
- failed bundle validation does not write project config

Use local package fixture paths in fake catalog results where possible so tests avoid network.

**Step 2: Define non-interactive rules**

For this slice:

- exact local skill match: no `--yes` required
- one catalog package result and `--yes`: install package, then choose matching skill if unambiguous
- multiple skills or multiple catalog results: fail with guidance in non-TTY
- future interactive picker will handle ambiguity

**Step 3: Implement flow**

Algorithm:

1. Search local library by exact name.
2. If found, write project include.
3. If not found and `--library`, fail.
4. Search catalog.
5. If ambiguous and no TTY picker, fail.
6. Install selected package through `ingestSkillPackage()`.
7. Rebuild library inventory.
8. Add selected skill(s) to project config.
9. Output library and project changes.

**Step 4: Run focused tests**

```bash
bun test test/commands-add-skill.test.ts test/commands-search.test.ts test/scenarios-user-journeys.test.ts
```

Expected: all pass.

## Task 11: Add `search mcp` And Prepare Trusted MCP Catalogs

**Files:**

- Modify: `cli/core/catalogs.ts`
- Modify: `cli/core/search.ts`
- Create: `cli/commands/search/mcp.ts`
- Modify: `cli/index.ts`
- Test: `test/core-search.test.ts`
- Test: `test/commands-search.test.ts`

**Step 1: Write local MCP search tests**

Tests:

- `bgng search mcp context --json` returns `context7`
- `bgng search mcp github --library --json` does not invoke catalog adapters
- human output labels local MCP results

**Step 2: Add trusted catalog source interface**

Do not infer arbitrary npm MCP server packages.

Supported MVP catalog source:

```ts
type McpCatalogSource =
  | { type: "file"; path: string }
  | { type: "url"; url: string };
```

Catalog entry shape:

```ts
interface McpCatalogEntry {
  id: string;
  description: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  requiredEnv?: string[];
}
```

File source can be implemented first. URL source can be deferred unless tests need it.

**Step 3: Implement `bgng search mcp`**

Path:

```ts
static override paths = [["search", "mcp"]];
```

Options:

- `--library`
- `--catalog`
- `--project`
- `--json`

**Step 4: Run focused tests**

```bash
bun test test/core-search.test.ts test/commands-search.test.ts
```

Expected: all pass.

## Task 12: Connect `add mcp` To Trusted Catalog Flow

**Files:**

- Modify: `cli/commands/add/mcp.ts`
- Modify: `cli/core/library.ts`
- Modify: `cli/core/project-writes.ts`
- Test: `test/commands-add-mcp.test.ts`
- Test: `test/scenarios-user-journeys.test.ts`

**Step 1: Write failing tests**

Add tests:

- local canonical MCP exact match writes `{ enabled: true }`
- trusted catalog MCP exact match writes full project-local server definition
- required env vars are reported in human output and not stored as secrets
- ambiguous catalog results fail non-interactively unless exact id is provided
- `--library` prevents catalog lookup

**Step 2: Implement flow**

Algorithm:

1. Resolve exact local MCP by id from canonical registry.
2. If found, write `servers[id] = { enabled: true }`.
3. If not found and `--library`, fail.
4. Search trusted MCP catalog sources.
5. If exact/unambiguous, write full server definition into project `servers[id]`.
6. Preserve `env` placeholders and report required variables.

**Step 3: Run focused tests**

```bash
bun test test/commands-add-mcp.test.ts test/commands-search.test.ts test/scenarios-user-journeys.test.ts
```

Expected: all pass.

## Task 13: Implement Init Mode Semantics

**Files:**

- Create: `cli/core/interactivity.ts`
- Modify: `cli/commands/init.ts`
- Modify: `test/helpers.ts` if stdin support is needed
- Test: `test/commands-init.test.ts`
- Test: `test/scenarios-user-journeys.test.ts`

**Step 1: Write failing tests**

Update `test/commands-init.test.ts`:

- `bgng init --non-interactive` creates minimal config
- `bgng init --minimal` creates minimal config
- `bgng init` in non-TTY exits non-zero with guidance to use `--non-interactive`
- `bgng init --guided` in non-TTY exits non-zero with clear TTY guidance
- existing overwrite and `.gitignore` warning tests use `--non-interactive`

**Step 2: Implement mode resolver**

Create `cli/core/interactivity.ts`:

```ts
export type InitMode = "guided" | "minimal" | "error";

export function resolveInitMode(options: {
  guided: boolean;
  nonInteractive: boolean;
  minimal: boolean;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
}): { mode: InitMode; message?: string } {
  // pure function for unit tests
}
```

Rules:

- `--guided` requires TTY
- `--non-interactive` selects minimal unless explicit future setup flags are supplied
- `--minimal` selects minimal and implies non-interactive
- no flags + TTY selects guided
- no flags + non-TTY errors

**Step 3: Update command**

Add flags:

- `--guided`
- `--non-interactive`
- `--minimal`
- existing `--force`

For now, if mode is guided, call the guided wizard from Task 14. If Task 14 is not implemented yet, return a clear "guided init is not implemented yet; use --non-interactive" error. Do not silently create minimal config in interactive mode.

**Step 4: Run focused tests**

```bash
bun test test/commands-init.test.ts test/scenarios-user-journeys.test.ts
```

Expected: all pass after scenario tests are updated to use `--non-interactive` where appropriate.

## Task 14: Implement Guided Init Wizard

**Files:**

- Create: `cli/core/prompts.ts`
- Modify: `cli/commands/init.ts`
- Modify: `test/helpers.ts`
- Test: `test/commands-init-guided.test.ts`

**Step 1: Add stdin support to CLI helper**

Extend `runAgentsCli()` with optional input:

```ts
export async function runAgentsCli(
  args: string[],
  env: Record<string, string>,
  cwd?: string,
  options?: { input?: string; forceTty?: boolean }
)
```

If true TTY simulation is impractical, keep wizard logic unit-testable through prompt function injection and test command-level non-TTY behavior separately.

**Step 2: Implement minimal prompt abstraction**

Use Node `readline/promises` or small stdin/stdout helpers.

Keep prompts simple:

- create project config?
- enable Parallel?
- enable Parallel MCP?
- enable Beads?
- Beads targets?
- include Beads skill?

Do not add fuzzy search pickers in this task.

**Step 3: Write wizard tests**

Test pure wizard function with mocked answers:

- selecting Parallel writes `extensions.parallel`
- selecting Beads writes `extensions.beads`
- selecting no extensions writes `{ version: 1 }`
- preview is shown before writing

**Step 4: Run focused tests**

```bash
bun test test/commands-init-guided.test.ts test/commands-init.test.ts
```

Expected: all pass.

## Task 15: Implement Argumentless Guided `add skill` And `add mcp`

**Files:**

- Modify: `cli/commands/add/skill.ts`
- Modify: `cli/commands/add/mcp.ts`
- Modify: `cli/core/prompts.ts`
- Test: `test/commands-add-guided.test.ts`

**Step 1: Define behavior**

When no positional query is provided:

- TTY: prompt for category/query, show local and catalog results, ask selection, preview changes, confirm
- non-TTY: fail with guidance to pass a name/query or use `--json` search first

**Step 2: Write tests for pure selection logic**

Test:

- local result selected writes project include/toggle
- catalog package selected installs to library first
- user cancels writes nothing
- ambiguous result prompts disambiguation

**Step 3: Implement prompt integration**

Reuse the same search and add core functions as direct commands. Do not create a separate guided-only mutation path.

**Step 4: Run focused tests**

```bash
bun test test/commands-add-guided.test.ts test/commands-add-skill.test.ts test/commands-add-mcp.test.ts
```

Expected: all pass.

## Task 16: Update Documentation And Knowledge Docs

**Files:**

- Modify: `README.md`
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `.ai/knowledges/02_per-project-config-guide.md`
- Modify: `.ai/knowledges/03_npm-skill-bundles-guide.md`
- Test: `test/docs-readiness.test.ts`

**Step 1: Update README quickstart**

Primary path should become:

```bash
bgng init
bgng add extension parallel
bgng add skill <name-or-query>
bgng apply --dry-run
bgng apply
```

Mention:

- `sync` is still supported as compatibility
- `skills curate` remains prominent for global curation
- `library` is local inventory
- `search` searches local library plus configured catalogs by default

**Step 2: Update CLI usage guide**

Add sections:

- `apply`
- `add`
- `library`
- `search`
- `init --non-interactive`
- compatibility notes for `sync`

**Step 3: Update per-project config guide**

Remove limitation:

- project `skills.include` now resolves package-backed skills too

Clarify:

- project config stores project intent only
- catalog sources are central/global config, not project config

**Step 4: Update npm skill bundles guide**

Add project-level flow:

```bash
bgng library add skill <package>
bgng add skill <skill>
bgng apply --dry-run
bgng apply
```

Keep global curation flow:

```bash
bgng skills curate <skill>
bgng apply --skills-only
```

**Step 5: Run docs tests**

```bash
bun test test/docs-readiness.test.ts
```

Expected: pass.

## Task 17: Add End-To-End User Journey Coverage

**Files:**

- Modify: `test/scenarios-user-journeys.test.ts`
- Modify: `test/commands-output-contracts.test.ts`
- Possibly create: `test/scenarios-target-cli-ui.test.ts`

**Step 1: Add happy-path journey**

Test:

```bash
bgng init --non-interactive
bgng add extension parallel
bgng add skill alpha
bgng add mcp context7
bgng apply --dry-run
bgng apply
bgng status
bgng doctor
```

Assert:

- project config contains extension, skill, server
- apply writes expected downstream state
- doctor has no project config issues

**Step 2: Add local library journey**

Test:

```bash
bgng library add skill <fixture-bundle>
bgng add skill hello-skill
bgng apply
```

Assert:

- bundle is installed
- project config includes `hello-skill`
- downstream symlinks point into package cache

**Step 3: Add search journey with fake npm**

Test:

```bash
bgng search skill "writing" --json
```

Assert:

- local and catalog groups are present
- fake npm output is parsed
- `--library` suppresses fake npm

**Step 4: Run scenario tests**

```bash
bun test test/scenarios-user-journeys.test.ts test/scenarios-target-cli-ui.test.ts
```

Expected: all pass.

## Task 18: Release Verification

**Files:**

- No new files unless failures require fixes.

**Step 1: Run typecheck**

```bash
bun run typecheck
```

Expected: no TypeScript errors.

**Step 2: Run full tests**

```bash
bun test
```

Expected: all tests pass, no skips.

**Step 3: Run release readiness**

```bash
bun run verify:release --json
```

Expected:

- `"ok": true`
- no unexpected warnings

**Step 4: Run whitespace check**

```bash
git diff --check
```

Expected: no output.

**Step 5: Inspect public help**

```bash
bun run bgng -- --help
bun run bgng -- apply --help
bun run bgng -- add skill --help
bun run bgng -- add mcp --help
bun run bgng -- library list --help
bun run bgng -- search skill --help
```

Expected:

- commands appear under clear categories
- descriptions do not mention implementation internals
- old commands still appear and work

## Final Acceptance Criteria

The task is complete when all are true:

- `bgng apply` works and `bgng sync` remains supported.
- `bgng mcp apply` works and `bgng mcp sync` remains supported.
- `bgng add extension parallel` and `bgng add extension beads` write semantic project config.
- `bgng add skill <name>` adds repo-native or package-backed local skills to project config.
- `bgng add mcp <name>` enables known MCP servers project-locally.
- `bgng library list/show/add skill` exposes local inventory without replacing advanced `skills packages`.
- `bgng search skill` searches local library and npm catalog sources by default.
- `--library` restricts add/search to local inventory.
- Project `skills.include` resolves package-backed skills.
- `bgng init` has explicit non-interactive behavior and a path to guided setup.
- README and `.ai/knowledges` describe the new command model.
- Full verification passes:
  - `bun run typecheck`
  - `bun test`
  - `bun run verify:release --json`
  - `git diff --check`

## Sequencing Notes

- Tasks 1 through 3 are foundations and should be completed first.
- Tasks 4 through 7 deliver useful CLI UX without online search.
- Tasks 8 through 12 add catalog-backed discovery carefully.
- Tasks 13 through 15 add interactive behavior after direct/scriptable paths are stable.
- Tasks 16 through 18 close docs and verification.

If time is limited, the highest-value shippable slice is Tasks 1 through 7 plus Task 16 and Task 18. That yields `apply`, `add`, and `library` without taking on online catalog ambiguity yet.
