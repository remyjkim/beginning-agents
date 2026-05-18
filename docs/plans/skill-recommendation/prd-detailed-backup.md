---
title: Skill Recommendation System - PRD
version: 1.2
date: 2026-05-18
status: Phase 2 In Progress (Mastra Integration & Query Generation Refinement)
---

# Skill Recommendation System - PRD

## Executive Summary

The Skill Recommendation System helps developers discover and add appropriate skills (npm packages, tools, patterns) from the global skills.sh registry (91k+ skills) based on natural language queries. It uses AI-powered query expansion and parallel skill finding to provide fast, relevant recommendations.

**Current Status**: Phase 2 in progress with Mastra-compatible text client integration, context-aware query generation, deterministic fallback behavior, and comprehensive error handling.

---

## Phase 1: MVP ✅ (COMPLETE)

### 1.1 Pipeline

```
Query → [Query Gen: minimax] → 3 queries → [Skill Finder: npx] → top 30 
→ [Aggregator: dedupe] → [Enricher: gpt-3.5] → [CLI display]
```

### 1.2 Components

| Component | File | Model | Latency |
|-----------|------|-------|---------|
| Query Generator | [query-generator.ts](../../cli/commands/recommend/query-generator.ts) | minimax-text-01 | 2-3s |
| Skill Finder | [skill-finder.ts](../../cli/commands/recommend/skill-finder.ts) | npx CLI | 3-5s |
| Aggregator | [skill-aggregator.ts](../../cli/commands/recommend/skill-aggregator.ts) | dedup/sort | <100ms |
| Enricher | [skill-enricher.ts](../../cli/commands/recommend/skill-enricher.ts) | gpt-3.5-turbo | 2-4s |
| Pipeline | [pipeline.ts](../../cli/commands/recommend/pipeline.ts) | orchestrator | 8-12s E2E |
| CLI | [command.ts](../../cli/commands/recommend/command.ts) | interactive | — |

**Query strategy**: 3-angle (library, problem-solution, patterns)

**Features**: Arrow key navigation, summaries, loading spinner, ANSI colors

**Dependencies**: OpenRouter API (minimax, gpt-3.5), npx skills CLI

---

## Phase 2: Context-Aware Query Generation with Mastra Integration (🚀 IN PROGRESS)

### 2.0 Overview

**Goal**: Enhance Query Generator to understand project context, avoiding duplicate recommendations and improving relevance. Migrate to Mastra-compatible text client for flexibility and future extensibility.

**Key Achievements**:
1. ✅ Refactored codebase from `src/skill-recommendation/` → `cli/commands/recommend/`
2. ✅ Implemented Mastra-compatible `MastraTextClient` interface
3. ✅ Query Generator now supports:
   - Queries with full project context
   - Queries without user input (context-only mode)
   - Deterministic fallback behavior (no API dependency)
   - Error recovery with graceful degradation
4. 🔄 Context extraction pipeline (partial - structured, not yet fully wired)
5. 🔄 End-to-end testing scenarios (in progress)

**Key Refinements**:
- Query Generator no longer depends on OpenRouter directly; uses injectable Mastra client
- Fallback queries are deterministic and follow same 3-angle strategy
- System prompt emphasizes avoiding duplicate recommendations
- Response parsing is resilient to multiple formats (JSON array, fenced, objects with `queries` key)

---

### 2.1 Mastra Integration Architecture

**The New Pattern: Dependency Injection**

```typescript
interface MastraTextClient {
  generateText({
    system: string;
    prompt: string;
    model: string;
    temperature: number;
    timeoutMs: number;
  }): Promise<string>;
}
```

**Benefits**:
- Swap implementations (OpenRouter → Claude API → local model) without rewriting generator
- Testable without external API calls
- Future: Mastra routing, model switching, cost optimization

**Current Config**:
```typescript
DEFAULT_MASTRA_QUERY_CONFIG = {
  model: "minimax/minimax-text-01",
  temperature: 0.2,
  maxQueries: 3,
  timeoutMs: 5_000,
}
```

---

### 2.2 Context Extraction Pipeline (PLANNED)

**Planned Context Extractors** (6 total, all local file extraction, no APIs):

| Extractor | Status | Input | Output |
|-----------|--------|-------|--------|
| README Parser | 🔄 Structured | `README.md` | Summary (title, description, tech stack) |
| Language Detector | 🔄 Structured | Directory structure | Language breakdown (GitHub-style %) |
| Runtime Environment Detector | 🔄 Structured | Config files (package.json, etc.) | Detected runtimes + package managers |
| Framework Detector | 🔄 Structured | `package.json` or equivalent | Detected frameworks (React, Vue, etc.) |
| Dependency Parser | 🔄 Structured | Config files | List of installed packages (for dedup) |
| Session Log Extractor | 🔄 Planned | `~/.claude/logs/` | Recent work themes (2-5 items) |

**Target Context Type**:
```typescript
interface ProjectContext {
  readmeSummary: string;
  languages: Record<string, number>;        // e.g. { "TypeScript": 75 }
  frameworks: string[];                      // e.g. ["React", "Next.js"]
  runtimes: {
    runtimes: string[];                      // e.g. ["Node.js", "Bun"]
    packageManagers: string[];               // e.g. ["bun", "npm"]
  };
  existingPackages: string[];                // e.g. ["react", "jest"]
  recentSessionThemes: string[];             // e.g. ["React testing", "CLI scripting"]
}
```

**Target Latency**: ~300ms (parallel execution; longest extractor dominates)

---

### 2.3 Query Generator Implementation

**Input**: User query (optional) + Project context (optional)

**System Prompt** (3 core principles):
```
You are the Query Generator block in a skill recommendation pipeline.
Generate EXACTLY 3 concise search queries for the user's skill discovery request.
Return JSON only: an array of 3 strings.

Each query must explore a distinct search strategy:
1. Library or package names
2. Problem-solution wording
3. Pattern, framework, or use cases

IMPORTANT: NEVER recommend packages already in the project.
IMPORTANT: Consider recent work themes when they clarify the user's intent.
Keep each query under 12 words, no explanations, exactly 3 queries total.
```

**Query Builder** (context-aware formatting):
```
If user query provided:
  "User query: {originalQuery}"
  [project context details]

If no user query but context available:
  "No specific user query provided. Generate skill recommendations based on project context only."
  [project context details]

If neither query nor context:
  Return deterministic fallback queries
```

**Fallback Behavior** (no API required):
```typescript
function fallbackQueries(query: string): string[] {
  const normalized = normalizeQuery(query) || "skill discovery";
  return [
    `${normalized} library package`,
    `${normalized} problem solution`,
    `${normalized} workflow pattern`,
  ];
}
```

**Response Parsing** (resilient):
- Try JSON array: `["query1", "query2", "query3"]`
- Try fenced JSON: ` ```json [...] ``` `
- Try object with `queries` key: `{ "queries": [...] }`
- Fall back to deterministic queries if all fail

**Files**: 
- [cli/commands/recommend/query-generator.ts](../../cli/commands/recommend/query-generator.ts) (main implementation)
- [cli/commands/recommend/prompts.ts](../../cli/commands/recommend/prompts.ts) (prompts + config)

---

### 2.4 CLI Integration & Planned Flow

**Target Command**:
```bash
# Recommend skills with full project context (automatic)
bun run cli/commands/recommend/command.ts recommend "testing utilities"

# Explicit repo path
bun run cli/commands/recommend/command.ts --repo /path/to/project --query "testing"
```

**Planned End-to-End Flow** (with full context extraction):
```
User Query + Repo Path
    ↓
[Context Extraction] (parallel, ~300ms target)
  ├→ README Parser
  ├→ Language Detector
  ├→ Framework Detector
  ├→ Runtime Detector
  ├→ Dependency Parser
  └→ Session Log Extractor
    ↓
[Query Generator] → 3 context-aware queries (Mastra client)
    ↓
[Skill Finder] → Find skills (parallel, 5 per query)
    ↓
[Skill Aggregator] → Deduplicate + rank
    ↓
[Filter] → Remove already-installed packages
    ↓
[Skill Enricher] → Generate summaries (Mastra client)
    ↓
[CLI Display] → Show top 5 with summaries
```

**Current Status**:
- ✅ Query Generator (with Mastra client + fallback)
- 🔄 Context extraction (structured, not yet integrated)
- 🔄 Skill Finder (implementation exists, integration pending)
- 🔄 Skill Aggregator (implementation exists, integration pending)
- ⏭️ Skill Enricher (implementation exists, Mastra migration pending)
- ⏭️ CLI Integration (pending)

**Latency Breakdown** (target):
- Context extraction: ~300ms (parallel local I/O)
- Query generation: ~2-3s (API call or fallback)
- Skill finding: ~3-5s (parallel `npx skills find` calls)
- Skill enrichment: ~2-4s (parallel summary generation)
- **Total**: ~8-15s

**File**: `cli/commands/recommend/command.ts`

---

### 2.5 Phase 2 Completion Roadmap

**Completed ✅**:
1. Query Generator with Mastra client interface
2. Fallback query strategy (deterministic, no API)
3. Response parsing (resilient to multiple formats)
4. Context type definition
5. System prompt refinement

**In Progress 🔄**:
1. Context extractors (structured, need integration)
2. End-to-end pipeline assembly
3. Test coverage for all scenarios

**Pending ⏭️**:
1. Integration of context extraction into query pipeline
2. Skill Enricher migration to Mastra client
3. Full CLI integration (`cli/commands/recommend/command.ts`)
4. End-to-end testing (with/without query, with context)
5. Latency benchmarking

**To Unblock Phase 2 Completion** (priority order):
| Task | Owner | Estimate | Blocker |
|------|-------|----------|---------|
| Integrate context extractors into query pipeline | - | 2h | No |
| Wire Skill Enricher to Mastra client | - | 1h | No |
| CLI command integration | - | 2h | No |
| E2E test execution (all scenarios) | - | 1h | No |
| Performance validation | - | 1h | No |

---

### 2.6 Phase 1 vs Phase 2 Comparison

| Aspect | Phase 1 | Phase 2 (Current) |
|--------|---------|---------|
| Query Input | User prompt only | User prompt + project context (optional) |
| Query Generator | Direct OpenRouter API | Mastra-compatible client + fallback |
| Context Awareness | None | Planned: 6 context extractors |
| Duplicate Filtering | Implicit | Explicit (existing packages list) |
| Error Handling | Basic try-catch | Deterministic fallback queries |
| Latency | 7-10s | 8-15s target (with context) |
| Accuracy | ~84% precision | Target: >90% precision |
| Architecture | Monolithic pipeline | Modular blocks (injectable clients) |

### 2.7 Authentication System Scoping

**Goal**: Add user authentication and session management to enable per-user recommendations, history, and personalized feedback.

**Requirements**:

| Requirement | Description | Priority |
|-------------|-------------|----------|
| User Registration | Email/password signup with validation | Must |
| User Login | Session-based authentication (JWT/cookie) | Must |
| Session Management | Persistent sessions across requests | Must |
| API Key Generation | Users can generate API keys for CLI access | Should |
| User Preferences | Store model preferences, context extraction flags | Should |
| History Tracking | Save user searches, selected skills, feedback | Should |
| Rate Limiting | Per-user API call quotas (prevent abuse) | Should |
| Social Auth | OAuth (GitHub/Google) optional integration | Could |

**Resource Estimation**:

| Component | Estimate | Notes |
|-----------|----------|-------|
| Auth middleware (Express) | 4h | JWT + session validation |
| Database schema (users, sessions) | 2h | SQLite migrations |
| Registration flow | 3h | Email validation, password hashing |
| Login flow | 2h | Session creation, refresh tokens |
| API key management | 3h | Generation, revocation, rate limiting |
| CLI integration (auth) | 2h | Store credentials, auto-refresh |
| User preferences storage | 2h | Settings schema, CRUD endpoints |
| Search history storage | 2h | Logs schema, query tracking |
| Rate limiting enforcement | 3h | Per-user quotas, graceful fallback |
| **Total** | **~24h** | Estimated for all components |

**Architecture**:
```
CLI / Web UI
    ↓
[Auth Middleware] → Validate JWT/API key
    ↓
[Skill Recommendation Pipeline] (same as Phase 2)
    ↓
[User Context Service] → Fetch preferences, history
    ↓
[Rate Limiter] → Check quotas
    ↓
Response + log to user history
```

**Deferred to Phase 4**: Social auth, advanced analytics, dashboard

---

## Phase 2-2: Testing & Evaluation (📊 PLANNED)

**Goal**: Validate query generation quality across diverse file types and document contexts. Establish baseline metrics before Phase 3.

### 2-2.1 Prompt Variation Testing

**Test 3 prompt variants** on the same queries:

| Variant | Description | Focus | Target Accuracy |
|---------|-------------|-------|-----------------|
| **Current** | 3-angle strategy (library, problem, pattern) | Breadth | >84% |
| **Concise** | 2-angle (library, problem) | Speed | >80% |
| **Detailed** | 4-angle (library, problem, pattern, framework) | Coverage | >88% |

**Test Queries** (5 diverse queries):
```
1. "react testing"              (common library)
2. "performance optimization"   (abstract problem)
3. "CLI tool building"          (framework pattern)
4. "database migration"         (domain-specific)
5. "accessibility testing"      (standards-based)
```

**Evaluation Metrics**:
- Query relevance (1-5 scale, human review)
- Coverage (# unique relevant skills returned)
- Precision (% of top 5 that match user intent)
- Latency (time to generate 3 queries)

**Success Criteria**:
- Current variant achieves >84% precision
- Detailed variant achieves >88% (worth extra latency?)
- Concise variant achieves >80% (acceptable speed tradeoff?)

**Deliverable**: `test/prompt-variation-evaluation.test.ts`

---

### 2-2.2 File Type & Context Evaluation

**Evaluate query generation on 3 real project types**:

#### Research Project Context
```
README: "Machine learning model evaluation framework"
Languages: Python 75%, Jupyter 25%
Frameworks: PyTorch, scikit-learn
Existing: torch, numpy, pandas, matplotlib
Recent themes: ["model evaluation", "metrics computation"]
```

**Test Queries**:
- "testing ML models"
- "metrics library"
- "experiment tracking"

**Expected**: Avoid torch/numpy/pandas, suggest MLflow, pytest-cov, wandb

#### Development Project Context
```
README: "TypeScript CLI tool for managing AWS resources"
Languages: TypeScript 80%, JavaScript 20%
Frameworks: Node.js, Express (API)
Existing: typescript, jest, aws-sdk, dotenv
Recent themes: ["CLI interface", "error handling", "AWS integration"]
```

**Test Queries**:
- "CLI building"
- "error handling"
- "AWS utilities"

**Expected**: Avoid typescript/jest/aws-sdk, suggest yargs, inquirer, ora

#### Documentation Project Context
```
README: "Open source book on system design patterns"
Languages: Markdown 60%, TypeScript 30%, Python 10%
Frameworks: None (docs-only)
Existing: none
Recent themes: ["documentation", "code examples"]
```

**Test Queries**:
- "documentation tools"
- "code highlighting"
- "site generation"

**Expected**: Suggest docusaurus, sphinx, mkdocs, prism

**Deliverable**: `test/context-file-types-evaluation.test.ts`

---

### 2-2.3 README Documentation Extraction

**Test context extraction from various README formats**:

| README Type | Test File | Focus |
|-------------|-----------|-------|
| Minimal | `test/fixtures/readme-minimal.md` | Title + 1 sentence |
| Structured | `test/fixtures/readme-structured.md` | Features, setup, tech stack |
| Complex | `test/fixtures/readme-complex.md` | Multiple sections, badges, links |
| Non-English | `test/fixtures/readme-spanish.md` | Language detection (skip non-EN?) |

**Test Cases**:
1. Extract title correctly
2. Extract first paragraph (no formatting)
3. Identify tech stack from README
4. Handle missing README gracefully
5. Cache results (don't re-extract)

**Deliverable**: `test/readme-extraction-evaluation.test.ts`

---

### 2-2.4 Context-Aware Relevance Metrics

**Measure if context actually improves results**:

| Scenario | Baseline (no context) | With Context | Improvement |
|----------|---------------------|--------------|------------|
| Query: "testing" (React project) | 84% precision | 91% precision | +7% |
| Query: "testing" (Python project) | 84% precision | 89% precision | +5% |
| No query (TypeScript project) | 78% precision | 86% precision | +8% |

**Test Method**:
1. Generate queries without context
2. Generate same queries WITH context
3. Compare top-5 results (manual relevance scoring)
4. Calculate improvement percentage

**Success Criteria**:
- Context improves precision by 3-10%
- No regression (context helps, never hurts)
- Fallback behavior maintains baseline (84%)

**Deliverable**: `test/context-improvement-evaluation.test.ts`

---

### 2-2.5 Test Execution & Reporting

**Run all evaluations** and generate report:

```bash
# Run all Phase 2-2 tests
bun run test/prompt-variation-evaluation.test.ts
bun run test/context-file-types-evaluation.test.ts
bun run test/readme-extraction-evaluation.test.ts
bun run test/context-improvement-evaluation.test.ts

# Generate summary report
bun run scripts/phase2-2-evaluation-report.ts
```

**Output**:
```
# Phase 2-2 Evaluation Report (2026-05-XX)

## Prompt Variant Results
- Current (3-angle): 85.2% precision ✓
- Detailed (4-angle): 87.6% precision (recommend for Phase 3)
- Concise (2-angle): 79.8% precision (acceptable fallback)

## Context File Type Results
- Research (ML): 89% precision (+5%)
- Development (CLI): 92% precision (+8%)
- Documentation: 86% precision (+2%)

## README Extraction Accuracy
- Title extraction: 100%
- Tech stack detection: 94%
- Missing README handling: ✓

## Context-Aware Improvement
- Average improvement: +6.7%
- Consistent across all 3 project types
- Baseline maintained when context unavailable

## Recommendations
1. Adopt "detailed" prompt variant (87.6% > 85.2%)
2. Prioritize context extraction (6-8% improvement)
3. Improve tech stack detection (94% → 98%)
4. Add framework-specific patterns (specialized queries)

Status: Ready for Phase 3 (Optimization & Caching)
```

**Deliverable**: `docs/plans/skill-recommendation/phase2-2-evaluation-report.md`

---

## Phase 3: Optimization & Features (PLANNED - moved from Phase 2)

### 3.1 Generalized 3-Block Pipeline

**Current State (Phase 1)**: Direct pipeline with fixed components
**Goal (Phase 3)**: Generalizable, extensible architecture for future improvements

**The 3-Block Design**:

```
User Query
    ↓
[Block 1: Query Generator]  ← AI expands query with multiple strategies
    ↓ (multiple refined queries)
[Block 2: Skill Finder]     ← npx skills find gets top 5 per query
    ↓ (all matching skills + scores)
[Block 3: Reranker]         ← AI ranks to top 5
    ↓
Recommended Skills
```

**Block 1: Query Generator**
- **Input:** Original user query + context (languages, repo info)
- **Current Tool:** minimax-text-01 via OpenRouter
- **Output:** 3 refined queries exploring different search angles
- **Example:** "react testing" → ["react-testing-library", "testing React components", "component test patterns"]
- **Future:** Swap to Claude or Mastra for different strategies

**Block 2: Skill Finder**
- **Input:** Refined queries from Block 1
- **Tool:** `npx skills find [query]` (returns top 5 per query)
- **Output:** Aggregated skill list with relevance scores (~25 unique skills)
- **Future:** Replace with embedding-based search if CLI becomes bottleneck

**Block 3: Reranker**
- **Input:** Aggregated skills + original query
- **Tool:** Options: minimax, Cohere AI (free), or cross-encoder
- **Output:** Top 5 re-ranked skills
- **Fallback:** Keyword match + alphabetical sort if any block fails
- **Future:** Use custom ML model or user feedback signals

**Why This Approach**:
| Aspect | Benefit |
|--------|---------|
| **Generalizable** | Easy to swap components (Query Gen, Skill Finder, Reranker) |
| **Exploratory** | Try different query strategies without rewriting the pipeline |
| **Defensible** | Each block has clear input/output; testable independently |
| **Scalable** | Works with any query length/complexity |
| **Cheap** | Reranking is optional; can use free APIs (Cohere) |

**Files to Create**:
- `cli/commands/recommend/skill-reranker.ts` — Reranks top 30 → top 5

---

### 3.2 Caching Layer

**Goal**: Reduce latency for repeated queries by 80%+

**Implementation**:
- Cache query refinements by hash of original query
- Cache skill search results by refined query
- TTL-based expiration (1 hour default)
- Storage: Local file-based (`.skillcache/`)

**Expected Impact**:
- Repeated searches: <1 second
- New queries after cache: ~3 seconds
- Cache hit rate target: 60%+

**Files to Create**:
- `cli/commands/recommend/query-cache.ts`
- `cli/commands/recommend/skill-cache.ts`

---

### 3.3 Rate Limiting & Quotas

**Goal**: Prevent API abuse and manage costs

**Features**:
- Per-user rate limits (requests/hour)
- Per-IP rate limits
- Cost tracking (minimax vs gpt-3.5-turbo budgets)
- Graceful degradation when rate-limited

**Files to Create**:
- `cli/commands/recommend/rate-limiter.ts`

---

### 3.4 Web UI (Phase 3B)

**Goal**: Provide browser-based interface with better UX

**Features**:
- Real-time search results
- Interactive skill cards with links to skills.sh
- One-click skill addition (backend integration)
- Search history & saved skills
- Responsive design

**Stack**:
- Frontend: React (or similar)
- Backend: Express/Node.js
- Database: SQLite (user preferences, history)

**Architecture**:
```
Browser → Express Server → Skill Recommendation Pipeline
                       ↓
                   SQLite (history, saves)
```

---

### 3.5 Feedback Loop & Learning

**Goal**: Improve recommendations over time based on user feedback

**Metrics to Track**:
- Which skills users actually add
- Skill ratings (1-5 stars)
- Query-to-skill relevance feedback

**Learning Approach**:
- Weight popular skills higher in ranking
- Identify successful query → skill patterns
- Use feedback to retrain reranker weights

**Files to Create**:
- `cli/commands/recommend/feedback-collector.ts`
- `cli/commands/recommend/feedback-analytics.ts`

---

## Phase 4: Integration & Distribution (FUTURE)

### 4.1 IDE Extensions
- VS Code extension for inline skill discovery
- JetBrains IDE plugin

### 4.2 CLI Tool Distribution
- Publish to npm as `@bgng/skill-finder`
- Standalone `bgng` CLI tool with skill command

### 4.3 API Service
- REST API for skill recommendations
- GraphQL endpoint option
- Rate-limited public access tier

### 4.4 Analytics
- Track popular queries and skills
- Identify skill discovery patterns
- Public dashboard with trending skills

---

## Current Implementation Details

### Query Expansion Strategy

The system generates 3 search angles per user query:

**Example: "React testing"**
```
1. react-testing-library package      (Library names angle)
2. testing React components approach  (Problem-solution angle)
3. component testing patterns React   (Pattern/use-case angle)
```

With **no query** (context-only mode):
```
1. Recommended testing tools          (Generic library angle)
2. Unit test pattern solutions        (Problem-solution angle)
3. Component testing workflow patterns (Pattern/use-case angle)
```

These queries explore different semantic angles to maximize skill discovery breadth.

### Fallback Behavior (No API Required)

When client unavailable or API fails:
```typescript
// Deterministic fallback follows same 3-angle strategy
function fallbackQueries(query: string): string[] {
  const normalized = normalizeQuery(query) || "skill discovery";
  return [
    `${normalized} library package`,           // Library names
    `${normalized} problem solution`,          // Problem-solution
    `${normalized} workflow pattern`,          // Pattern/use-case
  ];
}
```

**Advantage**: System works offline, in tests, without credentials.

### Mastra Client Interface

```typescript
interface MastraTextClient {
  generateText({
    system: string;           // System prompt
    prompt: string;           // User prompt + context
    model: string;            // e.g., "minimax/minimax-text-01"
    temperature: number;      // e.g., 0.2
    timeoutMs: number;        // e.g., 5000
  }): Promise<string>;
}
```

**Implementations** (current + future):
- ✅ OpenRouter adapter (minimax, gpt-3.5-turbo, etc.)
- 🔄 Claude API adapter (planned)
- ⏭️ Mastra framework integration (extensible)

### Summary Generation (Mastra-Compatible)

```
Generate a comprehensive 3-5 sentence summary of what the "[skill name]" 
package/skill does, its main purpose, and typical use cases.

Return ONLY the summary sentences, no additional text or formatting.
```

**Current Config**: gpt-3.5-turbo (cost-effective, similar quality to Claude)
**Temperature**: 0.2 (deterministic, focused)
**Migration Path**: Swap `model` config without changing implementation

---

## Cost Analysis

### Pipeline API Calls

```
User Query
    ↓
[1] Query Generator (LLM API)
    ├─ Model: minimax-text-01 (OpenRouter)
    ├─ Tokens: ~250 input, ~80 output (3 queries)
    ├─ Cost: ~$0.000025 per call
    ↓
[2] Skill Finder (LOCAL - NO COST)
    ├─ Command: npx skills find
    ├─ Cost: FREE
    ↓
[3] Skill Enricher (LLM API)
    ├─ Model: gpt-3.5-turbo (OpenRouter)
    ├─ Called: 5 times (top 5 skills)
    ├─ Tokens per call: ~80 input, ~120 output
    ├─ Cost: ~$0.00022 × 5 = $0.0011 total
    ↓
Output
```

### Current OpenRouter Pricing (2026-05-18)

| Model | Input | Output | Use Case |
|-------|-------|--------|----------|
| **minimax-text-01** | $0.00005/1K | $0.00015/1K | Query generation (cheap, fast) |
| **gpt-3.5-turbo** | $0.00050/1K | $0.00150/1K | Skill enrichment (quality > cost) |

### Cost Per Search

| Component | Tokens | Cost |
|-----------|--------|------|
| Query Gen (minimax) | ~330 | $0.000025 |
| Skill Finder (npx) | - | FREE |
| Skill Enrichment (gpt-3.5 × 5) | ~1,000 | $0.001100 |
| **TOTAL** | **~1,330** | **$0.001125** |

### Monthly Cost Scenarios

| Scenario | Users | Searches/Month | Monthly Cost | Annual Cost |
|----------|-------|----------------|--------------|-------------|
| **Light** | 100 | 500 | $0.56 | $6.72 |
| **Medium** | 1,000 | 10,000 | $11.20 | $134.40 |
| **Heavy** | 10,000 | 200,000 | $224 | $2,688 |
| **Production** | 1M | 5,000,000 | $5,600 | $67,200 |

**Scaling**: Cost scales linearly with searches, not users. No per-user licensing fees.

### Cost Optimization (Roadmap)

| Phase | Strategy | Cost Reduction | Trade-off |
|-------|----------|----------------|-----------|
| **2** | Current (minimax + gpt-3.5) | Baseline | High quality |
| **3** | Add query caching (60% hits) | 60% ↓ | Repeats faster |
| **3** | Reranker (free Cohere) | 50% ↓ | Less enrichment detail |
| **4** | Swap gpt-3.5 → minimax for enrichment | 70% ↓ | Slightly lower quality |
| **4** | Model routing (cheapest available) | 75% ↓ | Provider flexibility |

**Best Case** (Phase 4 optimized): $0.00028 per search ($2.80/10k searches)
**Current** (Phase 2): $0.001125 per search ($11.25/10k searches)

---

## Success Metrics

### Phase 1 (MVP) ✅ COMPLETE
- [x] E2E pipeline latency < 15 seconds
- [x] Skill finder completion rate > 95%
- [x] User can add skill in < 2 minutes
- [x] CLI arrow navigation smooth (no jank)
- [x] Error handling graceful (fallbacks work)

### Phase 2 (Context-Aware & Mastra Integration) 🚀 IN PROGRESS
- [x] Query Generator supports Mastra-compatible client interface
- [x] Deterministic fallback queries (no API dependency)
- [x] Response parsing resilient (multiple formats supported)
- [x] Context type structure defined (6 extractors planned)
- [ ] Context extraction latency < 300ms (pending integration)
- [ ] Duplicate filtering accuracy > 95% (pending integration)
- [ ] Top 5 relevance improves to >90% precision (pending integration)
- [ ] E2E latency remains < 15 seconds (with context)
- [ ] Language & runtime detection accuracy > 90%
- [ ] Filter removes 80%+ of false positives from Phase 1
- [ ] All test scenarios pass (query gen, no-query, with context)
- [ ] Authentication system requirements documented (~24h estimate)

### Phase 2-2 (Testing & Evaluation) 📊 PLANNED
- [ ] Prompt variant comparison (3 variants, 5 queries each)
- [ ] Current prompt achieves >84% precision
- [ ] Detailed prompt achieves >88% precision
- [ ] Concise prompt achieves >80% precision
- [ ] File type evaluation (research, development, documentation projects)
- [ ] Context improves precision by 3-10% across all file types
- [ ] README extraction accuracy > 95%
- [ ] Baseline latency maintained (no regression)
- [ ] Phase 2-2 evaluation report generated

### Phase 3 (Optimization) ⏭️ PLANNED
- [ ] Query cache hit rate > 60%
- [ ] Reranker improves top-5 relevance by 20%+
- [ ] Latency with cache < 5 seconds
- [ ] Rate limiting prevents >10 req/min per user

### Phase 4 (Integration) ⏭️ FUTURE
- [ ] IDE extension installed by >1k developers
- [ ] API service handles >100 req/sec
- [ ] Public dashboard shows 10k+ monthly searches

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **CLI** | TypeScript + Bun runtime | Refactored to `cli/commands/recommend/` |
| **Client Interface** | Mastra-compatible (injectable) | Enables OpenRouter, Claude API, future swaps |
| **LLM APIs** | OpenRouter adapter (minimax, gpt-3.5-turbo) | Current; Claude API adapter planned |
| **Skill Finding** | skills.sh CLI (npx) | Wrapped in skill-finder.ts |
| **Logging** | Structured JSON (JSONL) | Centralized in logger.ts |
| **Caching** | File-based (Phase 3) | Deferred; will implement in Phase 3 |
| **Web UI** | React + Express (Phase 3B) | Deferred; low priority |
| **Database** | SQLite (Phase 3B) | Deferred; low priority |

---

## Known Limitations & Trade-offs

### Current (Phase 2)

| Limitation | Impact | Reason | Future Solution |
|-----------|--------|--------|-----------------|
| Context extractors not integrated | Latency ~300ms added, accuracy pending | In-progress work | Complete integration |
| No semantic reranking | Top 5 relevance ~84% (same as Phase 1) | Not yet implemented | Reranker block (Phase 3) |
| No caching | Every search hits API | Deferred for simplicity | File-based cache (Phase 3) |
| CLI only | Limited accessibility | Fast MVP design | Web UI (Phase 3B) |
| No user history | Cannot learn from feedback | Stateless design | SQLite DB (Phase 3B) |
| Mastra client injectable but limited implementations | Only OpenRouter supported | Just started migration | Add Claude API adapter |

### Design Decisions (Phase 2)

1. **Mastra-compatible interface**: Future-proof, testable, swappable LLM providers
2. **Fallback queries**: Deterministic behavior when API unavailable or fails
3. **Resilient response parsing**: Handles multiple JSON formats, graceful degradation
4. **Context extraction as optional**: Works with or without context (backward compatible)
5. **Postpone caching**: Phase 3, not blocking core functionality
6. **Postpone reranking**: Phase 3, fallback behavior acceptable for now

### Lessons Learned (from recent work)

1. **Dependency injection improves testability**: Query Generator now testable without API mocks
2. **Fallback strategies matter**: System works fully offline with deterministic queries
3. **Response parsing robustness**: Must handle AI output variability gracefully
4. **Structured extractors help**: Even though not integrated, having them structured makes integration easier
5. **Incremental refactoring works**: Moving from direct API → Mastra client was manageable

---

## Implementation Phases Summary

| # | Phase | Status | Focus | Est. Duration | Key Deliverables |
|---|-------|--------|-------|----------------|------------------|
| 1 | MVP | ✅ Complete | Query expansion + skill finding | 2w | CLI, pipeline, basic summaries |
| 2 | Context-Aware & Mastra | 🚀 In Progress (60%) | Context extraction, client interface | 1.5w | Mastra integration, context types, auth scoping |
| 2-2 | Testing & Evaluation | 📊 Planned | Prompt optimization, file type validation | 1w | Evaluation report, metrics, recommendations |
| 3 | Optimization & Features | ⏭️ Planned | Caching, reranking, rate limiting | 2w | Query cache, reranker, quotas |
| 3B | Authentication System | ⏭️ Planned | User auth, history, preferences | 1w | User DB, auth middleware, API keys |
| 3C | Web UI | ⏭️ Future | Browser interface, history, search | 1.5w | React frontend, Express backend |
| 4 | Integration & Distribution | ⏭️ Future | IDE extensions, API service, analytics | 3w | VS Code ext, REST API, dashboard |

**Total Estimated Effort**: ~12-14 weeks across all phases

---

## File Structure

```
cli/commands/recommend/
├── types.ts                              # Shared interfaces (MastraTextClient, ProjectContext, etc.)
├── prompts.ts                            # System prompts & configs (Mastra-compatible)
├── query-generator.ts                    # Query generation with context support
├── skill-finder.ts                       # Wraps `npx skills find`
├── skill-aggregator.ts                   # Deduplicates & ranks
├── skill-enricher.ts                     # Generates summaries
├── openrouter-client.ts                  # OpenRouter Mastra client adapter
├── pipeline.ts                           # Orchestrates all blocks
├── logger.ts                             # Structured logging
├── command.ts                            # CLI command entry point
└── index.ts                              # Exports public API

cli/commands/recommend/extractors/        # Phase 2: Context extraction (PLANNED)
├── readme-parser.ts                      # Extracts README summary
├── language-detector.ts                  # Detects language breakdown
├── framework-detector.ts                 # Detects frameworks (React, Vue, etc.)
├── runtime-detector.ts                   # Detects runtime (Node.js, Python, etc.)
├── dependency-parser.ts                  # Parses existing packages
└── session-log-extractor.ts              # Extracts recent work themes

cli/index.ts                              # CLI entry point

docs/plans/skill-recommendation/
├── prd.md                                # This file (requirements, phases, roadmap)
├── diagrams.md                           # Data flow & architecture diagrams
├── PRODUCTION_SETUP.md                   # Setup & deployment guide
└── phase1-results-may13.md               # Phase 1 evaluation results

test/
├── context-extractors.test.ts                    # Test context extraction (PLANNED)
├── pipeline-evaluation.test.ts                   # Test full pipeline
├── query-generator-evaluation.test.ts            # Test query generation
├── skill-finder-evaluation.test.ts               # Test skill finding
├── prompt-variation-evaluation.test.ts           # Phase 2-2: Prompt variants (3 angles, concise, detailed)
├── context-file-types-evaluation.test.ts        # Phase 2-2: Research/dev/docs projects
├── readme-extraction-evaluation.test.ts         # Phase 2-2: README parsing quality
├── context-improvement-evaluation.test.ts       # Phase 2-2: Measure context benefit (+3-10%)
└── fixtures/                                     # Test data for Phase 2-2
    ├── readme-minimal.md
    ├── readme-structured.md
    ├── readme-complex.md
    └── readme-spanish.md
```

**Recent Refactoring** (2026-05-17 to 2026-05-18):
- Moved from `src/skill-recommendation/` → [cli/commands/recommend/](../../cli/commands/recommend/)
- Introduced Mastra-compatible `MastraTextClient` interface
- Query Generator now injectable and testable without API calls
- Fallback queries provide deterministic behavior

---

## Status Summary (2026-05-18)

### Phase 2 Progress: ~60% Complete

**Done ✅**:
- Query Generator refactored to Mastra-compatible client
- Fallback behavior implemented (deterministic, no API)
- Response parsing robustness improved
- Context type structure finalized
- System prompt fine-tuned for 3-angle strategy
- Authentication system requirements scoped (~24h estimate)

**Blockers 🚧**:
- Context extractors exist but not integrated into pipeline
- Skill Enricher still uses direct OpenRouter (needs Mastra adapter)
- CLI command not fully wired to new architecture
- End-to-end tests not comprehensive (missing context scenarios)

**Next Session Focus** (priority order):
1. **Integrate context extraction**: Wire extractors into query pipeline (~2h)
2. **Test thoroughly**: Run all 3 scenarios (query, no-query, with context)
3. **Skill Enricher migration**: Adapt to Mastra client interface (~1h)
4. **CLI wiring**: Connect command.ts to full pipeline (~2h)
5. **Performance validation**: Ensure latency < 15s E2E

**Phase 2-2 Planning** (post-Phase 2):
- Prompt variant testing (identify optimal prompt)
- File type evaluation (research, dev, docs projects)
- Context improvement measurement (3-10% baseline improvement)
- README extraction validation
- Evaluation report generation

**Target Completion**: 
- Phase 2 done by end of next session (estimate 6-8h work)
- Phase 2-2 evaluation during/after Phase 3 planning (~8h work)

---

## How to Run Current Implementation

### Testing Query Generator (Mastra Integration)

**Setup**:
```bash
# Ensure dependencies installed
bun install

# Optional: Set OpenRouter key (for LLM-powered queries)
export OPENROUTER_API_KEY=sk-or-v1-...
```

**Test Scenarios** (existing test files):
```bash
# Test 1: Query with fallback (no client)
bun run test-query-gen.ts

# Test 2: Query with context (no client, fallback behavior)
bun run test-query-gen-llm.ts

# Test 3: Query with no input (context-only mode)
bun run test-query-gen-llm-no-query.ts
```

**Expected Outputs**:
```
Test 1: Fallback queries for "test development"
  ✓ "test development library package"
  ✓ "test development problem solution"
  ✓ "test development workflow pattern"

Test 2: Context-aware queries (with LLM)
  ✓ Query generated from context (TypeScript, CLI project)
  ✓ Existing packages avoided (typescript)

Test 3: No query, context-only
  ✓ "skill discovery library package"
  ✓ "skill discovery problem solution"
  ✓ "skill discovery workflow pattern"
```

### Running Full CLI (When Phase 2 Complete)

**Planned** (not yet integrated):
```bash
# After context integration and CLI wiring
bun run cli/commands/recommend/command.ts recommend "testing utilities"

# With explicit repo path
bun run cli/commands/recommend/command.ts --repo /path/to/project --query "testing"
```

### Running All Tests

```bash
# Full test suite (once integrated)
bun test

# Individual test files
bun run test/pipeline-evaluation.test.ts
bun run test/query-generator-evaluation.test.ts
bun run test/skill-finder-evaluation.test.ts
bun run test/context-extractors.test.ts    # Planned
```

---

## References

- Phase 1 Results: [phase1-results-may13.md](./phase1-results-may13.md)
- Production Setup: [PRODUCTION_SETUP.md](./PRODUCTION_SETUP.md)
- Global Skills Registry: https://skills.sh (91k+ skills)
- OpenRouter Docs: https://openrouter.ai/docs
