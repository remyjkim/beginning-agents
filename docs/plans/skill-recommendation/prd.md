---
title: Skill Recommendation System - PRD (Compact)
version: 1.4
date: 2026-05-18
status: Phase 2 In Progress (75% - Skills Detector Complete)
---

# Skill Recommendation System - PRD

**Goal**: Help developers discover relevant skills from 91k+ registry based on natural language queries using AI-powered expansion and parallel search.

**Status**: Phase 2 in progress. Query Generator refactored to Mastra client (testable, injectable, no API dependency). Context extraction structured but not yet integrated.

---

## Quick Reference

### Pipeline Overview
```
Query → [Query Gen] → 3 refined queries → [Skill Finder] → Top 30 skills 
→ [Aggregator] → Deduplicate → [Enricher] → 3-5 sentence summaries → Display
```

### Cost
- **Per search**: $0.00112 (~0.1¢)
- **Per 1M searches/month**: $1,120

### Timeline
| Phase | Status | Duration | Cost |
|-------|--------|----------|------|
| 1: MVP | ✅ Done | 2w | $0.56/500 searches |
| 2: Context-Aware | 🚀 60% | 1.5w | +context extractors |
| 2-2: Testing | 📊 Planned | 1w | evaluation report |
| 3: Optimization | ⏭️ | 2w | -60% cost (caching) |
| 3B: Auth | ⏭️ | 1w | per-user quotas |
| 3C: Web UI | ⏭️ | 1.5w | browser interface |
| 4: Distribution | ⏭️ | 3w | IDE ext, API, analytics |

---

## Phase 1: MVP ✅

| Component | File | Model | Latency | Cost |
|-----------|------|-------|---------|------|
| Query Generator | [query-generator.ts](../../cli/commands/recommend/query-generator.ts) | minimax-text-01 | 2-3s | $0.000025 |
| Skill Finder | [skill-finder.ts](../../cli/commands/recommend/skill-finder.ts) | npx CLI | 3-5s | FREE |
| Aggregator | [skill-aggregator.ts](../../cli/commands/recommend/skill-aggregator.ts) | Sort/dedupe | <100ms | FREE |
| Enricher | [skill-enricher.ts](../../cli/commands/recommend/skill-enricher.ts) | gpt-3.5-turbo | 2-4s | $0.0011 (×5) |
| Pipeline | [pipeline.ts](../../cli/commands/recommend/pipeline.ts) | Orchestrator | 8-12s E2E | — |
| CLI | [command.ts](../../cli/commands/recommend/command.ts) | Interactive | — | — |

**Query Strategy**: 3-angle (library names, problem-solution, patterns/frameworks)

---

## Phase 2: Context-Aware & Mastra 🚀 (70% Complete)

### Completed ✅
- Query Generator refactored to Mastra-compatible `MastraTextClient` interface
- Fallback queries (deterministic, no API dependency): `"${query} library package"`, `"${query} problem solution"`, `"${query} workflow pattern"`
- Response parsing (resilient to multiple JSON formats)
- Context type structure finalized: `{ readmeSummary, languages, frameworks, runtimes, existingPackages, recentSessionThemes, installedSkills, installedMcpServers }`
- System prompt tuned for 3-angle strategy + avoid existing packages
- **Skills/MCP detector**: Scans ~/.claude/skills, ~/.cursor/skills-cursor, ~/.codex/skills + MCP servers
  - Detects 252 installed skills across all environments
  - Scans ~/.codex/config.toml for MCP server configs
  - Filters recommendations to avoid duplicate installs

### In Progress 🔄
- Context extractors (7 modules, fully integrated):
  - README Parser, Language Detector, Framework Detector, Runtime Detector, Dependency Parser, Session Log Extractor, **Skills/MCP Detector** ✅
- End-to-end testing (3 scenarios: with query, no query, with context)
- Verification: E2E test confirms 252 installed skills are filtered from recommendations

### Next Steps ⏭️
1. ✅ **Skills/MCP detector implemented** - scans ~/.claude/skills, ~/.cursor/skills-cursor, ~/.codex/skills
2. ✅ **Filtering integrated** - aggregator filters out 252 installed skills
3. ✅ **E2E verified** - pipeline confirms filtering works (8 new skills recommended, 252 filtered)
4. Migrate Skill Enricher to Mastra client (~1h)
5. Wire CLI command.ts to full pipeline (~2h)
6. Phase 2-2 prompt variation testing (~3h)

### Context Type
```typescript
interface ProjectContext {
  readmeSummary: string;
  languages: Record<string, number>;          // {"TypeScript": 75, "JavaScript": 25}
  frameworks: string[];                        // ["React", "Next.js"]
  runtimes: { runtimes: string[], packageManagers: string[] };
  existingPackages: string[];                  // Filter out duplicates
  recentSessionThemes: string[];               // From ~/.claude/logs/
}
```

### Mastra Client Interface
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

**Benefit**: Swap LLM providers (OpenRouter → Claude → local) without changing generator code.

---

## Gap Analysis: Installed vs. Available Skills

### Current State
- **Total Available**: 91,000+ skills in registry
- **Currently Installed**: 252 unique skills
  - Claude Code: 149 skills
  - Cursor: 15 skills  
  - Codex: 91 skills
- **Exploration Gap**: 90,748+ skills (99.7% unexplored)

### Filtering Mechanism
The aggregator filters out 3 exclusion categories:
1. **Existing Packages** (from package.json, pyproject.toml, etc.)
2. **Installed Skills** (from ~/.claude/skills, ~/.cursor/skills-cursor, ~/.codex/skills)
3. **Installed MCP Servers** (from ~/.codex/config.toml)

**Result**: Only truly NEW skills recommended to user

### Example
User searches "testing framework":
- Finder returns: 50 testing-related skills (tdd, jest, pytest, vitest, playwright, etc.)
- After filtering installed (tdd): 45 new skills recommended
- Pipeline avoids duplicate installations

---

## Phase 2-2: Testing & Evaluation 📊

### Prompt Variant Testing
| Variant | Angles | Speed | Target |
|---------|--------|-------|--------|
| Current | 3 (library, problem, pattern) | 5-8s | >84% |
| Detailed | 4 (+framework) | 6-10s | >88% |
| Concise | 2 (library, problem) | 3-5s | >80% |

**Test on**: 5 diverse queries across 3 project types (research, dev, docs)

### File Type Evaluation
- **Research** (ML): PyTorch, scikit-learn → recommend MLflow, wandb
- **Development** (CLI/TypeScript): typescript, jest, aws-sdk → recommend yargs, inquirer, ora
- **Documentation** (Markdown): none → recommend docusaurus, sphinx, mkdocs

**Goal**: Context improves precision by 3-10% across all types

### Deliverables
- `test/prompt-variation-evaluation.test.ts`
- `test/context-file-types-evaluation.test.ts`
- `test/readme-extraction-evaluation.test.ts`
- `test/context-improvement-evaluation.test.ts`
- `docs/plans/skill-recommendation/phase2-2-evaluation-report.md`

---

## Phase 2.7: Authentication System Scoping

**8 Requirements**: Registration, Login, Sessions, API Keys, Preferences, History, Rate Limiting, Social Auth

| Component | Estimate | Priority |
|-----------|----------|----------|
| Auth middleware (JWT/session) | 4h | MUST |
| DB schema (users, sessions) | 2h | MUST |
| Registration + Login | 5h | MUST |
| API key management | 3h | SHOULD |
| User preferences storage | 2h | SHOULD |
| Search history storage | 2h | SHOULD |
| Rate limiting enforcement | 3h | SHOULD |
| **Total** | **~24h** | — |

**Deferred**: Social auth, analytics dashboard

---

## Phase 3: Optimization

| Feature | Cost Savings | Effort | Impact |
|---------|--------------|--------|--------|
| Query caching | 60% | 2h | Repeats: <1s |
| Skill result caching | 40% | 2h | — |
| Reranker (free Cohere) | 50% | 3h | No enrichment needed |
| Rate limiting | ∞ | 3h | Prevent abuse |
| Model swapping | 70% | 2h | minimax for enrichment |

**Best case**: Reduce to $0.00028/search (75% savings)

---

## Phase 3B: Authentication System

**24h effort** (see Phase 2.7 scope). Per-user quotas, API keys, history tracking.

---

## Phase 3C: Web UI

**Features**: Real-time search, skill cards, saved searches, history, responsive design
**Stack**: React + Express + SQLite
**Effort**: 1.5 weeks

---

## Phase 4: Distribution

- VS Code extension (~1w)
- REST API service (~1w)
- Public dashboard (~1w)

---

## Cost Analysis

### Per-Call Breakdown

| Call | Model | Input | Output | Total |
|------|-------|-------|--------|-------|
| Query Gen | minimax | $0.0000125 | $0.000012 | $0.000025 |
| Enrichment (×5) | gpt-3.5 | $0.0002 | $0.0009 | $0.0011 |
| **TOTAL** | — | — | — | **$0.001125** |

### Scenarios
- **500/month** (startup): $0.56/month, $6.72/year
- **10K/month** (growth): $11.20/month, $134/year
- **200K/month** (heavy): $224/month, $2,688/year
- **5M/month** (enterprise): $5,600/month, $67,200/year

### Optimization Path
- Phase 2: Current ($0.001125/search)
- Phase 3 + caching: -60% = $0.00045/search
- Phase 4 + minimax: -70% = $0.00035/search

---

## File Structure

```
cli/commands/recommend/
├── types.ts, prompts.ts, logger.ts
├── query-generator.ts, skill-finder.ts, skill-aggregator.ts
├── skill-enricher.ts, pipeline.ts, command.ts
├── openrouter-client.ts (Mastra adapter)
└── extractors/ (planned)
    ├── readme-parser.ts, language-detector.ts, framework-detector.ts
    ├── runtime-detector.ts, dependency-parser.ts, session-log-extractor.ts

test/
├── pipeline-evaluation.test.ts
├── query-generator-evaluation.test.ts, skill-finder-evaluation.test.ts
├── prompt-variation-evaluation.test.ts (Phase 2-2)
├── context-file-types-evaluation.test.ts (Phase 2-2)
├── context-improvement-evaluation.test.ts (Phase 2-2)
└── fixtures/ (README samples)
```

---

## Success Metrics

| Phase | Metric | Target | Status |
|-------|--------|--------|--------|
| 1 | E2E latency | <15s | ✅ |
| 1 | Precision | >84% | ✅ |
| 2 | Context latency | <300ms | 🔄 |
| 2 | Duplicate filtering | >95% | 🔄 |
| 2 | With context precision | >90% | ⏭️ |
| 2-2 | Prompt variants tested | 3 variants | 📊 |
| 2-2 | Context improvement | +3-10% | 📊 |
| 3 | Cache hit rate | >60% | ⏭️ |
| 3 | With cache latency | <5s | ⏭️ |

---

## How to Run

```bash
# Test query generation (current)
bun run test-query-gen.ts                    # Fallback (no client)
bun run test-query-gen-llm.ts                # With LLM
bun run test-query-gen-llm-no-query.ts       # No query + context

# Full tests (Phase 2-2, when ready)
bun test
```

---

## References

- **APIs**: OpenRouter (minimax, gpt-3.5-turbo), npx skills CLI
- **Registry**: https://skills.sh (91k+ skills)
- **Project**: beginning-harness (TypeScript + Bun)
- **Status Reports**: [diagrams.md](diagrams.md), [phase1-results-may13.md](phase1-results-may13.md)

---

**Updated**: 2026-05-18 | **Next Review**: After Phase 2 completion | **Owner**: —
