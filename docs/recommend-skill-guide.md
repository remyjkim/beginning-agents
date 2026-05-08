# Skill Recommendation Guide

The `bgng recommend skill` command helps you find the best skills for your project using semantic search and popularity scoring.

## Basic Usage

```bash
bgng recommend skill <query>
```

### Examples

```bash
# Find testing-related skills
bgng recommend skill testing

# Find security skills  
bgng recommend skill security

# Find performance optimization skills
bgng recommend skill performance

# Find specific patterns
bgng recommend skill test-driven development
```

## How It Works

The recommendation system uses three factors to rank skills:

1. **Semantic Similarity (60%)** — Matches the meaning of your query against skill descriptions
2. **Popularity (30%)** — Scores based on install counts, GitHub stars, and freshness
3. **Language Match (10%)** — Prioritizes skills suitable for your project's language

### Language Detection

The command automatically detects your project's primary language by analyzing file extensions:

```
[Detected: TypeScript (65%), Python (25%), Go (10%)]
```

This detection helps rank skills that are most relevant for your tech stack.

## Example Output

```
[Detected: TypeScript (65%), Python (25%), Go (10%)]

Recommended skills:

1. /test-coverage [online]
   Matches "testing". Your TypeScript project would benefit from coverage analysis.
   Score: 89% | 14.2K installs | ⭐ 892

2. /tdd-workflow [offline]
   Matches "testing". Your TypeScript project would benefit from test-driven development.
   Score: 87% | 8.5K installs | ⭐ 421

3. /python-testing [online]
   Matches "testing" (less relevant for TypeScript). General testing patterns for Python.
   Score: 62% | 6.1K installs | ⭐ 312

What next?
  1. Add skill
  2. Refine search
  3. Exit

Your choice (1-3): 
```

## Status Labels

- **[active]** — Skill is installed and ready to use
- **[offline]** — Skill data cached locally (from last API fetch)
- **[online]** — Skill data freshly fetched from API

## Supported Languages

The recommendation system detects and prioritizes:

- TypeScript / JavaScript
- Python
- Go
- Rust
- Java
- C# / C / C++
- Ruby
- PHP
- Swift
- Kotlin
- And more...

## Interactive Menu

After seeing recommendations, you have three choices:

1. **Add skill** — Install the selected skill to your project
2. **Refine search** — Try a new query to find different skills
3. **Exit** — Stop the recommendation session

You can refine your search multiple times in a single session.

## Error Handling

### No Matches Found

If your query doesn't match any skills, you'll see:

```
No matches found for "quantum computing". Try refining your search or check these popular skills:

1. /neural-networks (250K installs)
2. /machine-learning-tools (180K installs)
3. /data-science-utilities (165K installs)
```

### Embedding Service Unavailable

If the embedding service is temporarily unavailable, the command will use a simplified ranking:

```
⚠️  Embedding service unavailable. Using simplified ranking (popularity + language only).
```

Results will still be useful—they'll just prioritize popularity and language match over semantic similarity.

### Undetectable Language

If your project's language can't be determined:

```
[No detectable source files in project]
```

The recommendation system will still work using semantic similarity and popularity, without language-based ranking.

## Improving Recommendations

### Tips for Better Results

1. **Be specific** — "test coverage tracking" is better than "testing"
2. **Use domain terms** — "continuous deployment" rather than just "deployment"  
3. **Include language hints** — "TypeScript testing" to prioritize language
4. **Refine iteratively** — Try different phrasings if results aren't relevant

### Query Expansion

The system automatically expands your query using synonyms to find relevant skills. For example, "testing" might also search for "unit testing" and "test framework" internally.

## Latency Targets

- **Full search** — <300ms p95 (includes language detection + embedding)
- **Ranking only** — <100ms p95 (with cached embeddings)

## Examples by Domain

### Testing
```bash
bgng recommend skill testing
bgng recommend skill test coverage
bgng recommend skill unit testing
```

### Security
```bash
bgng recommend skill security
bgng recommend skill vulnerability scanning
bgng recommend skill authentication
```

### Performance
```bash
bgng recommend skill performance
bgng recommend skill optimization
bgng recommend skill caching
```

### Code Quality
```bash
bgng recommend skill code quality
bgng recommend skill linting
bgng recommend skill type safety
```

## Troubleshooting

**Q: I'm not seeing relevant skills**

A: Try refining your query with more specific terms or domain language. Use the "Refine search" option to try again.

**Q: Why is a skill marked [offline]?**

A: The skill's metadata was cached during your last API fetch. It's still accurate but hasn't been verified this session. Use a fresh search to update statuses.

**Q: Can I see the raw JSON output?**

A: Yes! Use the `--json` flag:
```bash
bgng recommend skill testing --json
```

This outputs machine-readable JSON suitable for scripting.

## Configuration

Set environment variables to customize behavior:

- `SKILLS_API_KEY` — API key for Skills-API (optional; system falls back to cached data)
- `MASTRA_API_KEY` — API key for Mastra AI embeddings (optional; uses simplified ranking if unavailable)
