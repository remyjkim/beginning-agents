# PRD: Skill Recommendation (Phase 1 MVP)

## Document Metadata

**Date Created:** 2026-05-04  
**Last Updated:** 2026-05-06  
**Author(s):** Junggyu Bae, Claude Code  
**Version:** 0.1

**Changelog:**
- v0.1 (2026-05-06): Adjusted pipeline and development phases  
- v0.0 (2026-05-04): Initial PRD for Skill Recommendation Engine

---

## Overview

Add `bgng recommend` command with two modes:

1. **`bgng recommend skill <query>`** (Phase 1) — Ranked search. Find matching skills, rank by semantic relevance + repo context, explain why each matters.
2. **`bgng recommend`** (Phase 2) — Gap analysis. Analyze installed skills, detect missing domains, recommend complementary skills to round out the toolkit.

Both complement `bgng search` by adding intelligent ranking and explanations.

**Scope:** beginning-harness focuses on **general skill recommendation from existing npm skill pool** (hard skills: testing, security, performance, patterns, etc.). This differs from beginning-agents, which would focus on soft skills (collaboration, communication) requiring new skill taxonomy. Phase 1–2 recommend from npm skills; Phase 3 personalizes recommendations based on user adoption behavior.

---

## Problem

`bgng search skill` returns unranked results. With 500+ skills, users don't know which match their project best. A TypeScript user searching "testing" sees identical results as a Python user—missing repo-aware ranking. No explanations either; users guess why results matter.

---

## Solution

Rank search results by:
1. **Semantic similarity** — embed query + skill descriptions, score match
2. **Repo context boost** — detect project language/framework, +0.15 boost for matching-language skills
3. **Inline explanations** — one-line reason per skill

Simple, fast, no user history/feedback needed.

---

## Goals

**Phase 1 (MVP):**
- Find all matching skills (local + npm) for a query
- Rank by semantic relevance + repo context with >80% precision
- Explain each: "<match reason>. Your <language> project would benefit."
- Show status: `[active]` | `[available offline]` | `[available online]`
- Iterative loop: ask for query refinement, add skill, or exit
- Complete in <300ms (p95)

**Phase 2 (Mid):**
- Gap analyzer: detect missing domains in installed skills
- Skill Ranker enhanced: score by (gap relevance + semantic similarity + language + constraints)
- User Understanding: analyze repo + installed skills → context, constraints, behavior signals
- Both query-based and gap-based modes fully operational
- Status: `[active]` | `[available offline]` | `[available online]` with explanations
- Latency: TBD (after Phase 1 Mastra learnings)

**Phase 3 (Future):**
- Session log signals: capture accepts, ignores, refinements, skill adoptions per session
- Behavior interpretation: analyze patterns (what user searches, which skills they add, rejection reasons)
- Long-term user memory: build persistent profile of adoption patterns, preferences, constraints
- Advanced ranking: boost recommendations based on learned user profile + behavior history

---

## Non-Goals (Phase 1)

- ~~Gap-based recommendations~~ → Phase 2
- ~~Personalization or user behavior learning~~ → Phase 3
- ~~User profile/memory~~ → Phase 3
- Changes to `bgng search` or other existing commands
- Dashboard/UI — CLI output only
- Real-time analytics or usage tracking

---

## Architecture

**Core pipeline:** Query → Embed → Index lookup → Rank → Explain → Output

**Components:**
- **Skill Indexer** — Load all skill metadata; pre-compute embeddings (Mastra AI)
- **Repo Context Detector** — Detect language/framework from files (package.json, tsconfig.json, etc.)
- **Query Ranker** — Score: semantic similarity + language boost (+0.15), sort descending
- **Explanation Generator** — Template: "Matches '<query>'. Your <language> project would benefit."
- **CLI Command** — `bgng recommend skill <query>`

**Ranking formula:**
```
score = semantic_similarity + (repo_language_matches_skill_domain ? 0.15 : 0)
```

---

## Session Log Analysis Pipeline (Phase 3)

**Distinct from existing diagnostic pipeline.** The existing session log analysis pipeline diagnoses collaboration patterns. Phase 3 requires a **new analysis pipeline optimized for recommendation signals**:

**Components:**
- **Signal Extractor** — Capture from session logs: which skills user accepted, ignored, refined query after seeing, how many times asked for same domain
- **Pattern Analyzer** — Detect user adoption patterns: preferred skill domains, rejection reasons, refinement behaviors, skill adoption latency
- **Preference Learner** — Build user profile: affinity for domains (security > testing?), language preferences, constraint patterns (e.g., "always asks for async patterns in Rust")

**Why separate pipeline:**
- Diagnostic pipeline: "Why is collaboration breaking down?" → analyzes interaction patterns
- Recommendation pipeline: "What skills will this user adopt?" → analyzes adoption signals + skill preferences

**Output:** User profile (preferred domains, adoption speed, language/framework affinities, constraint patterns) → fed to Skill Ranker in Phase 3 as "personalization boost"

---

**Skill domains (for ranking + Phase 2 gap analysis):**
- testing, security, performance, deployment, documentation, patterns, code-quality, debugging, refactoring, internationalization

---

## Implementation Plan & Learning Objectives

This implementation serves dual purpose: **ship Phase 1 feature** + **learn Mastra AI**.

**Learning focus:** Understand Mastra's embedding API, model selection, caching strategies, and performance optimization. Phase 1 becomes the testbed for Mastra patterns that can be reused in Phase 2+ (gap analysis, personalization).

**Assumptions & Constraints:**

- **Hard skills focus:** Recommend from existing npm skill pool (testing, security, patterns, etc.), not designing new soft skill taxonomy. Eliminates Phase 1–2 need to define collaboration skill domains.
- **Repo context:** Single language per project. Detect from root directory (package.json, tsconfig.json, go.mod, Cargo.toml, pyproject.toml). If multi-language, prioritize by file count. If undetectable, skip domain boost (graceful).
- **Mastra AI:** Chosen approach for semantic embeddings. Phase 1 is also a learning opportunity to understand Mastra's API, embedding quality, and optimization. Target: <50ms per embedding; optimize caching/batching as needed.
- **Skill metadata:** Requires domain tags in registry. Each skill has: name, description, domains (list), source (built-in/npm).
- **Phase 3 analysis pipeline:** Separate from existing diagnostic session log pipeline. Extracts recommendation signals (accepts, ignores, refinements, adoption latency) to build user preference profiles. Not for diagnosing collaboration breakdowns.
- **Relevance definition:** A result is relevant if (a) semantic similarity ≥ 0.5 AND (b) skill is suitable for project language. Manual eval on 20 diverse queries determines >80% bar.

---

**Phase 1 Implementation Steps:**

1. **Skill Indexer** — Load built-in + npm skills; embed descriptions with Mastra AI
2. **Repo Context Detector** — Scan root for package.json, tsconfig.json, go.mod, Cargo.toml, pyproject.toml; extract language
3. **Query Ranker** — Embed query; score against indexed skills (semantic similarity + 0.15 language boost)
4. **Explanation Generator** — Format: "Matches '<query>'. Your <language> project would benefit."
5. **Status Resolver** — Check skill availability: [active] | [available offline] | [available online]
6. **CLI Command** — Wire `bgng recommend skill <query>` with iterative loop (refine/add/exit)
7. **Error Handling** — Graceful fallbacks: embedding fails → skip ranking; no matches → suggest refinement; undetectable language → semantic-only ranking
8. **Testing** — Unit tests on 20+ queries; manual relevance eval; target >80%
9. **Docs** — Update README with examples and expected output

---

## Example Output

```
$ bgng recommend skill testing
[Detected: TypeScript project]

Recommended skills:
1. /test-coverage [available online]
   Matches "testing" query. Your TypeScript project would benefit from coverage analysis.

2. /tdd-workflow [available offline]
   Matches "testing" query. Essential for test-driven development in TypeScript.

3. /python-testing [available online]
   Matches "testing" but less relevant for TypeScript projects.

Next: 
  - Add skill: bgng add skill /test-coverage
  - Refine search: bgng recommend skill "unit testing"
  - Gap analysis: bgng recommend
  - Exit: (press Ctrl+C)
```

---

## Acceptance Criteria

- **Latency:** <300ms p95 (ranking overhead <50ms)
- **Relevance:** >80% of top-3 results relevant (manual eval on 20 diverse queries: testing, security, performance, deployment, documentation, patterns, code-quality, debugging, refactoring, api-design, devops, architecture, etc.)
- **Accuracy:** Status labels correct 100% of cases
- **Coverage:** Handles new projects (no installed skills), undetectable repo context gracefully
- **No regressions:** Existing `bgng` commands unaffected

---

## Error Handling & Graceful Degradation

Phase 1 must fail gracefully:

| Scenario | Behavior |
|----------|----------|
| Mastra embedding fails | Skip semantic ranking; suggest query refinement or use keyword matching |
| No skills match query | Return empty with: "No skills found for '<query>'. Try: `bgng recommend skill <refined-query>`" |
| Repo language undetectable | Semantic-only ranking (skip +0.15 boost); inform user "Language not detected" |
| Skill metadata malformed | Skip that skill; log warning; continue with others |
| User lacks write permission for add | Show skill but disable "add skill" option; suggest `bgng init` first |

---

## Architecture Pipeline

```mermaid
flowchart TB
    subgraph Pipeline[" "]
        direction TB
        subgraph Trigger["Trigger Mode"]
            TQ["bgng recommend skill &lt;query&gt;<br/>(Phase 1)"]
            TNQ["bgng recommend<br/>(Phase 2)"]
        end

        subgraph Signals["Signals"]
            SIG["Phase 1: Repo structure, languages, skill metadata<br/><br/>Phase 2: Installed skills, domain analysis<br/><br/>Phase 3: Session logs, user behavior, patterns"]
        end

        subgraph Understanding["User Understanding (Phase 2+)"]
            UA["repo context<br/>installed skills summary<br/>constraints<br/>behavior signals"]
        end

        subgraph Recommend["Skill Recommendation Pipeline"]
            Pool["Skill Index<br/>(pre-computed embeddings)"]
            QN["Query Normalizer<br/>Phase 1+"]
            SR["Skill Ranker<br/>P1: semantic + language<br/>P2: + gap relevance + constraints<br/>P3: + user memory boost"]
            ST["Status Resolver<br/>[active]/[offline]/[online]"]
            EG["Explanation Generator"]
            OUT["CLI Output"]
        end

        subgraph BehaviorPhase["User Behavior (Phase 3)"]
            BP["Session Log Analyzer<br/>Input: raw signals (accepts/ignores/refinements)<br/>Output: refined signal (user profile)"]
        end

        Iter{{"Next step?"}}
        AskQ["Ask for refinement<br/>Phase 2+"]
        Add["Add skill"]
        Exit["Exit"]

        %% Wiring
        SIG --> UA

        TQ -.->|raw query| QN
        TNQ -.->|gap analysis| UA
        AskQ -.->|raw query| QN

        Pool --> SR
        UA --> SR
        QN -.->|query| SR

        SR --> ST --> EG --> OUT
        OUT --> Iter
        Iter -->|Refine| AskQ
        Iter -->|Add| Add
        Iter -->|Exit| Exit

        %% Phase 3 feedback loop
        BP -.->|refined signal (user profile)| SR
    end

    subgraph Legend["Legend"]
        direction LR
        L1["🟢 Phase 1: Query-based MVP"]
        L2["🟡 Phase 2: Gap Analysis"]
        L3["🔴 Phase 3: Personalization"]
    end

    %% Phase 1 (Green)
    style TQ fill:#ccffcc,stroke:#009900,stroke-width:2px
    style QN fill:#ccffcc,stroke:#009900,stroke-width:2px
    style SR fill:#ccffcc,stroke:#009900,stroke-width:2px
    style ST fill:#ccffcc,stroke:#009900,stroke-width:2px
    style EG fill:#ccffcc,stroke:#009900,stroke-width:2px
    style OUT fill:#ccffcc,stroke:#009900,stroke-width:2px
    style Pool fill:#ccffcc,stroke:#009900,stroke-width:2px
    style Iter fill:#ccffcc,stroke:#009900,stroke-width:2px
    style Add fill:#ccffcc,stroke:#009900,stroke-width:2px
    style Exit fill:#ccffcc,stroke:#009900,stroke-width:2px

    %% Phase 2 (Yellow/Orange)
    style TNQ fill:#fff5cc,stroke:#cc9900,stroke-width:2px,color:#664400
    style Understanding fill:#fff5cc,stroke:#cc9900,stroke-width:2px,color:#664400
    style UA fill:#fff5cc,stroke:#cc9900,stroke-width:2px,color:#664400
    style AskQ fill:#fff5cc,stroke:#cc9900,stroke-width:2px,color:#664400

    %% Phase 3 (Red)
    style BehaviorPhase fill:#ffe6e6,stroke:#cc0000,stroke-width:2px,color:#660000
    style BP fill:#ffe6e6,stroke:#cc0000,stroke-width:2px,color:#660000

    %% Legend styling
    style Legend fill:#f0f0f0,stroke:#999,stroke-width:1px
    style L1 fill:#ccffcc,stroke:#009900,stroke-width:1px
    style L2 fill:#fff5cc,stroke:#cc9900,stroke-width:1px
    style L3 fill:#ffe6e6,stroke:#cc0000,stroke-width:1px
```

