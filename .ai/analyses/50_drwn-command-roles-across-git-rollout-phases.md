# drwn Command Roles Across the Git Rollout Phases

**Date**: 2026-06-01
**Author**: Claude + Remy
**Status**: Draft
**References**: [analyses/47_drwn-target-architecture-after-phase-1.md, analyses/48_drwn-target-architecture-after-phase-2.md, analyses/49_drwn-target-architecture-after-phase-3.md, analyses/46_drwn-card-team-sharing-flow.md, analyses/44_drwn-git-storage-backend-options.md, analyses/43_drwn-cli-target-architecture.md, analyses/42_drwn-cli-vocabulary-and-multi-env-design.md, tasks/29_drwn-git-distribution-phase-1-implementation-plan.md, tasks/30_drwn-git-distribution-phase-2-implementation-plan.md, tasks/31_drwn-git-distribution-phase-3-implementation-plan.md]

---

## Executive Summary

A common worry when reading the Git-rollout target architectures (analyses 47, 48, 49) is that the migration must be reshuffling the existing CLI mental model: if cards are stored differently, surely `apply` and `library` change too? They don't. This document makes the invariance explicit.

**Three roles stay fixed across all phases, including the post-Phase-3 end state:**

1. **`apply`** — the materialization verb. Reads effective state, writes downstream tool state (`~/.claude/`, `~/.codex/`, `~/.cursor/`, project-local equivalents) via the three mechanisms from `32_*` §5. **Unchanged in role and contract across Phase 0 → 1 → 2 → 3.**
2. **`library`** — the user's centralized inventory namespace. Always answers "what do I have available on this machine for any project to use." **Unchanged in conceptual role**, though gains new entry types (Git URLs as cards in Phase 1; catalogs in Phase 2).
3. **Project-composition verbs** (`use`, `add`, `pin`, `remove`, `clear`, `update`, `outdated`) — declare and mutate the project's `cards[]` array. **Unchanged in role across all phases.**

**One new role appears in Phase 1 and stays:**

- **`install`** — the bootstrap verb. Ensures every card referenced in the lockfile is present in the local store, then runs `apply`. Necessary because Phase 1+ allows a project to reference cards (via Git URL) that aren't yet locally present. Analogous to `npm install`. Distinct from `apply` (which assumes everything is already present).

**The Git phases reshape the middle.** Card content storage moves from per-version directories to per-card bare Git repos to a unified extraction cache, but this is **storage refactoring**. Both the input layer (Library — what the user has) and the output layer (Apply — what gets materialized to downstream tools) preserve their roles exactly.

The TL;DR mental model: `apply` is the output, `library` is the input, the Git phases reshape the storage in between, and `install` is the bootstrap step that makes the lockfile self-sufficient for fresh clones.

---

## 1. Context

Three target architectures (47, 48, 49) describe what `drwn`'s storage looks like after each Git-rollout phase. Three implementation plans (29, 30, 31) describe how to get there. A natural worry: are the existing `apply` and `write` commands (and the `library` namespace) being reshaped along with the storage?

The answer is no — and this document explains why, by tracing each command's role across the four phases and showing what stays fixed.

This doc is **a clarification of the architecture analyses**, not an extension of the design. It exists because the rollout is large and reading the storage-focused docs leaves an unanswered question: where do the existing daily verbs sit?

---

## 2. The Layered Model (Recap)

From analysis 43 §2, drwn's mental model is five layers:

```text
Layer 1: Built-in       packaged or checkout source
                              ↓
Layer 2: Library        ~/.agents/drwn/...
                          ├── skills/, mcp-servers/, profiles/   (inventory)
                          ├── cards/                              (versioned content store)
                          ├── sources/                            (editable card sources)
                          ├── extracted/                          (Phase 2+ extraction cache)
                          ├── cache/                              (Phase 1 cache; gone after Phase 3)
                          └── catalogs/                           (Phase 2+ discovery layer)
                              ↓
Layer 3: Project        <project>/.agents/drwn/...
                          ├── config.json   (cards[] + overlay)
                          ├── card.lock     (resolved versions + integrity)
                          ├── skills/       (project-local)
                          └── presets/
                              ↓
Layer 4: Curated        active machine baseline (skills enabled, MCP servers active)
                              ↓
Layer 5: Downstream     ~/.claude/, ~/.codex/, ~/.cursor/, <project>/.claude/, ...
                        (three materialization mechanisms)
```

The Git rollout reshapes **Layer 2** (Library — specifically the `cards/` and `extracted/` sub-trees). Layers 1, 3, 4, 5 are untouched.

`apply` is the transition Layer 4 → Layer 5. `library` is the namespace that manages Layer 2's inventory. Project-composition verbs operate on Layer 3.

---

## 3. Command Role Stability Table

How each command's role changes across Phases 0–3.

### 3.1 `drwn apply` (materialization)

| Aspect | Phase 0 (today) | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|
| **Role** | Read effective state, write downstream files | Same | Same | Same |
| **Input** | Lockfile's `path` field → directory of card content | Same (path may point into `cache/extracted/`) | Same (path may point into `extracted/<tree-sha>/`) | Same (unified path target) |
| **Output** | Files in `~/.claude/`, etc. | Same | Same | Same |
| **Mechanisms** | Three (per `32_*` §5) | Same | Same | Same |
| **Vocabulary** | Was `write`; becomes `apply` per task 28 + analysis 42 v2 | `apply` | `apply` | `apply` |

The materialization step is fundamentally a pure function from effective state to downstream filesystem. Where the content of cards is stored — per-version dirs, cache archives, bare repos — is invisible to materialization. Materialization sees `path` in each lockfile entry and reads from it.

This is why `apply` is so stable: its contract is "given a lockfile, produce a specific downstream state." Changing how cards get into the local store changes the resolution, not the materialization.

### 3.2 `drwn library` (user inventory namespace)

| Aspect | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|
| **Role** | Manage what's available on this machine | Same | Same | Same |
| **Subcommands** | `list`, `show`, `add skill`, `add mcp`, `defaults add/remove` | Same + `add card git+url` works (via Phase 1's add path) | Same + `add catalog`, `remove catalog`, `refresh catalog`, `list catalog` | Same (no new) |
| **Storage shape** | Bundles + MCP defs + per-version card dirs | Same + git-URL cache | Same, except cards are bare repos; catalogs registered | Same; cache migrated into bare repos |

The library is the **user's reusable local inventory**. It gains entry types over the phases:

- Phase 1: a Git URL can be added as a card (`drwn library add card git+url` is equivalent to `drwn add git+url` from the consumer-side path; both write a new card into the local store).
- Phase 2: catalogs become a first-class entry type. Adding a catalog gives discovery for many cards at once.
- Phase 3: no new entry types; the internal storage for git-URL cards moves from `cache/` to the bare-repo store.

But the **role** — "manage what's available" — doesn't change.

### 3.3 Project-composition verbs

`drwn use`, `drwn add`, `drwn pin`, `drwn remove`, `drwn clear`, `drwn update`, `drwn outdated`.

| Aspect | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|
| **Role** | Mutate project's `cards[]` + overlay | Same | Same | Same |
| **`drwn add @scope/name@^1.0.0`** | Resolves from store | Same | Same | Same |
| **`drwn add git+url#ref`** | Not supported | NEW: resolves via archive download | NEW behavior: same UX, different internals (bare repo created from URL) | Same as Phase 2 (the bare repo creation path is the Phase 3 default) |
| **`drwn update`** | Re-resolves all cards | Same | Same | Same |
| **`drwn outdated`** | Lists outdated store-origin cards | Same; Git-origin not checked | Same + `--fetch` flag refreshes remotes | Same; `--fetch` works uniformly for store + git origins |

These verbs operate on **intent** (the cards array in `config.json` and lockfile). They don't know or care about the storage shape of cards. The only growth across phases is: more ref forms accepted by `drwn add`, and `drwn outdated --fetch` becomes more useful as Git plumbing matures.

### 3.4 `drwn install` (bootstrap, NEW in Phase 1)

| Aspect | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|
| **Existence** | Doesn't exist | NEW | Extended | Same as Phase 2 |
| **Role** | n/a | Fetch missing cards from lockfile, then apply | Same | Same |
| **Implementation** | n/a | Archive-download for git-origin; verify path for store-origin | Same + clone bare repos for missing store-origin and git-origin | Same as Phase 2; git-origin path goes through bare-repo clone like store-origin |
| **CI mode (`--frozen`)** | n/a | Refuse if lockfile would change | Same | Same |

`install` is the **only genuinely new role** in the command surface, and it exists because of one new fact introduced in Phase 1:

> *A card can be referenced in a project's lockfile without being present in the local store.*

Before Phase 1, every card had to be locally published or file-referenced; cards were always physically on disk when in a lockfile. Phase 1 introduces Git URLs, which can be referenced without ever being fetched. Phase 2 introduces bare repos that might not have been cloned locally yet. Either way, we need a step that says "go fetch what's missing."

That step is `drwn install`. Conceptually:

```
drwn install = (ensure cards from lockfile are present in local store) + drwn apply
                                ↑                                            ↑
                                NEW                                          UNCHANGED
```

After `drwn install`, every subsequent `drwn apply` works offline. This is the same separation `npm install` (fetch deps) vs `node` (run code) makes; or `pnpm install` vs `pnpm run`.

### 3.5 Card-as-artifact namespace (`drwn card ...`)

| Aspect | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|
| `drwn card new` | Create source | Same | Same | Same |
| `drwn card source ...` | Edit source | Same | Same | Same |
| `drwn card publish` | Copy source → per-version dir | Same | Rewritten with Git plumbing (commit + tag) | Same |
| `drwn card deprecate` | Mark version deprecated | Same | Same | Same |
| `drwn card show <ref>` | Inspect manifest | Same | Same + Git log | Same + Git log (works for git-origin too) |
| `drwn card diff <a> <b>` | Manifest diff | Same | Real `git diff` | Same (works for git-origin too) |
| `drwn card list` | List local cards | Same | Same | Same |
| `drwn card remote add/list/set/remove` | n/a | n/a | NEW | Same |
| `drwn card push` | n/a | n/a | NEW | Same |
| `drwn card fetch` | n/a | n/a | NEW | Same + works for git-origin cards |
| `drwn card clone` | n/a | n/a | NEW | Same |

The card-as-artifact namespace gains team-sharing primitives in Phase 2 (`remote`/`push`/`fetch`/`clone`). The role of the namespace — "operate on cards as objects in the world" (vs. project composition) — is unchanged.

---

## 4. Why `apply` Doesn't Change

This deserves its own section because it's the most counterintuitive part. Of course storage changes, you'd think; surely the thing that reads storage changes too?

It doesn't, because of a deliberate boundary in the design.

### 4.1 The lockfile is the contract

drwn's `card.lock` records, for each card:

- The resolved version
- The integrity hash of extracted content
- A **`path` field** pointing at on-disk content

The `path` field is what `apply` reads. The materialization layer reads the path, reads the content there, and applies the three mechanisms. It does not know:

- Whether the content came from npm, a Git URL, or a published-locally source.
- Whether the content was extracted from a bare repo or from an HTTP archive.
- Whether the content lives in `cards/@scope/name/<v>/`, `cache/extracted/<commit>/`, or `extracted/<tree-sha>/`.

The lockfile abstracts all of this. As the storage evolves across phases, only the `path` value changes — and even that is recorded by the resolver, not by the materializer.

### 4.2 The three materialization mechanisms are settled

Per `32_*` §5, materialization uses three mechanisms (directory symlinks for skills, `_drwn` meta-block for managed fields, generated-file-plus-symlink for Cursor). These are **forced by the consumer tools' read contracts** — they're not aesthetic choices. The Git changes are upstream of these mechanisms; they affect what content gets fed into the mechanisms, not the mechanisms themselves.

The mechanisms can only change if Claude Code, Codex, or Cursor change their config discovery conventions. Until then, the materialization layer is stable.

### 4.3 Performance is also stable

A user who runs `drwn apply` daily sees the same performance profile across phases. The materialization step is symlink + JSON-merge work, dominated by filesystem operations. The Git changes affect `drwn add`, `drwn install`, and `drwn outdated --fetch` — but not `drwn apply`.

### 4.4 What this means for users

A user who's been running `drwn apply` for months hits the rebrand (task 28) once — that's a verb change from `write` to `apply`. From that moment forward, `drwn apply` is the materialization verb across all phases, with identical behavior. The Git rollout is invisible to the user's daily `apply` muscle memory.

---

## 5. Why `library` Doesn't Change

Same kind of argument. The library is **what the user has** — their reusable inventory. The Git phases change **how cards live** inside that inventory (per-version dirs vs bare repos), but `library` as a namespace and concept is preserved.

### 5.1 The library's three categories of content

The user's inventory contains:

1. **Skill bundles** (`~/.agents/drwn/skills/`). Installed via `drwn library add skill <pkg>`. Unchanged across phases.
2. **MCP server definitions** (`~/.agents/drwn/mcp-servers/`). Installed via `drwn library add mcp <json>`. Unchanged across phases.
3. **Cards** (`~/.agents/drwn/cards/`). This is what changes: per-version dirs → bare repos. But the library namespace's *interface* — `drwn library list card`, `drwn library show <card-ref>` — is preserved.

Plus Phase 2 adds a fourth category:

4. **Catalogs** (`~/.agents/drwn/catalogs/`). Managed via `drwn library add/remove/list/refresh catalog`. New surface, but additive — no existing surface is reshaped.

### 5.2 The conceptual role test

The diagnostic question is: *if a user asks "what do I have available on this machine?", does `library` still answer it?*

Across all four phases, yes. The library is the namespace that answers this. Phase 2 makes the answer richer (because catalogs add discovery), and Phase 3 makes the underlying storage more efficient. But the role is preserved.

---

## 6. Why `install` Is New

`install` exists because the **possibility space** for lockfile content changes in Phase 1.

### 6.1 The pre-Phase-1 invariant

In Phase 0, every card a project references is **already in the local store**. Reasons:

- The card was published locally via `drwn card publish` (which is how it got into the store).
- The card was added via `drwn add @scope/name@ver` from a store version (which is in the store).
- The card was added via `file:./path`, which is local content that already exists.

There's no way to reference a card that isn't already physically present.

### 6.2 The Phase-1 break in invariant

Phase 1 introduces `git+url#ref`. A user can now write:

```bash
drwn add git+https://github.com/team-org/baseline.git#v1.3.0
```

And then later:

```bash
git push   # commits config.json + card.lock to a project repo
```

A teammate `git clone`s the project. They have:

- `<project>/.agents/drwn/config.json` — references `@team/baseline@1.3.0`
- `<project>/.agents/drwn/card.lock` — pins the commit SHA + URL

But their `~/.agents/drwn/` doesn't have the card yet. It's referenced in the lockfile but not present.

### 6.3 The `install` bridge

To go from "lockfile references" to "ready to apply," the teammate needs a step that **fetches missing content based on lockfile metadata**. That's `drwn install`:

```
drwn install:
  for card in card.lock:
    if card not present in local store:
      fetch it (via Git URL, archive endpoint, etc.)
      extract it
      verify integrity
  drwn apply
```

This is exactly the role `npm install` plays for `package-lock.json`. It's the bootstrap verb.

### 6.4 Why not just have `apply` do this

We could merge `install` into `apply`: "if a card is missing, fetch it." That's tempting but the wrong call. Reasons:

- **Separation of network and local work.** `apply` should never silently hit the network. A user who runs `drwn apply` expects local-only behavior; surprises on slow networks are bad UX.
- **CI semantics.** CI needs a "fail if anything would change" mode. Having two distinct verbs (`install` for fetch-and-apply, `apply` for local-only) maps cleanly to `--frozen` semantics: `drwn install --frozen` is CI-safe.
- **Mental model parity.** `npm install` and `pnpm install` work this way; users from those ecosystems read `drwn install` correctly.

### 6.5 What `install` is NOT

- It's not a new way to add cards to a project. `drwn add` / `drwn use` / `drwn pin` still do that.
- It's not a substitute for daily `drwn apply`. Once cards are installed, `apply` is enough.
- It's not a Git-specific command. It handles all origins: store, git, file, npm.

---

## 7. Where Each Command Lives in the Layered Model

A single picture, by layer:

```text
Layer 1: Built-in
    (no commands operate here directly; static content)

Layer 2: Library                                     ← library namespace lives here
    drwn library list/show/add/defaults/refresh      (manage inventory)
    drwn card list/show/diff/new/source/publish      (artifact operations)
    drwn card publish (writes here in Phase 2+)
    drwn card remote/push/fetch/clone (Phase 2+)
    drwn library add catalog (Phase 2+)
    drwn search card (Phase 2+)
    drwn store migrate-to-git, migrate-to-bare-repos, gc, verify

Layer 3: Project                                     ← composition verbs live here
    drwn init
    drwn use, add, remove, pin, clear                (mutate cards[])
    drwn update, outdated                            (re-resolve)
    drwn cards                                       (inspect project's cards)
    drwn preset save/use/list/...                    (project snapshots)

Layer 4: Curated
    drwn skills enable/disable                       (curate to publication layer)
    drwn profile save/use/list/...                   (machine snapshots)
    drwn library defaults add/remove                 (set machine-wide defaults)

Layer 5: Downstream                                  ← apply lives here
    drwn apply                                       (materialize Layer 4 → Layer 5)
    drwn doctor                                      (verify Layer 5 state)
    drwn status                                      (inspect the whole stack including Layer 5)

Cross-layer:
    drwn install (Phase 1+)                          (ensure Layer 2 has content for Layer 3's references; then apply)
```

This is the canonical map. When you read any of the Git-rollout target architecture docs (47, 48, 49) and want to know "where does this command live in the model," check this map.

---

## 8. Lifecycle Stages of Cards

Another lens: cards have a lifecycle, and commands cluster around its stages.

```
STAGE A — Authoring
  drwn card source new
  drwn card source add-skill/remove-skill/set/add-mcp/remove-mcp
  drwn card source doctor
  └─→ Output: editable content at ~/.agents/drwn/sources/

STAGE B — Publishing (committing a version)
  drwn card publish                     ← Phase 2+: writes Git commit + tag
  drwn card push (Phase 2+)             ← share to team remote
  drwn card deprecate
  └─→ Output: versioned content in cards/ (bare repos in Phase 2+)

STAGE C — Discovery & Import
  drwn library add card git+url
  drwn library add catalog (Phase 2+)
  drwn card clone (Phase 2+)
  drwn card fetch (Phase 2+)
  drwn search card (Phase 2+)
  └─→ Output: cards available in local store

STAGE D — Project Composition
  drwn use <cards>
  drwn add <card>
  drwn pin/remove/clear
  drwn update
  └─→ Output: project config.json + card.lock written

STAGE E — Bootstrap (Phase 1+)
  drwn install
  └─→ Output: all locked cards present in local store

STAGE F — Materialization
  drwn apply
  └─→ Output: ~/.claude/, ~/.codex/, ~/.cursor/, project-local equivalents

STAGE G — Inspection & Maintenance
  drwn status, drwn doctor, drwn cards, drwn outdated
  drwn card show, drwn card diff
  drwn store gc, drwn store verify (Phase 2+)
```

Each stage's commands are stable across phases (with content noted for Phase 2+). The lifecycle is the same; the phases enrich tools at each stage.

---

## 9. A Concrete Walkthrough

What does a user's full workflow look like, end-to-end, after Phase 3 lands? This is the canonical user journey, with phase callouts.

### 9.1 Author publishes a new card

```bash
# Stage A: author
drwn card source new @team/baseline
$EDITOR ~/.agents/drwn/sources/@team/baseline/skills/code-review/SKILL.md
drwn card source add-skill @team/baseline tracing-helper
drwn card source doctor @team/baseline

# Stage B: publish locally + push to team
drwn card publish @team/baseline --version 1.0.0    # Phase 2+: writes to bare repo
drwn card remote add @team/baseline https://github.com/team-org/baseline-card.git
drwn card push @team/baseline
```

Where do these commands live? Stage A operates on Layer 2 (sources/). Stage B writes to Layer 2 (cards/ bare repo) and uses Git plumbing to push to the team remote.

### 9.2 Teammate joins fresh

```bash
git clone https://github.com/team-org/my-project.git
cd my-project

# Stage E: bootstrap
drwn install                                          # Phase 1+: bridges lockfile → local store → apply
```

What `drwn install` does internally:

- Reads `<project>/.agents/drwn/card.lock`.
- Sees `@team/baseline@1.0.0` with `origin: "store"` (or `"git"` if added via git URL) and `git.url` set.
- Clones the URL into `~/.agents/drwn/cards/@team/baseline.git/` (Phase 2+).
- Extracts the pinned commit's tree into `~/.agents/drwn/extracted/<tree-sha>/`.
- Verifies the integrity hash.
- Runs `drwn apply` to materialize downstream.

The teammate runs **one command** after `git clone`. drwn install handles the rest.

### 9.3 Teammate uses the project daily

```bash
# Stage F: daily materialization (Layer 4 → Layer 5)
drwn apply
```

`drwn apply` materializes the project's effective state to downstream tools. No network. No surprises. Same behavior across all phases.

### 9.4 Author publishes an improvement

```bash
# Stage A: edit
$EDITOR ~/.agents/drwn/sources/@team/baseline/skills/code-review/SKILL.md

# Stage B: publish + push
drwn card publish @team/baseline --bump minor    # → v1.1.0
drwn card push @team/baseline
```

### 9.5 Teammate adopts the update

```bash
# Stage C: refresh remotes for known cards
drwn card fetch @team/baseline

# Stage G: see what's outdated
drwn outdated                                    # @team/baseline: 1.0.0 → 1.1.0 available

# Stage D: bump the project's pinned version
drwn pin @team/baseline@1.1.0

# Stage F: materialize
drwn apply
```

### 9.6 Teammate adds a new card from a public Git URL

```bash
# Stage C: add from URL (Phase 1+; Phase 3 unifies into bare repo)
drwn add git+https://github.com/upstream/observability-card.git#v2.0.0

# Stage F
drwn apply
```

After Phase 3, the public card lives in `~/.agents/drwn/cards/@upstream/observability.git/`, just like team-published cards. The teammate can `drwn card show @upstream/observability@2.0.0` to see its Git history, `drwn card diff @upstream/observability@v1.9.0 @upstream/observability@v2.0.0` to see what changed.

### 9.7 Teammate snapshots their work

```bash
# Stage D: save current project state as a preset
drwn preset save heavy-mode

# Adjust composition
drwn remove @upstream/observability

# Stage F: re-materialize lighter
drwn apply

# Restore preset
drwn preset use heavy-mode                       # auto-applies after restore
```

Presets and profiles operate on intent at Layer 3 (project) and Layer 4 (machine baseline). They don't touch storage.

---

## 10. Anti-Patterns Avoided

A few design choices that this document's framing makes explicit. These are things drwn does NOT do, and why:

### 10.1 `apply` does NOT auto-fetch

`drwn apply` is local-only. It never silently hits the network. If a card is missing, `drwn apply` reports the error and suggests `drwn install`. This separation is intentional:

- Performance predictability: users running `apply` in scripts know it's fast.
- CI clarity: `apply` failing on missing content is a clear signal that `install` should be run first.
- User trust: surprises on slow networks are bad UX.

### 10.2 `library` does NOT mutate project state

`drwn library add card <url>` adds a card to the **library** (the user's inventory). It does NOT add it to the current project's `cards[]`. To use a card in a project, the user runs `drwn add @scope/name@ver` afterwards.

This separation is from `13_*` §2.3 and held throughout.

### 10.3 `apply` does NOT know about origins

The materialization layer reads `path` from lockfile entries. It doesn't dispatch on `origin`. Adding new origins (git, future remote registry) doesn't require touching `apply`.

### 10.4 `install` does NOT modify the lockfile (in `--frozen` mode)

`drwn install --frozen` refuses to modify the lockfile. This is the CI invariant: the same lockfile + the same store should produce the same effective state, every time.

### 10.5 Project configs do NOT carry URLs

Project `config.json` has card refs as `@scope/name@^1.0.0`. URLs live in the **lockfile** (`git.url` field) and the **bare repo config** (`[remote "origin"]`). This means project configs are portable across machines without rewriting URLs.

---

## 11. Findings

1. **`apply` is the most stable verb in the entire surface.** Its contract — given a lockfile, produce a specific downstream state — is invariant across all phases.
2. **`library` is the most stable namespace.** Its role — manage user inventory — is invariant; new entry types (Git URL cards, catalogs) are additive.
3. **Project-composition verbs are invariant in role.** New ref forms are accepted by `drwn add` over the phases, but `use`/`pin`/`remove`/`clear` semantics don't change.
4. **`install` is the only genuinely new role.** It exists because Phase 1 introduces a new fact: lockfiles can reference cards that aren't yet present. `install` is the bootstrap step that bridges this gap.
5. **The Git phases reshape Layer 2 (Library) only.** Layers 1, 3, 4, 5 are untouched.
6. **The lockfile is the contract between resolution and materialization.** As long as the lockfile schema is preserved, materialization is undisturbed.
7. **The five-layer model is the right teaching device.** Every command has a clear home in it.

---

## 12. Recommendations

- **R1** — Use this command-roles framing in user-facing documentation. The five-layer model + lifecycle stages give new users a complete map of the CLI.
- **R2** — Use this framing in the operator guide's introduction. The current operator guide (`40_*`) lists commands by alphabet; reorganizing by layer + lifecycle stage would be a clarity win.
- **R3** — Use this framing in `drwn --help` output where space allows. A high-level "command groups" section in help, organized by layer or lifecycle stage, would orient new users faster than the current flat list.
- **R4** — Use this framing in the docs site (`docs-docusaurus/`, task 27). The Getting Started section's "Choose Your Path" maps naturally to lifecycle stages.

These are documentation improvements that flow from making the architectural framing explicit. None are blocking; all are quality-of-life.

---

## 13. Open Questions

1. **Should `drwn install` accept arguments like `npm install <pkg>` to add a card?**
   - Lean: no. `drwn add` does that. `drwn install` is the bootstrap-from-lockfile verb, not an alternate path to add a card. Separation is cleaner.

2. **Should `drwn apply` ever automatically fall back to `drwn install` if it detects missing cards?**
   - Lean: no, with a clear error message that suggests `drwn install`. Auto-fallback hides the network hit.

3. **Should `drwn library add card git+url` be a synonym for `drwn add git+url` outside a project context?**
   - Lean: yes, with documentation noting the distinction. Inside a project, `drwn add` adds to the project's `cards[]`. Outside any project, `drwn library add card` adds to inventory only.

4. **Is the `install` vs `apply` distinction worth a help-text callout?**
   - Yes. The first sentence in `drwn install --help` and `drwn apply --help` should mention the other and clarify when to use which.

5. **Does any user-facing doc currently risk implying `apply` and `library` change in role?**
   - Skim the operator guide and docs site. If yes, edit to clarify.

---

## 14. Appendix

### A. Quick-reference: which command lives where

| Command | Layer | Lifecycle stage | Phase introduced |
|---|---|---|---|
| `drwn init` | 3 | D | 0 |
| `drwn use` | 3 | D | 0 (vocab from 42) |
| `drwn add` | 3 | D | 0 (vocab); Git URL refs P1 |
| `drwn pin` | 3 | D | 0 (vocab) |
| `drwn remove` | 3 | D | 0 (vocab) |
| `drwn clear` | 3 | D | 0 (vocab) |
| `drwn update` | 3 | D | 0 |
| `drwn outdated` | 3 | G | 0; `--fetch` P2 |
| `drwn cards` | 3 | G | 0 |
| `drwn apply` | 5 | F | 0 (was `write`) |
| `drwn install` | cross | E | 1 |
| `drwn status` | cross | G | 0 |
| `drwn doctor` | 5 | G | 0 |
| `drwn library list/show/add/defaults` | 2 | C | 0 |
| `drwn library add card` | 2 | C | 1 |
| `drwn library add catalog` | 2 | C | 2 |
| `drwn library refresh catalog` | 2 | C | 2 |
| `drwn skills enable/disable/list` | 4 | — | 0 (vocab) |
| `drwn mcp list/apply` | 4 | F | 0 (vocab) |
| `drwn extensions setup/...` | 2/3 | various | 0 |
| `drwn search skill/mcp` | 2 | C | 0 |
| `drwn search card` | 2 | C | 2 |
| `drwn preset save/use/list/...` | 3 | D | (per analysis 42) |
| `drwn profile save/use/list/...` | 2/4 | C/D | (per analysis 42) |
| `drwn card list` | 2 | G | 0 |
| `drwn card show` | 2 | G | 0; Git log P2 |
| `drwn card diff` | 2 | G | 0; Git diff P2 |
| `drwn card new` | 2 | A | 0 |
| `drwn card source ...` | 2 | A | 0 (task 41) |
| `drwn card publish` | 2 | B | 0; Git plumbing P2 |
| `drwn card deprecate` | 2 | B | 0 |
| `drwn card remote add/list/set/remove` | 2 | B | 2 |
| `drwn card push` | 2 | B | 2 |
| `drwn card fetch` | 2 | C | 2 |
| `drwn card clone` | 2 | C | 2 |
| `drwn store status` | 2 | G | 0 |
| `drwn store migrate-to-git` | 2 | — (migration) | 2 |
| `drwn store migrate-to-bare-repos` | 2 | — (migration) | 3 |
| `drwn store gc` | 2 | G | 2 |
| `drwn store verify` | 2 | G | 2 |

### B. Stable invariants across all phases

These are the guarantees the user can rely on, regardless of phase:

1. `drwn apply` produces a deterministic downstream state from a given lockfile.
2. The lockfile schema is stable (v2 from Phase 1 onwards; v1 read-compat throughout).
3. Project configs (`config.json`) never carry URLs.
4. `drwn doctor` exits 0 iff drwn-managed state is consistent.
5. `drwn status` shows the layered composition.
6. Card immutability: once a version is published locally, its content never changes.
7. Authentication is Git's domain.

### C. What a docs-site landing page could say

> ## How drwn Works
>
> drwn is organized around a five-layer model. Each layer has its own commands:
>
> - **Built-in** — what ships with drwn (no commands)
> - **Library** — your local inventory (`drwn library ...`, `drwn card ...`, `drwn search ...`)
> - **Project** — your current project's harness (`drwn use`, `drwn add`, `drwn pin`, `drwn cards`, ...)
> - **Curated** — your active machine baseline (`drwn skills enable`, `drwn profile use`, ...)
> - **Downstream** — files agent tools actually read (`drwn apply`, `drwn doctor`)
>
> The composition flows upward: every layer is a function of the lower layers. The materialization flows downward: `drwn apply` writes Layer 5 from Layer 4's effective state. The `drwn install` command bootstraps cards into Layer 2 from a project's lockfile.

This framing fits in ~150 words and orients new users completely. Recommend including in the operator guide's introduction.
