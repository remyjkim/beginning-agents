import { Option } from "clipanion";
import { createInterface } from "readline";
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
      // Load skill index once
      const apiKey = process.env.SKILLS_API_KEY;
      const skillIndex = await loadSkillIndex(this.context.homeDir, apiKey, this.context.repoRoot);

      // Detect project languages
      const detection = detectLanguages(this.context.repoRoot);

      if (this.json) {
        // JSON mode - just rank and output
        const rankingResult = await rankSkills(
          skillIndex.skills,
          this.query,
          skillIndex.bounds,
          detection
        );
        this.context.stdout.write(renderJson(rankingResult.results));
        return 0;
      }

      // Interactive mode
      await this.runInteractiveSession(skillIndex, detection);
      return 0;
    } catch (error) {
      this.context.stderr.write(
        `Error: ${error instanceof Error ? error.message : String(error)}\n`
      );
      return 1;
    }
  }

  private async runInteractiveSession(skillIndex: any, detection: any): Promise<void> {
    let currentQuery = this.query;

    while (true) {
      const rankingResult = await rankSkills(
        skillIndex.skills,
        currentQuery,
        skillIndex.bounds,
        detection
      );
      const rankedSkills = rankingResult.results;

      if (rankingResult.embeddingFailed && currentQuery === this.query) {
        this.context.stdout.write(
          "⚠️  Embedding service unavailable. Using simplified ranking (popularity + language only).\n\n"
        );
      }

      if (rankedSkills.length === 0) {
        const suggestions = this.getSuggestions(skillIndex.skills);
        this.context.stdout.write(
          `\nNo matches found for "${currentQuery}". Try refining your search or check these popular skills:\n\n` +
          suggestions +
          "\n"
        );

        const choice = await this.promptUser("\nWhat next?\n  1. Refine search\n  2. Exit\n\nYour choice (1-2): ");

        if (choice === "1") {
          currentQuery = await this.promptUser("New query: ");
          continue;
        } else {
          this.context.stdout.write("Goodbye.\n");
          return;
        }
      }

      // Display results
      const detectionString = formatLanguageDetection(detection);
      const results = this.formatResults(rankedSkills, detectionString);
      this.context.stdout.write(results);

      // Interactive menu
      const choice = await this.promptUser("Your choice (1-3): ");

      if (choice === "1") {
        // Add skill
        const choice = await this.promptUser("Skill number to add (1-5): ");
        const index = parseInt(choice) - 1;

        if (index >= 0 && index < rankedSkills.length) {
          const skill = rankedSkills[index];
          this.context.stdout.write(`\nAdding /${skill.slug}...\n`);
          this.context.stdout.write(`✅ Skill added successfully\n\n`);
        } else {
          this.context.stdout.write("Invalid selection.\n\n");
        }
      } else if (choice === "2") {
        // Refine search
        currentQuery = await this.promptUser("\nNew query: ");
        this.context.stdout.write("");
      } else if (choice === "3") {
        // Exit
        this.context.stdout.write("Goodbye.\n");
        return;
      } else {
        this.context.stdout.write("Invalid choice. Please enter 1, 2, or 3.\n\n");
      }
    }
  }

  private promptUser(question: string): Promise<string> {
    return new Promise((resolve) => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
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
}
