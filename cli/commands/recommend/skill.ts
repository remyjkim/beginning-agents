import { Option } from "clipanion";
import { loadSkillIndex } from "../../core/recommend/skill-indexer";
import { detectLanguages, formatLanguageDetection } from "../../core/recommend/repo-detector";
import { rankSkills } from "../../core/recommend/query-ranker";
import { generateExplanation, formatSkillResult } from "../../core/recommend/explanation-generator";
import { resolveSkillStatus, formatStatusLabel } from "../../core/recommend/status-resolver";
import { BaseCommand } from "../base";
import { renderJson } from "../../core/output";
import { RankedSkill } from "../../core/recommend/query-ranker";

export class RecommendSkillCommand extends BaseCommand {
  static override paths = [["recommend", "skill"]];

  static override usage = BaseCommand.Usage({
    category: "Recommend",
    description: "Find and rank skills matching your query with semantic search + popularity.",
  });

  query = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    try {
      // Load skill index
      const apiKey = process.env.SKILLS_API_KEY;
      const skillIndex = await loadSkillIndex(this.context.homeDir, apiKey);

      // Detect project languages
      const detection = detectLanguages(this.context.repoRoot);
      const detectionString = formatLanguageDetection(detection);

      // Rank skills
      const rankingResult = await rankSkills(
        skillIndex.skills,
        this.query,
        skillIndex.bounds,
        detection
      );
      const rankedSkills = rankingResult.results;

      if (rankingResult.embeddingFailed) {
        this.context.stdout.write(
          "⚠️  Embedding service unavailable. Using simplified ranking (popularity + language only).\n\n"
        );
      }

      if (rankedSkills.length === 0) {
        const suggestions = this.getSuggestions(skillIndex.skills);
        this.context.stdout.write(
          `No matches found for "${this.query}". Try refining your search or check these popular skills:\n\n` +
          suggestions
        );
        return 0;
      }

      // Format and display results
      if (this.json) {
        this.context.stdout.write(renderJson(rankedSkills));
        return 0;
      }

      // Interactive mode
      const results = this.formatResults(rankedSkills, detectionString);
      this.context.stdout.write(results);

      // Interactive menu loop
      await this.handleInteractiveLoop(rankedSkills);

      return 0;
    } catch (error) {
      this.context.stderr.write(
        `Error: ${error instanceof Error ? error.message : String(error)}\n`
      );
      return 1;
    }
  }

  private formatResults(skills: RankedSkill[], detectionString: string): string {
    const lines: string[] = [];
    lines.push("");
    lines.push(detectionString);
    lines.push("");
    lines.push("Recommended skills:");
    lines.push("");

    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      const status = resolveSkillStatus(
        skill.slug,
        this.context.homeDir,
        true,
        false
      );
      const formatted = formatSkillResult(
        skill,
        i + 1,
        this.query,
        { languages: {}, confidence: "none" }, // Simplified detection for display
        status.label
      );
      lines.push(formatted);
      lines.push("");
    }

    return lines.join("\n");
  }

  private getSuggestions(skills: Skill[]): string {
    // Return top 3 most popular skills
    const topThree = skills
      .sort((a, b) => b.installCount - a.installCount)
      .slice(0, 3)
      .map((skill, index) => `${index + 1}. /${skill.slug} (${skill.installCount.toLocaleString()} installs)`)
      .join("\n");

    return topThree;
  }

  private async handleInteractiveLoop(skills: RankedSkill[]): Promise<void> {
    // For MVP, just show exit prompt
    // Full implementation would use readline for interactive input
    const prompt =
      "\nWhat next?\n" +
      "  1. Add skill\n" +
      "  2. Refine search\n" +
      "  3. Exit\n" +
      "\nYour choice (1-3): ";

    this.context.stdout.write(prompt);

    // For now, just exit gracefully
    // In full implementation, would read from stdin and handle choices
  }
}
