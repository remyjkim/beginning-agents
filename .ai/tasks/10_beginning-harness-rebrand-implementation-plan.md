# Beginning Harness Rebrand Implementation Plan

> **For Claude/Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:test-driven-development for every code-changing task. Do not commit unless explicitly instructed.

**Goal:** Rebrand the project from `beginning-agents` to `beginning-harness` and reposition it as the local meta-harness control plane for AI agent tools, while preserving the stable `bgng` CLI, existing config paths, and current user workflows.

**Architecture:** This is a package/docs/positioning rename, not a runtime migration. Public package metadata, release gates, README, operator docs, and selected living architecture docs should move to the `beginning-harness` identity. Compatibility names such as `bgng`, `~/.agents`, `.agents/bgng/config.json`, `AGENTS_REPO_ROOT`, `AGENTS_DIR`, and `AGENTS_HOME_DIR` must remain unchanged unless a later migration plan explicitly changes them.

**Tech Stack:** Bun, TypeScript, Clipanion, npm package metadata, filesystem-backed docs, existing release-readiness tests, existing docs-readiness tests.

---

## Evidence Base

- `.ai/analyses/14_meta_harness_report.md`
- `.ai/analyses/12_target-cli-ui-architecture.md`
- `.ai/analyses/13_library-defaults-config-target-architecture.md`
- `.ai/knowledges/01_agents-cli-usage-guide.md`
- `.ai/knowledges/02_per-project-config-guide.md`
- `.ai/knowledges/03_npm-skill-bundles-guide.md`
- `.ai/knowledges/04_homebrew-release-checklist.md`
- `.ai/knowledges/05_npm-publishing-analysis-and-manual.md`
- `README.md`
- `package.json`
- `scripts/verify-release-readiness.ts`
- `test/package-readiness.test.ts`
- `test/cli-install-mode.test.ts`
- `test/docs-readiness.test.ts`
- `test/homebrew-readiness.test.ts`
- `docs/maintainers/publishing.md`

## Current State Findings

Confirmed during scoping:

- Current package name is `beginning-agents`.
- Current CLI binary is `bgng`.
- Current public repo metadata points to `https://github.com/remyjkim/beginning-agents`.
- Current git remote `origin` points to `https://github.com/remyjkim/beginning-agents.git`.
- `npm view beginning-harness` returned `E404` on 2026-04-27, so the npm package name appeared unclaimed at that time.
- `git ls-remote https://github.com/remyjkim/beginning-harness.git HEAD` succeeded on 2026-04-27, so the target GitHub repo exists.
- `bun.lock` still has workspace name `agents-config-saam`.
- README still opens with `beginning-agents` and "canonical config repository."
- The harness report is strong category research but does not yet connect the category to this product.
- Several tests hard-code `beginning-agents` and must be updated before metadata changes can pass.

## Product Positioning Target

Use this primary one-liner across public docs:

```text
beginning-harness is a local meta-harness for AI agent tools: one CLI to organize skills, MCP servers, extensions, defaults, project overlays, downstream tool configs, and diagnostics.
```

Use this concise explanatory frame:

```text
Agents are only as reliable as the harness around them. beginning-harness makes that harness explicit, inspectable, reusable, and safe to apply.
```

Use this compatibility frame:

```text
The package is beginning-harness. The command remains bgng.
```

Avoid these claims:

- "the only meta-harnessing tool you'll ever need"
- "fully automated harness engineering"
- "universal agent runtime"
- "replaces Claude Code, Codex, Cursor, MCP, or skills"

Prefer these claims:

- "the beginning of every local agent harness"
- "a local control plane for the agent tools you already use"
- "inspect, dry-run, apply, and diagnose your local harness"
- "reduce drift between skills, MCPs, extensions, project config, and downstream tools"

## Rename Boundary

Rename now:

- Public package name: `beginning-agents` -> `beginning-harness`
- Public repo URL in metadata/docs: `beginning-agents` -> `beginning-harness`
- Product name in README and active knowledge docs
- Release-readiness metadata checks
- Tests asserting package/docs naming
- Descriptions that say "canonical config repository" when the better framing is "local meta-harness control plane"

Keep now:

- CLI command: `bgng`
- Local aggregate directory: `~/.agents`
- User config path: `~/.agents/bgng/config.json`
- Project config path: `<project>/.agents/bgng/config.json`
- Environment variables: `AGENTS_REPO_ROOT`, `AGENTS_DIR`, `AGENTS_HOME_DIR`
- Legacy script name: `sync-mcp.ts`
- Existing command names: `apply`, `sync`, `library`, `add`, `search`, `skills`, `mcp`, `extensions`, `status`, `doctor`

Do not mass-edit:

- Historical completed task plans under `.ai/tasks/*` unless they are directly used by current docs-readiness tests.
- Historical analysis docs that intentionally describe the project at an earlier stage, except selected living architecture docs listed in this plan.
- Skill content that uses "agents" as domain language rather than product name.

## Acceptance Criteria

Public identity:

- `package.json.name` is `beginning-harness`.
- Package metadata points to `https://github.com/remyjkim/beginning-harness`.
- `package.json.description` communicates the meta-harness/control-plane value proposition.
- README title is `# beginning-harness`.
- README clearly says the CLI command remains `bgng`.
- README no longer leads with "canonical config repository."
- README explains the harness layers: library, defaults, project config, apply, downstream state, diagnostics.

Compatibility:

- `bgng --help` still works.
- `bun run bgng -- status` still works from a checkout.
- Existing config paths remain unchanged.
- Existing environment variables remain unchanged.
- Existing `sync-mcp.ts` compatibility remains unchanged.

Docs:

- `.ai/analyses/14_meta_harness_report.md` explains where `beginning-harness` fits in the harness-engineering category.
- Knowledge docs use the `beginning-harness` product name where current product identity is discussed.
- Maintainer publishing docs describe publishing `beginning-harness`.
- Homebrew checklist tracks `beginning-harness`.
- Historical npm publishing lessons remain intact, but current commands/examples point to `beginning-harness`.

Tests and release gates:

- `bun test` passes.
- `bun run typecheck` passes.
- `bun run verify:release --json` passes.
- `npm pack --dry-run --json` shows the package tarball as `beginning-harness`.
- `git diff --check` passes.

## Non-Goals

- Do not change the CLI binary from `bgng`.
- Do not rename `.agents/bgng` directories.
- Do not rename environment variables.
- Do not implement migration tooling.
- Do not change command semantics.
- Do not change skill sync behavior.
- Do not publish to npm.
- Do not retarget git remote unless explicitly instructed during execution.
- Do not commit unless explicitly instructed.

## Implementation Strategy

Proceed in this order:

1. Update tests and release gate expectations so the intended new metadata is explicit.
2. Update package metadata and regenerate `bun.lock`.
3. Rewrite README positioning and quickstart around the meta-harness model.
4. Update the harness report and living knowledge docs.
5. Update maintainer release docs.
6. Sweep code comments and user-facing error/help text only where stale product framing would confuse users.
7. Run full verification.

Do not start with broad search-and-replace. The word "agents" is often correct domain language. Replace only product identity and stale framing.

---

## Task 1: Reverify Target Package And Repo Availability

**Files:**

- No file changes.

**Step 1: Check npm name availability**

Run:

```bash
npm view beginning-harness name version repository --json
```

Expected as of 2026-04-27:

- `E404 Not Found`

If it returns a package:

- Stop and inspect whether the package is owned by this project.
- Do not proceed with package metadata rename until ownership is confirmed.

**Step 2: Check GitHub target repo**

Run:

```bash
git ls-remote https://github.com/remyjkim/beginning-harness.git HEAD
```

Expected:

- exits `0`
- prints a commit hash and `HEAD`

**Step 3: Check current remotes**

Run:

```bash
git remote -v
```

Expected before remote retarget:

- origin may still point to `beginning-agents`

Do not change remote in this task unless explicitly instructed.

## Task 2: Update Metadata Tests First

**Files:**

- Modify: `test/package-readiness.test.ts`
- Modify: `test/cli-install-mode.test.ts`
- Modify: `test/homebrew-readiness.test.ts`
- Modify: `test/docs-readiness.test.ts`

**Step 1: Update package readiness expectations**

In `test/package-readiness.test.ts`, change:

```ts
expect(pkg.name).toBe("beginning-agents");
expect(pkg.homepage).toBe("https://github.com/remyjkim/beginning-agents");
expect(pkg.bugs).toEqual({ url: "https://github.com/remyjkim/beginning-agents/issues" });
expect(pkg.repository).toEqual({
  type: "git",
  url: "git+https://github.com/remyjkim/beginning-agents.git",
});
```

to:

```ts
expect(pkg.name).toBe("beginning-harness");
expect(pkg.homepage).toBe("https://github.com/remyjkim/beginning-harness");
expect(pkg.bugs).toEqual({ url: "https://github.com/remyjkim/beginning-harness/issues" });
expect(pkg.repository).toEqual({
  type: "git",
  url: "git+https://github.com/remyjkim/beginning-harness.git",
});
```

Keep:

```ts
expect((pkg.bin as Record<string, string>).bgng).toBe("cli/index.ts");
expect((pkg.scripts as Record<string, string>).bgng).toBe("bun run cli/index.ts");
```

**Step 2: Update CLI install mode expectation**

In `test/cli-install-mode.test.ts`, change:

```ts
expect(pkg.name).toBe("beginning-agents");
```

to:

```ts
expect(pkg.name).toBe("beginning-harness");
```

Keep all `bgng` assertions unchanged.

**Step 3: Update docs readiness package expectation**

In `test/docs-readiness.test.ts`, change the Homebrew checklist assertion from:

```ts
expect(brewGuide).toContain("beginning-agents");
```

to:

```ts
expect(brewGuide).toContain("beginning-harness");
```

Add README/usage-guide assertions that protect the new positioning:

```ts
expect(readme).toContain("local meta-harness");
expect(readme).toContain("The package is `beginning-harness`. The command is `bgng`.");
expect(usageGuide).toContain("beginning-harness");
expect(usageGuide).toContain("local harness");
```

Do not make tests assert marketing-heavy phrases.

**Step 4: Update Homebrew readiness expectation**

In `test/homebrew-readiness.test.ts`, change:

```ts
expect(content).toContain("beginning-agents");
```

to:

```ts
expect(content).toContain("beginning-harness");
```

**Step 5: Run targeted tests and confirm failure**

Run:

```bash
bun test test/package-readiness.test.ts test/cli-install-mode.test.ts test/docs-readiness.test.ts test/homebrew-readiness.test.ts
```

Expected:

- failures referencing old package metadata and docs until implementation tasks are completed.

## Task 3: Update Package Metadata And Release Gate

**Files:**

- Modify: `package.json`
- Modify: `scripts/verify-release-readiness.ts`
- Modify: `bun.lock`

**Step 1: Update `package.json`**

Change:

```json
"name": "beginning-agents"
```

to:

```json
"name": "beginning-harness"
```

Change description from:

```json
"Canonical MCP and skill registry CLI for multi-agent configuration."
```

to:

```json
"Local meta-harness CLI for managing AI agent skills, MCP servers, extensions, defaults, and project overlays."
```

Change URLs:

```json
"homepage": "https://github.com/remyjkim/beginning-harness"
"bugs": {
  "url": "https://github.com/remyjkim/beginning-harness/issues"
}
"repository": {
  "type": "git",
  "url": "git+https://github.com/remyjkim/beginning-harness.git"
}
```

Update keywords:

```json
"keywords": [
  "beginning-harness",
  "bgng",
  "harness",
  "meta-harness",
  "agents",
  "mcp",
  "skills",
  "cli",
  "configuration"
]
```

Keep:

```json
"bin": {
  "bgng": "cli/index.ts"
}
```

**Step 2: Update release gate metadata checks**

In `scripts/verify-release-readiness.ts`, change ABOUTME:

```ts
// ABOUTME: Runs the release-readiness quality gate for the bgng CLI and beginning-harness package.
```

Change:

```ts
if (pkg.name !== "beginning-agents") {
  metadataIssues.push("name must be beginning-agents");
}
```

to:

```ts
if (pkg.name !== "beginning-harness") {
  metadataIssues.push("name must be beginning-harness");
}
```

Keep `bin.bgng` and `scripts.bgng` checks unchanged.

**Step 3: Regenerate lockfile**

Run:

```bash
bun install
```

Expected:

- `bun.lock` workspace name changes from `agents-config-saam` to `beginning-harness`.
- Dependency versions should not change unless Bun updates lock metadata deterministically.

**Step 4: Run targeted metadata tests**

Run:

```bash
bun test test/package-readiness.test.ts test/cli-install-mode.test.ts
```

Expected:

- package metadata tests pass once docs readiness is handled later.

## Task 4: Rewrite README Public Positioning

**Files:**

- Modify: `README.md`

**Step 1: Replace title and opening**

Change the README title to:

```md
# beginning-harness
```

Replace the first section with:

```md
`beginning-harness` is a local meta-harness for AI agent tools: one CLI to organize skills, MCP servers, extensions, defaults, project overlays, downstream tool configs, and diagnostics.

Agents are only as reliable as the harness around them. `beginning-harness` makes that harness explicit, inspectable, reusable, and safe to apply.

The package is `beginning-harness`. The command is `bgng`.
```

**Step 2: Add a concise "What It Harnesses" section**

Add a section near the top:

```md
## What It Harnesses

- skills and instructions that guide agent behavior
- MCP servers and tool definitions that control capability access
- extensions such as Parallel and Beads that bundle project-level setup and diagnostics
- machine-wide defaults for reusable local capabilities
- project overlays for repository-specific agent behavior
- downstream state for Claude Code, Codex, Cursor, and `~/.agents`
- diagnostics that report drift before mutating local files
```

**Step 3: Rewrite "Why This Exists"**

The revised section should emphasize:

- local agent setups drift
- the harness is currently scattered across dotfiles, skills, MCP configs, and project conventions
- `beginning-harness` gives those pieces a single local control plane
- it is intentionally inspectable and dry-runnable
- it is useful when users work across multiple agent tools or projects

Avoid sounding like a hosted platform or agent runtime.

**Step 4: Update install examples**

Change:

```bash
npm install -g beginning-agents
```

to:

```bash
npm install -g beginning-harness
```

Change:

```bash
git clone https://github.com/remyjkim/beginning-agents.git
cd beginning-agents
```

to:

```bash
git clone https://github.com/remyjkim/beginning-harness.git
cd beginning-harness
```

Change:

```bash
export AGENTS_REPO_ROOT=/path/to/beginning-agents
```

to:

```bash
export AGENTS_REPO_ROOT=/path/to/beginning-harness
```

Keep the env var named `AGENTS_REPO_ROOT`.

**Step 5: Rename usage-mode headings**

Replace:

```md
### Packaged canonical config
### Editable canonical config
```

with:

```md
### Packaged Harness
### Editable Harness Source
```

Describe the package as containing built-in harness defaults, not a "canonical repo."

**Step 6: Fix layer-count drift**

Current README says:

```md
The core model has four layers:
```

but lists five layers. Change to:

```md
The core model has five layers:
```

Rename the layers to:

- packaged harness defaults
- local library
- user defaults
- project overlay
- downstream state

**Step 7: Update package-backed skill bundle wording**

Change:

```md
`beginning-agents` supports package-backed extension skill bundles...
```

to:

```md
`beginning-harness` supports package-backed skill bundles...
```

**Step 8: Keep command reference unchanged**

Do not rename `bgng` commands.

**Step 9: Run docs readiness targeted test**

Run:

```bash
bun test test/docs-readiness.test.ts
```

Expected:

- may still fail until knowledge docs are updated in later tasks.

## Task 5: Update Harness Report With Product Bridge

**Files:**

- Modify: `.ai/analyses/14_meta_harness_report.md`

**Step 1: Add an executive summary after the title**

Add:

```md
## Executive Summary

Harness engineering is the discipline of making agents reliable by shaping the environment around the model: context, tools, instructions, verification, observability, and cost controls. The consistent lesson across 2026 research and practice is that model quality alone does not determine agent quality. The surrounding harness often dominates outcomes.

`beginning-harness` applies that lesson locally. It is not another coding agent and not a hosted orchestration platform. It is a local meta-harness: a control plane for the skills, MCP servers, extensions, defaults, project overlays, downstream tool configs, and diagnostics that surround the agent tools a developer already uses.
```

**Step 2: Add "Where beginning-harness Fits"**

Add a section after the executive summary:

```md
## Where beginning-harness Fits

`beginning-harness` occupies the local operator layer of harness engineering. Its job is to make scattered local agent configuration explicit and governable:

- skills become feedforward guidance
- MCP servers become controlled tool surfaces
- extensions become reusable harness modules
- the local library becomes reusable capability inventory
- user defaults become the machine-wide baseline harness
- project config becomes the project-specific harness overlay
- apply, status, and doctor become the materialization and verification loop

This is why the name is `beginning-harness`: it is the starting harness layer around every local agent setup, not a replacement for any one agent.
```

**Step 3: Add "What It Is Not"**

Add:

```md
## What beginning-harness Is Not

`beginning-harness` is not the Stanford Meta-Harness optimizer described later in this report. It does not search over arbitrary harness code or run benchmark optimization loops. It also is not an agent runtime, hosted platform, or model wrapper.

Its narrower job is deliberately practical: make the local harness around coding-agent tools inspectable, reusable, project-aware, and safe to apply.
```

**Step 4: Keep existing research intact**

Do not remove the origins, publications, evidence, or resources sections.

**Step 5: Avoid overclaiming**

Do not add "only meta-harnessing tool you'll ever need."

## Task 6: Update Operator Knowledge Docs

**Files:**

- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `.ai/knowledges/02_per-project-config-guide.md`
- Modify: `.ai/knowledges/03_npm-skill-bundles-guide.md`
- Modify: `.ai/knowledges/README.md` only if file names or descriptions change

**Step 1: Update CLI guide title and purpose**

Option A: keep filename, change title:

```md
# BGNG CLI Usage Guide
```

Option B: rename file later to `01_bgng-cli-usage-guide.md`.

Recommended for this task: keep filename to avoid broad link churn.

Update "What `bgng` Is":

```md
`bgng` is the operator CLI for `beginning-harness`.

`beginning-harness` is the local meta-harness control plane around the agent tools you already use. It organizes reusable inventory, machine-wide defaults, project overlays, downstream tool state, and diagnostics.
```

Update the model bullets:

- packaged harness defaults
- local library
- user defaults
- project config / project overlay
- downstream state

Remove or soften "repo is the canonical built-in source of truth" in favor of "packaged or checkout harness source."

**Step 2: Update local state model**

Replace:

```md
- the repo-root canonical config
```

with:

```md
- the packaged or checkout harness source
```

Keep paths unchanged.

**Step 3: Update extension section**

Change:

```md
`beginning-agents` supports optional local extensions...
```

to:

```md
`beginning-harness` supports optional local extensions...
```

**Step 4: Update per-project guide**

In `.ai/knowledges/02_per-project-config-guide.md`, replace stale framing:

- "canonical repo configuration" -> "packaged or checkout harness defaults"
- "canonical repo config" -> "baseline harness config"
- "global canonical config" -> "machine-wide harness defaults"

Do not change schema names.

**Step 5: Update npm skill bundles guide**

In `.ai/knowledges/03_npm-skill-bundles-guide.md`, replace:

- `beginning-agents` -> `beginning-harness`
- "single default first-party package" -> "single first-party harness package"
- "control plane" can remain, but connect it to "local meta-harness"

Do not rename the bundle contract unless the contract explicitly encodes `beginning-agents`.

**Step 6: Run docs readiness test**

Run:

```bash
bun test test/docs-readiness.test.ts
```

Expected:

- docs readiness passes once README and knowledge docs contain required new and existing command-surface strings.

## Task 7: Update Release And Maintainer Docs

**Files:**

- Modify: `.ai/knowledges/04_homebrew-release-checklist.md`
- Modify: `.ai/knowledges/05_npm-publishing-analysis-and-manual.md`
- Modify: `docs/maintainers/publishing.md`
- Modify: `docs/maintainers/README.md` only if needed

**Step 1: Update Homebrew checklist**

Change:

```md
- current package name: `beginning-agents`
```

to:

```md
- current package name: `beginning-harness`
```

Change:

```md
- package metadata currently uses `beginning-agents`
```

to:

```md
- package metadata currently uses `beginning-harness`
```

Keep `bgng` as current CLI binary.

**Step 2: Update maintainer publishing manual**

In `docs/maintainers/publishing.md`, change:

```md
publishing `beginning-agents` to npm
```

to:

```md
publishing `beginning-harness` to npm
```

Replace absolute local examples:

```bash
cd /Users/pureicis/dev/agents-config-saam
```

with:

```bash
cd /path/to/beginning-harness
```

Add a preflight step:

```bash
npm view beginning-harness name version repository --json
```

Expected before first publish:

- `E404 Not Found`

Expected after first publish:

- package metadata for this project

Add a note:

```md
If `beginning-agents` remains published, deprecate it only after `beginning-harness` is published and installable.
```

**Step 3: Update npm publishing analysis/manual**

Preserve historical failure analysis, but add a short "Current Package Name" section near the top:

```md
The current package name is `beginning-harness`. Earlier notes may refer to `beginning-agents` because that was the package name during the first publishing attempt.
```

Update current command examples to `cd /path/to/beginning-harness`.

**Step 4: Run targeted docs tests**

Run:

```bash
bun test test/homebrew-readiness.test.ts test/docs-readiness.test.ts
```

Expected:

- both pass.

## Task 8: Update Living Architecture Docs

**Files:**

- Modify: `.ai/analyses/12_target-cli-ui-architecture.md`
- Modify: `.ai/analyses/13_library-defaults-config-target-architecture.md`
- Modify: `.ai/analyses/06_npm-skills-package-integrated-target-architecture.md`
- Modify: `.ai/analyses/11_extensions-architecture-beads-parallel-investigation.md`

**Step 1: Update target CLI architecture scope**

In `.ai/analyses/12_target-cli-ui-architecture.md`, change scope from "sync/configuration CLI" to:

```md
Define the target user-facing command architecture for `bgng`, the CLI for `beginning-harness`, as it evolves into a local meta-harness control plane for project setup, local library, extension, skill, MCP, and tool configuration.
```

Keep the command architecture unchanged.

**Step 2: Update library/defaults architecture**

In `.ai/analyses/13_library-defaults-config-target-architecture.md`, add or update language so:

- library = reusable local harness inventory
- defaults = machine-wide harness baseline
- project config = project harness overlay
- apply = materialization into downstream tools

**Step 3: Update npm skill package architecture**

In `.ai/analyses/06_npm-skills-package-integrated-target-architecture.md`, replace current product references:

- `beginning-agents` -> `beginning-harness`
- `@beginning-agents/skills-core` examples -> prefer neutral examples such as `@acme/skills-core` unless first-party package names are confirmed
- "control plane" -> "local harness control plane" where appropriate

Do not introduce first-party split packages unless there is an implementation decision for them.

**Step 4: Update extensions architecture investigation**

In `.ai/analyses/11_extensions-architecture-beads-parallel-investigation.md`, replace:

```md
`beginning-agents` / `bgng`
```

with:

```md
`beginning-harness` / `bgng`
```

Describe extensions as reusable harness modules.

**Step 5: Do not update historical task docs**

Skip `.ai/tasks/01_*` through `.ai/tasks/09_*` unless a test reads them. They are historical implementation records.

## Task 9: Sweep Code Comments And User-Facing Copy

**Files:**

- Potentially modify: `cli/context.ts`
- Potentially modify: `cli/core/config.ts`
- Potentially modify: `cli/core/paths.ts`
- Potentially modify: `cli/core/registry.ts`
- Potentially modify: `cli/core/mcp.ts`
- Potentially modify: `cli/core/output.ts`
- Potentially modify: `cli/core/types.ts`
- Potentially modify: `cli/commands/base.ts`
- Potentially modify: `cli/commands/mcp/list.ts`
- Potentially modify: `cli/commands/mcp/sync.ts`
- Potentially modify: selected test ABOUTME comments if they assert stale product framing

**Step 1: Search stale product/framing terms**

Run:

```bash
rg --hidden -n "beginning-agents|agents-config-saam|canonical config|canonical repo|canonical MCP|agents CLI|multi-agent configuration" cli test scripts README.md docs .ai/knowledges .ai/analyses --glob '!skills/shared/**' --glob '!.git/**'
```

**Step 2: Classify matches**

Replace if the phrase is product identity or current architecture framing:

- `beginning-agents`
- `agents-config-saam`
- "agents CLI" when it means this product
- "canonical config repository" in public docs

Keep if the phrase is correct domain language:

- "agents" as AI agent domain noun
- `.agents` path references
- `AGENTS_*` environment variables
- old historical task-plan content
- skills explaining agent behavior generally

**Step 3: Update user-facing error text**

In `cli/context.ts`, change:

```ts
throw new Error(`No config.json found at ${repoRoot}. Run bgng from a canonical repo checkout or set AGENTS_REPO_ROOT.`);
```

to:

```ts
throw new Error(`No config.json found at ${repoRoot}. Run bgng from a beginning-harness checkout or set AGENTS_REPO_ROOT.`);
```

**Step 4: Update ABOUTME comments only when stale**

Examples:

```ts
// ABOUTME: Loads and saves the baseline harness config used by bgng and the sync wrapper.
```

Do not spend time polishing internal comments that are not stale or user-visible.

**Step 5: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected:

- passes.

## Task 10: Full Verification

**Files:**

- No planned file changes unless verification reveals issues.

**Step 1: Run complete tests**

Run:

```bash
bun test
```

Expected:

- all tests pass.
- no skips introduced.

**Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected:

- exits `0`.

**Step 3: Run release readiness**

Run:

```bash
bun run verify:release --json
```

Expected:

- `"ok": true`
- package metadata check passes for `beginning-harness`
- no `.ai/` files included in package
- no `test/` files included in package

**Step 4: Verify package dry run**

Run:

```bash
npm pack --dry-run --json
```

Expected:

- package name is `beginning-harness`
- tarball excludes `.ai/`
- tarball excludes `test/`
- tarball includes:
  - `cli/index.ts`
  - `config.json`
  - `mcp-servers.json`
  - `sync-mcp.ts`
  - `skills/shared/frontend-design/SKILL.md`
  - `README.md`
  - `LICENSE`
  - `CONTRIBUTING.md`

**Step 5: Verify CLI smoke behavior**

Run:

```bash
bun run bgng -- --help
bun run bgng -- status --json
bun run bgng -- apply --dry-run
```

Expected:

- commands exit `0`.
- output still uses `bgng`.
- no output refers to `beginning-agents` unless explaining migration/history.

**Step 6: Check formatting and stale strings**

Run:

```bash
git diff --check
rg --hidden -n "beginning-agents|agents-config-saam" package.json README.md scripts docs .ai/knowledges .ai/analyses cli test --glob '!skills/shared/**' --glob '!.git/**'
```

Expected:

- `git diff --check` exits `0`.
- Remaining `beginning-agents` matches, if any, are explicitly historical notes in `.ai/knowledges/05_npm-publishing-analysis-and-manual.md` or older skipped historical docs.
- No `beginning-agents` remains in public README, package metadata, release gate, or package tests.

## Task 11: Optional Remote And Publishing Prep

**Files:**

- No file changes unless explicitly requested.

This task requires explicit user approval before execution.

**Option A: Retarget git remote**

Run only when instructed:

```bash
git remote set-url origin https://github.com/remyjkim/beginning-harness.git
git remote -v
```

Expected:

- origin fetch and push point to `beginning-harness`.

**Option B: Publish new package**

Run only when instructed and only after Task 10 passes:

```bash
npm view beginning-harness name version repository --json
bun run verify:release --json
npm pack --dry-run --json
```

Then follow `docs/maintainers/publishing.md`.

**Option C: Deprecate old package**

Run only after `beginning-harness` is published and installable:

```bash
npm deprecate beginning-agents@"*" "Renamed to beginning-harness. Install with: npm install -g beginning-harness"
```

Do not deprecate `beginning-agents` before the new package exists.

## Final Implementation Checklist

- [ ] npm name availability reverified.
- [ ] package metadata updated.
- [ ] release gate updated.
- [ ] lockfile regenerated.
- [ ] README repositioned around local meta-harness.
- [ ] harness report connected to `beginning-harness`.
- [ ] operator knowledge docs updated.
- [ ] maintainer publishing docs updated.
- [ ] living architecture docs updated.
- [ ] stale user-facing copy swept.
- [ ] `bun test` passed.
- [ ] `bun run typecheck` passed.
- [ ] `bun run verify:release --json` passed.
- [ ] `npm pack --dry-run --json` passed.
- [ ] no unintended runtime migration introduced.
- [ ] no commit made unless explicitly instructed.
