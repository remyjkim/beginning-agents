# Phase 1 Implementation Plan: Skill Recommendation MVP

**Status:** Ready for Implementation | **Date:** 2026-05-07  
**Objective:** Ship `bgng recommend skill <query>` command with semantic ranking + popularity + language matching

---

## Core Specs

| Component | Definition |
|-----------|-----------|
| **Embedding** | 512-dim (Mastra AI) |
| **Ranking** | `0.6×semantic + 0.3×popularity + 0.1×language` |
| **Language Detection** | Count .ts, .py, .go etc. by extension; primary = highest % |
| **Popularity** | `0.5×log₁₀(installs+1) + 0.3×log₁₀(stars+1) + 0.2×freshness` |
| **Freshness** | `days_since_update ≤ 30 → 1.0, else max(0, 1.0 - 0.01×(days-30))` |
| **Semantic Threshold** | ≥ 0.5 cosine similarity |
| **Caching** | 7-day TTL, file-based JSON (`.claude/skill-embeddings.json`) |
| **Performance Target** | <300ms p95 (full), <100ms (ranking only) |
| **Success Bar** | >80% top-5 relevant, 100% registry coverage |

---

## Implementation Tasks (Critical Path)

| Task | What | Acceptance Criteria | Blocks |
|------|------|-------------------|--------|
| **1. Skill Indexer** | Load + embed all skills from skills.sh | 512-dim embeddings cached, popularity data included, error handling | Tasks 3–4 |
| **2. Repo Detector** | Detect project languages (GitHub-style) | Return `{languages: {Type: %, ...}, primary, confidence}`. **Edge cases:** Skip node_modules/, build/, dist/, .git/, vendor/, __pycache__/, target/, .next/. If <10 source files found, confidence=low. If 10–100 files, confidence=medium. If >100 files, confidence=high. If undetectable (0% source files found), return empty with confidence=0 and inform user. | Task 3 |
| **3. Query Ranker** | Score & rank skills with merge strategy | Score: semantic×0.6 + popularity×0.3 + language×0.1, filter ≥0.5; if skill in multiple iterations (base + synonym), average scores; return top-5 | Task 4, 6 |
| **4. Explanation Gen** | Create human-readable reason per result | Template varies by scenario (see Explanation Rules below). Handle missing language/domain gracefully | Task 6 |
| **5. Status Resolver** | Check skill availability | Check if skill path exists: in repo=[active], in cache=[available offline], verify from API=[available online] | Task 6 |
| **6. CLI Command** | Wire `bgng recommend skill <query>` + loop | Show top-5 results with status labels, language detection, scores. Menu-style interaction (1=Add to clipboard, 2=Refine, 3=Exit). Handle EOF (Ctrl+D) gracefully. | Task 7 |
| **7. Error Handling** | Graceful degradation | Embedding API fails → skip popularity, use semantic+language only; no matches → suggest refinement (list top 3 popular skills). Render all errors gracefully with actionable messages. | Task 8 |
| **8. Testing** | 20+ queries, >80% top-5 relevant | Unit + integration tests, p95 latency measured, manual eval | Task 9 |
| **9. Docs** | README + examples | Syntax, examples, supported languages, error recovery | Ship |

**Dependencies:** 1 (+ parallel 2) → 3 → 4,5 → 6 → 7 → 8 → 9  
**Parallel:** Tasks 1 and 2 can run simultaneously

---

## Skill Data Structure

```typescript
interface Skill {
  slug: string;                    // e.g., "test-coverage"
  name: string;                    // Display name
  description: string;             // Long description for embedding
  installCount: number;            // npm/package registry
  githubStars: number;             // GitHub repo stars
  lastUpdated: string;             // ISO 8601 date (last commit or release)
  languages: string[];             // e.g., ["TypeScript", "JavaScript"] (languages skill is suitable for)
  embedding: number[];             // 512-dim vector
  domain?: string;                 // e.g., "testing", "security", "performance" (for explanations)
}
```

**Data Source: Skills-API**

Endpoint: `POST /api/v1/skills/index` (or `GET /api/v1/skills` with pagination)

Request: `{}`
Response:
```json
{
  "skills": [
    {
      "slug": "test-coverage",
      "name": "test-coverage",
      "description": "Track code coverage in TypeScript...",
      "installCount": 14200,
      "githubStars": 892,
      "lastUpdated": "2026-04-15T10:32:00Z",
      "languages": ["TypeScript", "JavaScript"],
      "domain": "testing"
    }
  ],
  "metadata": {
    "count": 28,
    "popularity_min_installs": 100,
    "popularity_max_installs": 250000,
    "popularity_min_stars": 10,
    "popularity_max_stars": 150000
  }
}
```

**Authentication:** API key in `Authorization: Bearer {SKILLS_API_KEY}` header.
**Rate Limit:** 100 req/min; full index should be fetched once per 24h and cached.
**Fallback:** If skills-api is unavailable, load from local `skills-registry.json` (checked into repo as backup).

## Query Iteration Mechanism

Each internal iteration expands the query via npm `synonyms` package: base search → synonym expansion → merged ranking. Three iterations are hidden from user; results are merged by averaging scores when the same skill appears across iterations, then returned as top-5.

---

## Scoring Details

**Final Score:** `0.6×semantic + 0.3×popularity + 0.1×language`

**Semantic:** Cosine similarity (0–1), filter ≥0.5  

**Popularity (normalized to [0,1]):**
1. **Component scores (raw):**
   - Installs: `log₁₀(installCount + 1)`
   - Stars: `log₁₀(githubStars + 1)`
   - Freshness: `days_since_update ≤ 30 → 1.0, else max(0, 1.0 - 0.01×(days-30))`

2. **Normalize each to [0,1] using observed bounds from skills-api metadata:**
   - Installs normalized: `(log₁₀(count+1) - min_install_log) / (max_install_log - min_install_log)`, clamped to [0,1]
   - Stars normalized: `(log₁₀(stars+1) - min_stars_log) / (max_stars_log - min_stars_log)`, clamped to [0,1]
   - Freshness already [0,1]

3. **Weighted average:** `popularity_score = 0.5×installs_norm + 0.3×stars_norm + 0.2×freshness` → final score [0,1]

**Example calculation:**
- Skill with 10K installs (log=4.0), 500 stars (log=2.7), 10 days old (freshness=1.0)
- Assume observed bounds: installs [0, 5.4] (max 250K), stars [0, 5.2] (max 150K)
- Installs norm: (4.0 - 0) / 5.4 = 0.74
- Stars norm: (2.7 - 0) / 5.2 = 0.52
- Freshness: 1.0
- Popularity: 0.5×0.74 + 0.3×0.52 + 0.2×1.0 = **0.726**

**Language:** Primary language = 1.0, in detected languages = 0.7, not detected = 0.0

**Status Labels (Installation State):**
- `[active]` — Skill is installed in user's ~/.claude/skills directory (ready to use)
- `[offline]` — Skill metadata cached locally, not verified against skills-api this session
- `[online]` — Skill data just fetched fresh from skills-api this session

**Data Sources:**
- **skills-api:** Skill metadata, descriptions, install counts
- **GitHub API:** Stars, last commit date
- **Mastra AI:** 512-dim embeddings
- **Local:** Check if skill path exists in repo

---

## Success Criteria

- **Latency:** <300ms p95 (full), <100ms (ranking)
- **Relevance:** >80% top-5 manually evaluated as relevant
- **Coverage:** 100% skill registry indexed
- **Status Accuracy:** [active]/[offline]/[online] labels 100% correct
- **UX:** Explanations clear, CLI feels natural in workflow

---

## Example Output

**Happy Path (with matches):**
```
$ bgng recommend skill testing

[Detected: TypeScript (65%), Python (25%), Go (10%)]
[Searching... 3 internal iterations]

Recommended skills:
1. /test-coverage [available online]
   Matches "testing". Your TypeScript project would benefit from coverage analysis.
   Score: 0.89 (semantic: 0.85, popularity: 0.92, language: 1.0) | 14.2K installs | ⭐ 892

2. /tdd-workflow [available offline]
   Matches "testing". Your TypeScript project would benefit from test-driven development.
   Score: 0.87 (semantic: 0.84, popularity: 0.85, language: 1.0) | 8.5K installs | ⭐ 421

3. /python-testing [available online]
   Matches "testing" (less relevant for TypeScript). General testing patterns for Python.
   Score: 0.62 (semantic: 0.80, popularity: 0.55, language: 0.3) | 6.1K installs | ⭐ 312

What next?
  1. Add to clipboard
  2. Refine search
  3. Exit

Your choice (1-3): 1
Adding /test-coverage...
✅ Skill added successfully

What next?
  1. Add skill
  2. Refine search
  3. Exit

Your choice (1-3): 2
New query: test-driven development

[Searching... 3 internal iterations]
Recommended skills:
1. /tdd-workflow [offline]
   Matches "test-driven development". Your TypeScript project would benefit from TDD patterns.
   Score: 0.91 ...

What next?
  1. Add to clipboard
  2. Refine search
  3. Exit

Your choice (1-3): 3
Goodbye.
```

**Error Path (no matches):**
```
$ bgng recommend skill xyz999notreal

[Detected: TypeScript (65%), Python (25%), Go (10%)]
[Searching... 3 internal iterations]

No skills match "xyz999notreal" (semantic threshold ≥0.5).

Suggestions: Try "testing", "debugging", "security", or "performance".

What next?
  1. Refine search
  2. Exit

Your choice (1-2): 1
New query: debugging

[Searching...]
Recommended skills:
1. /systematic-debugging [available online] ...
```

**Language Detection Edge Case (undetectable):**
```
$ bgng recommend skill performance

[Language detection skipped — unable to determine primary language. Using semantic ranking only.]
[Searching... 3 internal iterations]

Recommended skills:
1. /performance-oracle [online]
   Matches "performance". Performance profiling and optimization.
   Score: 0.84 (semantic: 0.84, popularity: 0.78, language: 0.0)

What next?
  1. Add to clipboard
  2. Refine search
  3. Exit

Your choice (1-3):
```

---

## Architecture & Component Design

**Pipeline:** Query → Normalize → Embed → Rank → Resolve Status → Explain → Output

**Data flow:**
1. User enters query (`bgng recommend skill <query>`)
2. Query Normalizer: cleanup abbreviations, remove punctuation, dedupe synonyms
3. Query is embedded (Mastra AI) or matched against cache
4. Skill Ranker scores all indexed skills using 3-factor formula
5. Top-5 results filtered (≥0.5 semantic threshold)
6. Status Resolver checks availability: [active] (installed), [offline] (cached), [online] (fresh from API)
7. Explanation Generator creates contextual reason per result
8. CLI displays top-5 with scores, installs, stars, status
9. User chooses: add to clipboard (1), refine search (2), or exit (3)
10. If refine, loop back to step 2 with new query

**External dependencies:**
- **Mastra AI:** 512-dim embeddings (query + skill descriptions)
- **Skills-API:** Metadata (installs, stars, domain, languages, lastUpdated)
- **npm synonyms package:** Tech-term expansion (testing → [testing, test, qa, verification])
- **GitHub API (optional):** Fetch lastUpdated if skills-api doesn't provide it

**Caching strategy:**
- Embeddings cached 7 days (.claude/skill-embeddings.json)
- Skills-API polled every 24h for metadata refresh
- Fallback: local skills-registry.json (backup for API outages)

---

## Code Organization

```
cli/
├── commands/recommend/
│   ├── skill.ts              (CLI command)
│   └── search-agent.ts       (3-iteration loop + user feedback)
├── core/
│   ├── skill-indexer.ts      (Load + embed skills)
│   ├── repo-context.ts       (Language detection)
│   ├── ranking.ts            (Scoring + ranker)
│   ├── explanation.ts        (Explanation generation)
│   └── status-resolver.ts    (Status determination)
└── utils/
    ├── query-normalizer.ts   (Cleanup: abbreviations, punctuation, dedupe synonyms, extract best words)
    └── query-expansion.ts    (Synonym lookup via npm `synonyms`)
```

**Explanation Rules:**
- **If language detected + domain available:** "Matches '<query>'. Your <language> project would benefit from <domain>."
- **If language detected, domain missing:** "Matches '<query>'. Your <language> project would benefit from <skill-name>."
- **If language undetected, domain available:** "Matches '<query>'. <Domain> patterns and best practices."
- **If language undetected, domain missing:** "Matches '<query>'."
- **If low semantic match (0.5–0.65) + high popularity:** "Matches '<query>' (loosely). Widely used skill in this area."

**Query Normalizer (3-stage):**
1. **Cleanup:** Abbreviations (ts→typescript, py→python, go→golang, rb→ruby), punctuation, case normalization
2. **Dedupe:** Remove near-duplicates & synonyms via npm `synonyms` package. If synonyms package unavailable, skip this stage.
3. **Best-fit:** Select top 3-5 terms by (0.7×specificity_score + 0.3×recency), prevents query drift. (Specificity = frequency in skill descriptions; Recency = most recent terms entered by user.)

---

## Pre-Implementation Checklist

**Day 0–1 Blocking Gate (Must pass before Week 1 starts):**
- [ ] **Mastra API benchmark:** Embed 50-skill sample, measure latency (target <30ms/skill; if >30ms, plan async embedding)
- [ ] **npm synonyms validation:** Test on 10 tech queries ('testing', 'debug', 'security', etc.); latency <50ms; covers tech terms adequately
- [ ] **End-to-end latency test:** Query embed + 50-skill cosine similarity + ranking + formatting; measure p95 (target <300ms full, <100ms ranking-only from cache)
- [ ] **Skills-API connectivity:** Fetch full skill index; verify response format matches schema above; measure API latency
- [ ] **Skills-API metadata bounds:** Extract and document observed min/max for installs and stars (used for popularity normalization)

**Setup (after gate passes):**
- [ ] Mastra AI API key + 512-dim embedding model configured
- [ ] Skills-API endpoint verified, auth token configured, backup `skills-registry.json` in repo
- [ ] GitHub API auth token (for fetching lastUpdated, optional if skills-api provides it)
- [ ] npm `synonyms` package added to package.json
- [ ] Directory structure: cli/commands/recommend/, cli/core/, cli/utils/
- [ ] Abbreviation mapping: ts→typescript, py→python, js→javascript, go→golang, rb→ruby, etc.
- [ ] Pre-compute and document popularity normalization bounds from Day 0–1 test data

---

## Timeline

| Week | Tasks | Output |
|------|-------|--------|
| **1** | 1–2 (parallel): Indexer + Repo Detector | Embeddings cached, language detection working |
| **2** | 3–5: Ranker + Explanation + Status | Scoring + explanations functional |
| **3** | 6–7: CLI command + loop | Full command working with iterative refinement |
| **4** | 8–9: Testing + validation | 20+ queries tested, >80% relevance confirmed |
| **5** | Polish | Docs + launch readiness |

## Learning Objectives (Testable in Phase 1)

1. **Mastra API performance** — Can we hit <100ms ranking target? (Validated in Day 0–1: if p95 >120ms, log, but proceed. If >200ms, async embedding planned for Phase 1b.)
2. **512-dim quality** — Is >80% relevance achievable? (Validated week 4: manual eval on 20 queries. If <75%, pivot to 768-dim in Phase 1b.)
3. **Weight tuning (60/30/10 vs. alternatives)** — Test on week 2 eval subset: if semantic+popularity hits 85% but semantic-only hits 82%, semantic+popularity is worth it. If difference <3%, simplify to semantic-only in Phase 1b.
4. **Query normalization effectiveness** — Week 2 test: run base queries without synonym expansion. If top-5 relevance drops >5% vs. with synonyms, synonyms are valuable. Else, remove in Phase 1b.
5. **npm synonyms quality** — Day 0–1 test: verify on tech terms (testing, debug, performance, security, async). If <80% of test synonyms are relevant, use hardcoded map or disable in Phase 1b.
6. **Language detection accuracy** — Week 1 test: sample 10 repos (monorepo, build artifacts, generated code). If accuracy <85%, add exclusion list. Document edge cases for Phase 2.

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Embedding API rate-limited | Batch requests, cache aggressively |
| Embedding quality poor | Early manual eval (week 1); adjust model if needed |
| Performance target missed | Profile early; async embedding if needed |
| Language detection edge cases | Log process; show detected languages to user |
| Malformed skill metadata | Skip gracefully; log warnings |

---

## Design Options & Alternatives

**Reference section:** Alternative approaches considered. Review if Phase 1 results suggest pivoting.

---

### Embedding Dimension Options

| Option | Dims | Speed | Accuracy | Notes |
|--------|------|-------|----------|-------|
| **✓ Chosen: Balanced** | **512** | **~4x faster** | Sufficient | MVP speed/quality tradeoff |
| High Accuracy | 768 | 2.5x faster | Better | If >20% false positives in eval |
| Ultra-High | 1024+ | Baseline | Fine-grained | Phase 2+ |
| Fast Track | 256 | ~8x faster | Lower | Only if <100ms critical |

---

### Language Detection Approaches

| Approach | Method | Accuracy | Complexity | Notes |
|----------|--------|----------|-----------|-------|
| **✓ Chosen: File-based** | Count .ts, .py, .go by extension | ~85% | Low | Simple, fast, graceful fallback |
| AST-based | Parse syntax trees | ~95% | High | Too slow for MVP |
| Git History | Commit diffs by language | ~80% | Medium | Heavyweight |
| Config Files | package.json, go.mod | ~70% | Very Low | Misses multi-config repos |

---

### Ranking Formula Alternatives

| Formula | Semantic | Popularity | Language | Notes |
|---------|----------|-----------|----------|-------|
| **✓ Chosen: Multi-factor** | **60%** | **30%** | **10%** | Balances all signals |
| Semantic-dominant | 90% | 5% | 5% | Ignores trust signals |
| Popularity-first | 40% | 50% | 10% | Risks missing new tools |
| Language-heavy | 50% | 20% | 30% | Ignores semantic quality |
| Semantic + Popularity | 75% | 25% | 0% | Ignores language context |

---

### Normalization Strategy

| Metric | **✓ Chosen** | Alternative 1 | Alternative 2 |
|--------|----------|---|---|
| **Install** | **log₁₀(count+1)** | Linear scale | log (natural) |
| **Stars** | **log₁₀(stars+1)** | Linear scale | No transform |
| **Freshness** | **Linear decay -0.01/day** | Binary (≤30d) | sqrt decay |

**Rationale:** log₁₀ prevents outliers (e.g., Next.js 110k stars) from dominating all results. Handles "1M vs 100K matters less than 10K vs 1K." Both installs and stars normalized independently to [0,1] based on observed distribution.

---

### Popularity Scoring Sub-components

| Component | **✓ Chosen** | Alternative 1 | Alternative 2 |
|-----------|----------|---|---|
| **Install Weight** | **50%** | 60% | 40% |
| **Stars Weight** | **30%** | 40% | 20% |
| **Freshness Weight** | **20%** | 30% | 15% |

---

### Error Handling Strategies

| Scenario | **✓ Chosen** | Alternative 1 | Alternative 2 |
|----------|----------|---|---|
| **Embedding fails** | **Semantic-only** | Retry + backoff | Suggest alt query |
| **No matches** | **"Try: <refinement>"** | Lower threshold (≥0.3) | Suggest popular skills |
| **Lang undetectable** | **Semantic-only, inform user** | Skip silently | High-confidence only |
| **Malformed metadata** | **Skip, log warning** | Attempt repair | Fail loudly |

---

### Caching Strategies

| Strategy | TTL | Implementation | Notes |
|----------|-----|----------|-------|
| **✓ Chosen: File JSON** | **7 days** | `.claude/skill-embeddings.json` | Simple, readable, persistent |
| SQLite | 7 days | Structured DB | More complex |
| In-Memory | Session | Fast only | Lost on restart |
| Hybrid | 7 days | In-memory + file | Background refresh needed |

---

### Semantic Threshold Options

| Threshold | Inclusion | FP Risk | Notes |
|-----------|-----------|---------|-------|
| **✓ Chosen: 0.5** | **~70%** | **Low** | MVP balance |
| 0.6 | ~40% | Very Low | High precision; adjust if >15% FP in top-5 |
| 0.4 | ~85% | Medium | Recall-focused |
| 0.7 | ~20% | Minimal | Ultra-strict |

---

### Query Normalizer Options

| Strategy | Approach | Complexity | Notes |
|----------|----------|-----------|-------|
| **✓ Chosen: Smart Extraction** | Cleanup + Dedup + Best-fit | Medium | Prevents drift, intelligently consolidates |
| Naive Accumulate | Concat all inputs | Low | Simple; full context |
| Fixed-Size Window | Keep last N words | Low | Simple; recent-focused |
| Weighted Accumulate | Weight recent higher | Medium | Harder to predict |
| User-Controlled | User edits query | High | Max control; UI complexity |

**3-stage process:** Cleanup (abbreviations, punctuation) → Dedup (remove synonyms via npm `synonyms`) → Best-fit (select top 3-5 terms by specificity + recency)

---

### Multi-Turn Search Strategy

| Approach | Iterations | Data | Complexity | Notes |
|----------|-----------|------|-----------|-------|
| **✓ Chosen: Query Expansion** | 3 internal (hidden) | npm `synonyms` pkg | Low | Simple, offline, fast |
| Query Decomposition | 3 internal | Keywords + combos | Medium | More structured |
| Collab Filtering | 3 internal | Similar queries | High | Needs query history |

**Chosen:** 3 iterations (base search → expand synonyms → merge + score) + user feedback loop. Show top-5, user refines or exits.

---

### CLI Interaction Loop Options

| Option | Prompts | Feedback | Notes |
|--------|---------|----------|-------|
| **✓ Chosen: Interactive Loop** | **"Next: refine/add/exit"** | User selects | Simple, user control |
| Batch Mode | None | Display only | No refinement |
| Multi-turn Agent | "Why?" → LLM | LLM-driven | Added complexity |
| Guided Wizard | Structured Q&A | Parameter adjust | Opinionated |

---

### Testing Strategy Options

| Strategy | Coverage | Effort | Validation |
|----------|----------|--------|-----------|
| **✓ Chosen: Manual + Unit Tests** | **20+ diverse queries** | **Medium** | Gold standard |
| A/B Testing | User feedback | High | Slow |
| Synthetic Eval | LLM judges | Low | Unreliable |
| Regression Suite | Fixed test set | Low | Catches regressions only |

