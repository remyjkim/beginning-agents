# Extensions Architecture And Beads Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-class `bgng extensions` architecture where extensions are named capability families and most extensions can be configured per project through `<project>/.agents/bgng/config.json`.

**Architecture:** Extensions are named capability families managed by `bgng`. They are distinct from package-backed skill bundles and MCP servers: an extension can combine CLI prerequisites, repo-native skills, optional MCP, project setup actions, status checks, and doctor checks. Project config stores semantic extension intent under `extensions`; extension handlers translate that intent into skill overrides, MCP toggles, setup actions, and diagnostics. Beads is CLI-first and project-scoped. Parallel is CLI+skills-first and can be selected per project so the project starts using the Parallel CLI-backed skills without requiring global curation.

**Tech Stack:** Bun, TypeScript, Clipanion, filesystem-backed project state, existing `~/.agents` curation model, existing MCP rendering/sync pipeline, fake executable fixtures in tests.

**Evidence Base:**

- `.ai/analyses/11_extensions-architecture-beads-parallel-investigation.md`
- Beads docs: https://gastownhall.github.io/beads/
- Beads IDE setup docs: https://gastownhall.github.io/beads/getting-started/ide-setup
- Beads MCP docs: https://gastownhall.github.io/beads/integrations/mcp-server
- Parallel developer quickstart: https://docs.parallel.ai/integrations/developer-quickstart
- Parallel CLI docs: https://docs.parallel.ai/integrations/cli

---

## Implementation Strategy

Lock these decisions before coding:

1. **Use "extensions" as the user-facing term**
   - Rename future-facing docs from "integrations" to "extensions" where the concept is a named capability family.
   - Do not rename package-backed skill bundles; those remain "skill bundles".
   - Do not rename MCP servers; MCP is one possible extension mode.

2. **Add a general extension architecture before Beads-specific commands**
   - Avoid a one-off `bgng beads ...` command group.
   - Use `bgng extensions ...` for Beads and Parallel.

3. **Keep extensions typed in code for v1**
   - Do not introduce an external JSON extension registry yet.
   - Add typed extension definitions under `cli/core/extensions`.
   - This keeps v1 simple while leaving room for schemas later.

4. **Beads is project-scoped and CLI-first**
   - Default Beads support checks and invokes `bd`.
   - Beads MCP is opt-in and secondary.
   - Beads remains responsible for issue tracking, hooks, setup recipes, and `.beads` state.
   - `bgng` orchestrates setup, status, diagnostics, and skill inclusion.

5. **Parallel is globally compatible and project-selectable**
   - Do not break `config.parallel`.
   - Keep repo-level `config.parallel` as the global default and compatibility layer.
   - Add project-level `extensions.parallel` as the preferred project intent surface.
   - `extensions.parallel.enabled: true` should derive the four Parallel skills for that project.
   - `extensions.parallel.mcp: true` should enable `parallel-search` and `parallel-task` only for that project.
   - `extensions.parallel.enabled: false` should exclude the Parallel skills and disable Parallel MCP for that project.

6. **Setup commands are explicit and dry-runnable**
   - `status` and `doctor` must not mutate state.
   - `setup --dry-run` must show planned commands.
   - Beads setup must never run `bd init --force` by default.
   - Beads setup must never run `bd doctor --fix` by default.

7. **Use fake executables in tests**
   - Do not depend on the real local `bd` or `parallel-cli` in automated tests.
   - Put fake `bd` / `parallel-cli` scripts in temp directories and prepend them to `PATH`.
   - Verify commands issued by writing to a temp log file.

8. **Keep the first slice useful but bounded**
   - Implement list/show/status/doctor and Beads dry-run setup first.
   - Then implement real Beads setup execution.
   - Implement Parallel project selection through semantic project config.
   - Leave Beads MCP enablement as a planned follow-up unless the CLI path is stable.

9. **Project extension config is semantic**
   - Store extension choices in `<project>/.agents/bgng/config.json` under `extensions`.
   - Do not make users manually list low-level skill names for common extension activation.
   - Preserve `skills.include` and `skills.exclude` as lower-level overrides.
   - `skills.exclude` must win over extension-derived skill includes.

Example project config:

```json
{
  "version": 1,
  "extensions": {
    "parallel": {
      "enabled": true,
      "skills": true,
      "mcp": false
    },
    "beads": {
      "enabled": true,
      "targets": ["codex", "claude"],
      "includeSkill": true
    }
  }
}
```

## Target Command Surface

Add:

```bash
bgng extensions list [--json]
bgng extensions show <extensionName> [--json]
bgng extensions status [extensionName] [--json]
bgng extensions doctor [extensionName] [--json]
bgng extensions setup beads [--dry-run] [--json] [--target #0] [--stealth] [--skip-bd-init] [--skip-bd-setup]
bgng extensions setup parallel [--dry-run] [--json] [--mcp] [--skip-skills]
```

For the first implementation, treat `--target` as a repeatable Clipanion array option if practical. If repeatable parsing is awkward, accept one comma-separated string and normalize it into `codex`, `claude`, and `cursor` values. Tests must cover whichever syntax is implemented.

`bgng extensions setup parallel` should not authenticate with Parallel or install `parallel-cli`; it should write semantic project config and let status/doctor report missing CLI/auth prerequisites.

## Extension Definitions

Create a typed definition model similar to:

```ts
export type ExtensionScope = "global" | "project";
export type ExtensionMode = "cli" | "skills" | "mcp" | "hooks";

export interface ExtensionCommandRequirement {
  name: string;
  required: boolean;
  installHints: string[];
}

export interface ExtensionSkillReference {
  name: string;
  source: "repo" | "package";
  defaultIncluded: boolean;
}

export interface ExtensionMcpReference {
  name: string;
  defaultEnabled: boolean;
  scope: ExtensionScope;
}

export interface ExtensionDefinition {
  id: string;
  displayName: string;
  description: string;
  scopes: ExtensionScope[];
  defaultModes: ExtensionMode[];
  commands: ExtensionCommandRequirement[];
  skills: ExtensionSkillReference[];
  mcpServers: ExtensionMcpReference[];
  docs: Array<{ label: string; url: string }>;
}
```

Initial definitions:

- `beads`
- `parallel`

Beads definition:

- scopes: `project`
- default modes: `cli`, `skills`, `hooks`
- required command: `bd`
- optional command: `beads-mcp`
- skill: `beads-task-tracking`
- optional MCP server: `beads`

Parallel definition:

- scopes: `global`, `project`
- default modes: `cli`, `skills`
- required command: `parallel-cli`
- skills: four existing Parallel skills
- optional MCP servers: `parallel-search`, `parallel-task`

## Task 1: Add extension domain types and registry

**Files:**

- Create: `cli/core/extensions/types.ts`
- Create: `cli/core/extensions/registry.ts`
- Test: `test/core-extensions.test.ts`

**Step 1: Write failing tests**

Add tests for:

- `listExtensions()` returns `beads` and `parallel`
- `getExtension("beads")` returns a project-scoped definition
- `getExtension("parallel")` returns a global definition with existing Parallel skill names
- unknown extension returns `null`

Example test shape:

```ts
import { describe, expect, test } from "bun:test";
import { getExtension, listExtensions } from "../cli/core/extensions/registry";

describe("extension registry", () => {
  test("lists built-in extension definitions", () => {
    expect(listExtensions().map((extension) => extension.id)).toEqual(["beads", "parallel"]);
  });

  test("defines beads as project-scoped CLI-first extension", () => {
    const beads = getExtension("beads");
    expect(beads?.scopes).toContain("project");
    expect(beads?.commands.some((command) => command.name === "bd" && command.required)).toBe(true);
    expect(beads?.skills.map((skill) => skill.name)).toContain("beads-task-tracking");
  });

  test("defines parallel as global CLI skill extension", () => {
    const parallel = getExtension("parallel");
    expect(parallel?.scopes).toContain("global");
    expect(parallel?.commands.some((command) => command.name === "parallel-cli")).toBe(true);
    expect(parallel?.skills.map((skill) => skill.name)).toContain("parallel-web-search");
  });
});
```

**Step 2: Run failing test**

Run:

```bash
bun test test/core-extensions.test.ts
```

Expected:

- FAIL because the module does not exist.

**Step 3: Implement registry**

Add the types and static definitions. Keep this pure and dependency-free.

**Step 4: Run passing test**

Run:

```bash
bun test test/core-extensions.test.ts
```

Expected:

- PASS.

## Task 2: Add command execution helpers for extensions

**Files:**

- Create: `cli/core/extensions/commands.ts`
- Test: `test/core-extension-commands.test.ts`

**Purpose:**

Provide a small wrapper around external command checks that can be tested with fake executables.

Functions:

```ts
export interface CommandCheck {
  command: string;
  available: boolean;
  path?: string;
}

export async function findCommand(command: string, env?: NodeJS.ProcessEnv): Promise<CommandCheck>;

export async function runExternalCommand(options: {
  cmd: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ exitCode: number; stdout: string; stderr: string }>;
```

**Tests:**

- fake command in temp `PATH` is detected
- missing command returns `available: false`
- `runExternalCommand` captures stdout/stderr/exit code

Use helper scripts in temp directories. Do not call real `bd`.

## Task 3: Add `bgng extensions list` and `show`

**Files:**

- Create: `cli/commands/extensions/list.ts`
- Create: `cli/commands/extensions/show.ts`
- Modify: `cli/index.ts`
- Test: `test/commands-extensions-list-show.test.ts`

**Behavior:**

`bgng extensions list` human output shows:

- id
- display name
- scopes
- default modes

`bgng extensions list --json` returns an array of definitions or compact summaries.

`bgng extensions show beads` human output shows:

- description
- scopes
- commands
- skills
- MCP servers
- docs

`bgng extensions show beads --json` returns the full definition.

Unknown extension exits non-zero with a clear `UsageError`.

**Verification:**

```bash
bun test test/commands-extensions-list-show.test.ts
bun test test/cli-smoke.test.ts
```

## Task 4: Add extension status core

**Files:**

- Create: `cli/core/extensions/status.ts`
- Test: `test/core-extension-status.test.ts`

**Status model:**

```ts
export interface ExtensionStatus {
  id: string;
  displayName: string;
  available: boolean;
  scope: "global" | "project" | "mixed";
  commands: Array<{ name: string; required: boolean; available: boolean; installHints: string[] }>;
  skills: Array<{ name: string; present: boolean; curated: boolean }>;
  mcpServers: Array<{ name: string; configured: boolean; active: boolean }>;
  project?: {
    cwd: string;
    beadsDirExists?: boolean;
  };
  warnings: string[];
}
```

**Beads status behavior:**

- Check `bd` availability.
- Check `.beads/` existence in current working directory.
- Check `beads-task-tracking` skill presence in the repo.
- Do not run mutating commands.
- If `bd` exists and `.beads/` exists, optionally run `bd info --json` and tolerate failure.

**Parallel status behavior:**

- Check `parallel-cli` availability.
- Check four Parallel skills exist.
- Check `parallel-search` and `parallel-task` registry presence and active state from current config.
- Preserve existing `config.parallel` behavior.

**Tests:**

- missing `bd` reports unavailable command and install hints
- existing `.beads/` sets `project.beadsDirExists = true`
- fake `parallel-cli` makes Parallel command available
- Parallel MCP state reflects `config.parallel.mcp.enabled`

## Task 5: Add `bgng extensions status`

**Files:**

- Create: `cli/commands/extensions/status.ts`
- Modify: `cli/index.ts`
- Test: `test/commands-extensions-status.test.ts`

**Behavior:**

```bash
bgng extensions status
bgng extensions status beads
bgng extensions status beads --json
```

No extension name:

- reports all extension statuses

With extension name:

- reports one extension

Human output should be compact and diagnostic:

```text
extension  available  scope    notes
beads      no         project  missing bd; .beads absent
parallel   yes        global   cli present; mcp disabled
```

JSON output should expose structured statuses.

## Task 6: Add extension doctor core and command

**Files:**

- Create: `cli/core/extensions/doctor.ts`
- Create: `cli/commands/extensions/doctor.ts`
- Modify: `cli/index.ts`
- Test: `test/commands-extensions-doctor.test.ts`

**Behavior:**

`doctor` is report-only.

For Beads:

- missing `bd` is an issue with install hints
- missing `.beads/` is an issue with `bgng extensions setup beads` hint
- if `.beads/` exists and `bd` exists, run `bd doctor --json` or `bd doctor --agent --json`
- tolerate non-JSON output and report it as a warning

For Parallel:

- missing `parallel-cli` is an issue
- missing Parallel skills are issues
- if MCP is enabled and registry entries are missing, report issue

Tests:

- fake missing commands
- fake `bd doctor --json` success
- fake `bd doctor` failure
- JSON and human output contracts

## Task 7: Add repo-native Beads skill

**Files:**

- Create: `skills/shared/beads-task-tracking/SKILL.md`
- Test: extend `test/core-extensions.test.ts` or add `test/beads-skill.test.ts`

**Skill content requirements:**

- Trigger when project uses Beads or user asks to track work/issues/tasks with `bd`.
- Tell agents to prefer JSON output where possible.
- Use:
  - `bd ready --json`
  - `bd create ... --json`
  - `bd update <id> --claim --json`
  - `bd close <id> --reason ... --json`
  - `bd doctor --json`
  - `bd prime` for complete current workflow context
- Avoid:
  - interactive `bd edit`
  - destructive `bd init --force`
  - `bd doctor --fix` unless explicitly requested

**Test:**

- assert file exists
- assert it mentions `bd ready --json`, `bd update`, `bd close`, and `bd prime`

## Task 8: Add Beads dry-run setup planner

**Files:**

- Create: `cli/core/extensions/beads.ts`
- Test: `test/core-beads-extension.test.ts`

**Planner output:**

```ts
export interface BeadsSetupPlan {
  projectDir: string;
  beadsDirExists: boolean;
  commands: Array<{ cmd: string[]; reason: string; mutates: boolean }>;
  warnings: string[];
}
```

Planner inputs:

```ts
export interface BeadsSetupOptions {
  projectDir: string;
  targets: Array<"codex" | "claude" | "cursor">;
  stealth?: boolean;
  skipBdInit?: boolean;
  skipBdSetup?: boolean;
}
```

Planner rules:

- if `.beads/` is absent and `!skipBdInit`, plan `bd init --quiet --non-interactive`
- if `stealth`, include `--stealth` in init and setup commands where supported
- if `!skipBdSetup`, plan `bd setup <target> --check` and `bd setup <target>`
- default targets should be `codex`, `claude`, and `cursor`
- never include `bd init --force`
- never include `bd doctor --fix`

Tests:

- fresh project plans init and setup commands
- existing `.beads/` skips init
- `--skip-bd-init` skips init
- `--skip-bd-setup` skips setup
- target selection narrows setup commands
- stealth adds stealth flag

## Task 9: Add `bgng extensions setup beads --dry-run`

**Files:**

- Create: `cli/commands/extensions/setup.ts`
- Modify: `cli/index.ts`
- Test: `test/commands-extensions-setup.test.ts`

**Initial behavior:**

Support only:

```bash
bgng extensions setup beads --dry-run
bgng extensions setup beads --dry-run --json
```

The command should:

- validate extension name
- verify `bd` availability and report install hints if missing
- build setup plan
- print planned commands
- exit non-zero if `bd` is missing
- not mutate project state

Run tests with fake PATH.

## Task 10: Implement real Beads setup execution

**Files:**

- Modify: `cli/commands/extensions/setup.ts`
- Modify: `cli/core/extensions/beads.ts`
- Test: extend `test/commands-extensions-setup.test.ts`

**Behavior:**

Without `--dry-run`, execute planned mutating commands in order.

Command execution rules:

- run commands in the current project directory
- stop on first non-zero command
- surface stdout/stderr in JSON mode
- in human mode, show concise progress and failure messages
- do not run if `bd` is missing

Flags:

- `--target=codex`
- `--target=claude`
- `--target=cursor`
- repeatable or comma-separated, matching the decision made in the command-surface section
- `--stealth`
- `--skip-bd-init`
- `--skip-bd-setup`
- `--json`

Tests:

- fake `bd` receives expected command sequence
- existing `.beads/` avoids `bd init`
- failing fake `bd` stops execution and exits non-zero
- dry-run produces no command log

## Task 11: Wire Beads project skill inclusion

**Files:**

- Modify: `cli/core/extensions/beads.ts`
- Modify: `cli/commands/extensions/setup.ts`
- Test: extend `test/commands-extensions-setup.test.ts`

**Behavior:**

Add a flag:

```bash
bgng extensions setup beads --include-skill
```

When present:

- ensure project config exists, creating `.agents/bgng/config.json` if necessary
- add `beads-task-tracking` to `skills.include` if absent
- preserve existing project config fields
- do not duplicate skill entries

This should be explicit rather than default because Beads' own `bd setup` already writes agent-facing rules for many tools.

Tests:

- creates project config when missing
- appends include without removing existing entries
- no duplicate include on repeated setup
- dry-run reports planned config change without writing

## Task 12: Add Parallel extension status and doctor compatibility

**Files:**

- Modify: `cli/core/extensions/status.ts`
- Modify: `cli/core/extensions/doctor.ts`
- Test: `test/core-extension-status.test.ts`
- Test: `test/commands-extensions-doctor.test.ts`

**Behavior:**

Parallel extension status should reflect:

- `parallel-cli` availability
- four repo-native Parallel skills present
- `config.parallel.cli.enabled`
- `config.parallel.mcp.enabled`
- `parallel-search` and `parallel-task` active only when MCP enabled

Parallel doctor should report:

- missing CLI when `config.parallel.cli.enabled`
- missing skills
- missing MCP registry entries if MCP is enabled

Do not change existing sync behavior.

## Task 13: Optional Beads MCP planning hook only

**Files:**

- Modify: `mcp-servers.json` only if choosing to add a canonical optional `beads` entry
- Modify: `cli/core/extensions/registry.ts`
- Test: `test/core-extensions.test.ts`

**Recommended v1 decision:**

Do not enable Beads MCP in setup yet.

Instead:

- define the optional MCP reference in the extension definition
- document that Beads MCP support is planned/optional
- leave actual MCP enablement for a later task once CLI setup is stable

If adding `mcp-servers.json` entry now, mark optional and disabled in `config.json`:

```json
"beads": {
  "description": "Beads MCP server for project issue tracking",
  "transport": "stdio",
  "command": "beads-mcp",
  "args": [],
  "notes": "Optional. Beads CLI setup is preferred for shell-capable coding agents.",
  "optional": true
}
```

And:

```json
"optional": {
  "beads": false
}
```

Only do this if tests prove it does not imply default MCP support.

## Task 14: Rename public docs from integrations to extensions

**Files:**

- Modify: `README.md`
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `.ai/knowledges/02_per-project-config-guide.md` if references are relevant
- Modify: `.ai/knowledges/03_npm-skill-bundles-guide.md` if terminology needs clarification
- Modify: `test/docs-readiness.test.ts`

**Behavior:**

- "Optional Integrations" becomes "Optional Extensions" where user-facing.
- Parallel section should say it is currently supported as an extension with CLI+skills default and optional MCP overlay.
- Add a Beads section that describes the command surface and project-scoped behavior.
- Do not rename external docs URLs containing `/integrations/`.

Tests:

- docs readiness expects `bgng extensions`
- docs readiness expects `beads`
- docs readiness still expects `parallel`, `markdownify`, and `sync-mcp.ts`

## Task 15: End-to-end scenario coverage

**Files:**

- Modify: `test/scenarios-user-journeys.test.ts`
- Modify: `test/commands-output-contracts.test.ts`

Add scenarios:

1. Project user checks Beads extension before setup:
   - fake no `bd`
   - `bgng extensions status beads --json`
   - reports missing `bd`

2. Project user dry-runs Beads setup:
   - fake `bd`
   - no `.beads`
   - dry-run reports `bd init` and setup commands
   - no `.beads` is created

3. Project user runs Beads setup:
   - fake `bd` creates `.beads`
   - fake log records commands
   - status reports `.beads` present

4. Parallel extension status remains compatible:
   - fake `parallel-cli`
   - existing Parallel config
   - `bgng extensions status parallel --json` reports CLI and MCP mode accurately

## Task 16: Add generic project extension config derivation

**Files:**

- Modify: `cli/core/types.ts`
- Modify: `cli/core/project.ts`
- Create: `cli/core/extensions/project-config.ts`
- Test: `test/core-project.test.ts`

**Behavior:**

Add `extensions` to `ProjectConfig`:

```ts
extensions?: Record<string, ProjectExtensionConfig>;
```

Rules:

- `extensions.parallel.enabled: true` derives the four Parallel skills into effective project skill includes.
- `extensions.parallel.skills: false` excludes the four Parallel skills for that project.
- `extensions.parallel.mcp: true` enables the effective `config.parallel.mcp.enabled` for that project.
- `extensions.parallel.enabled: false` excludes the Parallel skills and disables Parallel MCP for that project.
- `extensions.beads.enabled: true` records Beads as selected for the project.
- `extensions.beads.includeSkill: true` derives `beads-task-tracking` into effective project skill includes.
- Existing `skills.include` and `skills.exclude` are preserved.
- `skills.exclude` wins over extension-derived includes.
- Unknown extension names are accepted by the loader but reported by doctor.

Tests:

- project Parallel enabled derives all four skill includes
- project Parallel MCP enabled flips effective Parallel MCP on without changing global config
- project Parallel disabled derives all four skill excludes
- project Beads includeSkill derives `beads-task-tracking`
- explicit project `skills.exclude` wins over derived includes

## Task 17: Make extension status and doctor project-aware

**Files:**

- Modify: `cli/core/extensions/status.ts`
- Modify: `cli/core/extensions/doctor.ts`
- Modify: `cli/commands/extensions/status.ts`
- Modify: `cli/commands/extensions/doctor.ts`
- Test: `test/commands-extensions.test.ts`

**Behavior:**

- Load and merge the nearest project config when present.
- Report whether the extension is configured for the current project.
- For Parallel, status should reflect project-derived MCP activation.
- For Beads, status should continue to report `.beads` and should also report the project extension config state.
- Doctor should report unknown project extension references.
- Doctor should report missing Parallel MCP registry entries when project config enables Parallel MCP.

## Task 18: Add project semantic setup for Parallel and Beads

**Files:**

- Create: `cli/core/extensions/parallel.ts`
- Modify: `cli/core/extensions/beads.ts`
- Modify: `cli/commands/extensions/setup.ts`
- Test: `test/commands-extensions.test.ts`

**Parallel behavior:**

```bash
bgng extensions setup parallel
bgng extensions setup parallel --dry-run
bgng extensions setup parallel --mcp
bgng extensions setup parallel --skip-skills
```

- Does not install or authenticate `parallel-cli`.
- Writes or previews `<project>/.agents/bgng/config.json`.
- Stores semantic config under `extensions.parallel`.
- Default config is `{ "enabled": true, "skills": true, "mcp": false }`.
- `--mcp` sets `mcp: true`.
- `--skip-skills` sets `skills: false`.
- Preserves unrelated project config fields.

**Beads behavior revision:**

- `bgng extensions setup beads` should record semantic config under `extensions.beads`.
- `--include-skill` should set `extensions.beads.includeSkill: true` rather than directly mutating `skills.include`.
- Existing low-level `skills.include` remains supported but is not the setup command's default representation.

## Task 19: Sync project extension-derived skills and MCP

**Files:**

- Modify: `cli/core/sync.ts` only if needed after `mergeProjectConfig`
- Modify: `cli/commands/skills/sync.ts`
- Modify: `cli/commands/mcp/list.ts`
- Modify: `cli/commands/mcp/sync.ts`
- Modify: `test/scenarios-user-journeys.test.ts`
- Modify: `test/commands-skills-mutate.test.ts`
- Modify: `test/commands-mcp.test.ts`

**Behavior:**

- Running `bgng sync` from a project with `extensions.parallel.enabled: true` installs the four Parallel skills into enabled downstream tool skill directories.
- Running `bgng skills sync` from that project uses the same extension-derived skill overrides.
- Running `bgng sync --dry-run` reports those symlink changes without writing.
- Running `bgng mcp list` and `bgng mcp sync` from a project use extension-derived MCP toggles.
- Running from a project with `extensions.parallel.enabled: false` should not install Parallel skills and should report stale Parallel symlinks if they exist.
- Project `skills.exclude` can remove one derived Parallel skill while keeping the other three.

## Task 20: Documentation for project-configurable extensions

**Files:**

- Modify: `README.md`
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `.ai/knowledges/02_per-project-config-guide.md`
- Modify: `test/docs-readiness.test.ts`

**Behavior:**

- Document `<project>/.agents/bgng/config.json` as the home for project extension config.
- Document `extensions.parallel` and `extensions.beads` examples.
- Document `bgng extensions setup parallel`.
- Explain that extension project config is semantic and lower-level `skills.include` / `skills.exclude` still exist.
- Explain that `skills.exclude` wins over extension-derived includes.

## Final Verification

Run:

```bash
bun test
bun run typecheck
bun run verify:release --json
bun run bgng -- extensions list
bun run bgng -- extensions show beads
bun run bgng -- extensions status beads --json
bun run bgng -- extensions doctor beads --json
bun run bgng -- extensions setup beads --dry-run
bun run bgng -- extensions setup parallel --dry-run
```

Expected:

- all tests pass
- typecheck is clean
- release gate passes with no warnings
- commands produce usable human and JSON output
- dry-run setup does not mutate project state

## Commit Strategy

Use logical commits:

1. `[feat:extensions] add extension registry and commands`
2. `[feat:beads] add beads extension status and setup`
3. `[feat:skills] add beads task tracking skill`
4. `[test:extensions] cover extension workflows`
5. `[doc:extensions] document extension model`

Do not include any references to implementation tooling or assistance in commit messages.

## Explicit Non-Goals

- Do not reimplement Beads issue tracking.
- Do not make Beads MCP default.
- Do not run `bd doctor --fix`.
- Do not run `bd init --force`.
- Do not remove existing `config.parallel` behavior.
- Do not force users to manually write Parallel skill names to use Parallel in one project.
- Do not make `extensions.parallel` install or authenticate `parallel-cli`.
- Do not require package-backed skill bundles for built-in extension skills.
- Do not add a public third-party extension marketplace.
