# Skills & MCP Tools Detector

Automatically detects installed skills and MCP tools to avoid recommending duplicates.

## Overview

The skills detector scans your local environment to identify:
- **Installed Skills** from Claude Code, Cursor, and Codex
- **MCP Servers** from configuration files
- **Recommendations**: Only suggests skills NOT already installed

## What It Detects

### Skills Directories
```
~/.claude/skills/          → Claude Code installed skills
~/.cursor/skills-cursor/   → Cursor IDE installed skills
~/.codex/skills/           → Codex CLI installed skills
```

### MCP Servers
```
~/.codex/config.toml       → MCP server configurations
[mcp_servers.context7]     → Example: context7 MCP server
```

## Current Inventory (2026-05-18)

```
✅ Total Installed: 253 items
   ├─ Claude Code: 149 skills
   ├─ Cursor: 15 skills
   ├─ Codex: 91 skills
   └─ MCP Servers: 1 (context7)

📊 Coverage
   • Available in Registry: 91,000+ skills
   • Installed: 252 skills (0.3%)
   • Unexplored Gap: 90,748+ skills (99.7%)
```

## API Usage

### Detect All Installed Tools
```typescript
import { detectInstalledTools } from "./skills-mcp-detector";

const tools = await detectInstalledTools();
// Returns: { skills: string[], mcpServers: string[], all: string[] }

console.log(tools.all.length);        // 252
console.log(tools.skills.slice(0, 5)); // ['agent-eval', 'tdd', ...]
console.log(tools.mcpServers);        // ['context7']
```

### Check if Skill is Installed
```typescript
import { isSkillInstalled } from "./skills-mcp-detector";

const installed = await isSkillInstalled("tdd");
// Returns: true (if installed), false (if not)
```

### Filter Out Installed Skills
```typescript
import { filterOutInstalledSkills } from "./skills-mcp-detector";

const recommendations = ['tdd', 'jest', 'pytest', 'playwright'];
const filtered = await filterOutInstalledSkills(recommendations);
// ['jest', 'pytest', 'playwright'] (tdd removed)
```

## Integration with Recommendation Pipeline

### Context Extraction
```typescript
const context = await extractProjectContext('.');
// context.installedSkills = ['tdd', 'agent-eval', ...]
// context.installedMcpServers = ['context7']
```

### Skill Aggregation
```typescript
const aggregated = aggregateSkills(skillsByQuery, 30, {
  existingPackages: context.existingPackages,
  installedSkills: context.installedSkills,        // ← New!
  installedMcpServers: context.installedMcpServers, // ← New!
});
```

## How Filtering Works

### 3-Layer Exclusion List
1. **Project Dependencies**
   - `package.json` (Node)
   - `pyproject.toml` (Python)
   - `Cargo.toml` (Rust)
   - `Gemfile` (Ruby)
   - etc.

2. **Installed Skills**
   - `~/.claude/skills/*`
   - `~/.cursor/skills-cursor/*`
   - `~/.codex/skills/*`

3. **MCP Servers**
   - Parsed from `~/.codex/config.toml`

### Example: User Asks for "Testing"

```
User: "I need testing tools"
  ↓
Query Generator: 3 expanded queries
  • "testing tools library package"
  • "testing tools problem solution"
  • "testing tools workflow pattern"
  ↓
Skill Finder: Returns ~50 candidates
  [tdd, jest, pytest, vitest, playwright, e2e, test-coverage, ...]
  ↓
Aggregator: Filters out installed
  • Installed: [tdd, e2e, test-coverage]
  • Excluded: 3 items
  • Recommended: 47 new skills (jest, pytest, vitest, playwright, ...)
```

## Performance

```
Context Extraction:
  • Skills scan: ~5-10ms
  • MCP config parse: ~2-5ms
  • Total: ~19ms (E2E verified)

Full Pipeline:
  • Query Gen: 2-3s
  • Skill Find: 3-5s
  • Aggregation: <100ms
  • Total: ~5-8s
```

## FAQ

### Why scan multiple directories?
Different tools (Claude Code, Cursor, Codex) store skills separately. Scanning all ensures complete coverage.

### Can I manually add/remove skills from filtering?
Currently: No, detects only what's installed.
Future: Could add config to ignore certain skills or force-include others.

### What if a skill name has multiple variants?
The detector normalizes names (lowercase, trim) for comparison. E.g., "TDD", "tdd", " TDD " all match.

### Performance impact?
Minimal (~19ms). File I/O is the dominant cost, not parsing.

## Testing

```bash
# Verify detector finds all installed skills
bun run test-skills-detector.ts

# Gap analysis report
bun run test-skills-gap-analysis.ts

# End-to-end filtering verification
bun run test-e2e-filtering.ts
```

## Implementation Details

### File: `skills-mcp-detector.ts`
- `detectInstalledTools()` - Main entry point
- `scanSkillsDirectory()` - Lists skills from a directory
- `extractMcpServers()` - Parses config.toml
- `isSkillInstalled()` - Single skill lookup
- `filterOutInstalledSkills()` - Batch filtering

### Integration Points
1. **extractors/index.ts** - Exports detector
2. **types.ts** - ProjectContext includes installed fields
3. **skill-aggregator.ts** - Filters during aggregation
4. **pipeline.ts** - Uses filtered results

## Future Enhancements

- [ ] Custom exclusion list (user config)
- [ ] Skill version tracking
- [ ] Recommendation reasoning ("already installed")
- [ ] Skill update suggestions ("newer version available")
- [ ] MCP server auto-discovery for other CLIs
