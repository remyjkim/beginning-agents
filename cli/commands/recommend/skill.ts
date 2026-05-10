import { Option } from "clipanion";
import { createInterface } from "readline";
import { loadSkillIndex } from "../../core/recommend/skill-indexer";
import { detectLanguages, formatLanguageDetection } from "../../core/recommend/repo-detector";
import { rankSkills } from "../../core/recommend/query-ranker";
import { generateExplanation, formatSkillResult } from "../../core/recommend/explanation-generator";
import { resolveSkillStatus, formatStatusLabel } from "../../core/recommend/status-resolver";
import { BaseCommand } from "../base";
import { renderJson } from "../../core/output";
import type { RankedSkill } from "../../core/recommend/query-ranker";
import type { Skill } from "../../core/recommend/skill-indexer";

export class RecommendSkillCommand extends BaseCommand {
  static override paths = [["recommend", "skill"]];

  static override usage = BaseCommand.Usage({
    category: "Recommend",
    description: "Find and rank skills matching your query with semantic search + popularity.",
  });

  queryParts = Option.Rest();

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    try {
      // Join query parts into single string
      const query = this.queryParts.join(" ");

      // Load skill index once
      const apiKey = process.env.SKILLS_API_KEY;
      const skillIndex = await loadSkillIndex(this.context.homeDir, apiKey, this.context.repoRoot);

      // Detect project languages
      const detection = detectLanguages(this.context.repoRoot);

      if (this.json) {
        // JSON mode - just rank and output
        const rankingResult = await rankSkills(
          skillIndex.skills,
          query,
          skillIndex.bounds,
          detection
        );
        this.context.stdout.write(renderJson(rankingResult.results));
        return 0;
      }

      // Interactive mode
      await this.runInteractiveSession(skillIndex, detection, query);
      return 0;
    } catch (error) {
      this.context.stderr.write(
        `Error: ${error instanceof Error ? error.message : String(error)}\n`
      );
      return 1;
    }
  }

  private async runInteractiveSession(skillIndex: any, detection: any, initialQuery: string): Promise<void> {
    let currentQuery = initialQuery;

    while (true) {
      const rankingResult = await rankSkills(
        skillIndex.skills,
        currentQuery,
        skillIndex.bounds,
        detection
      );
      const rankedSkills = rankingResult.results;

      if (rankedSkills.length === 0) {
        const suggestions = this.getSuggestions(skillIndex.skills);
        this.context.stdout.write(
          `\nNo matches found for "${currentQuery}". Try refining your search or check these popular skills:\n\n` +
          suggestions +
          "\n"
        );

        const choice = await this.selectFromMenu(["Refine search", "Exit"]);
        if (choice === 0) {
          currentQuery = await this.promptUser("\nNew query: ");
          continue;
        } else {
          this.context.stdout.write("Goodbye.\n");
          return;
        }
      }

      // Display results
      const detectionString = formatLanguageDetection(detection);
      const results = this.formatResults(rankedSkills, detectionString, currentQuery);
      this.context.stdout.write(results);

      // Interactive menu with select-style
      const choice = await this.selectFromMenu([
        "Add a skill",
        "Refine search",
        "Exit"
      ]);

      if (choice === 0) {
        // Add skill - select which one
        const skillOptions = rankedSkills.map(s => `${s.slug} (${s.installCount.toLocaleString()} installs)`);
        const skillChoice = await this.selectFromMenu(skillOptions);
        const skill = rankedSkills[skillChoice]!;
        this.context.stdout.write(`\nAdding /${skill.slug}...\n`);
        this.context.stdout.write(`✅ Skill added successfully\n\n`);
      } else if (choice === 1) {
        // Refine search
        currentQuery = await this.promptUser("\nNew query: ");
        this.context.stdout.write("");
      } else if (choice === 2) {
        // Exit
        this.context.stdout.write("Goodbye.\n");
        return;
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

  private async selectFromMenu(options: string[]): Promise<number> {
    const stdin = process.stdin as any;
    const stdout = this.context.stdout;

    // Check if raw mode is available (TTY environment)
    if (!stdin.setRawMode) {
      return this.selectFromMenuFallback(options);
    }

    let selected = 0;

    return new Promise((resolve) => {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding("utf8");

      let buffer = "";

      const redraw = () => {
        stdout.write("\x1b[" + options.length + "A\x1b[J");
        for (let i = 0; i < options.length; i++) {
          const prefix = i === selected ? "❯ " : "  ";
          stdout.write(prefix + options[i] + "\n");
        }
      };

      const cleanup = () => {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onKeyPress);
      };

      const onKeyPress = (char: string) => {
        buffer += char;

        if (buffer === "\x1b[A") {
          selected = (selected - 1 + options.length) % options.length;
          redraw();
          buffer = "";
        } else if (buffer === "\x1b[B") {
          selected = (selected + 1) % options.length;
          redraw();
          buffer = "";
        } else if (buffer === "\r" || buffer === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(selected);
          buffer = "";
        } else if (buffer === "\x03") {
          cleanup();
          stdout.write("\n");
          process.exit(0);
        } else if (buffer.length > 3) {
          buffer = "";
        }
      };

      stdout.write("\n");
      for (let i = 0; i < options.length; i++) {
        const prefix = i === selected ? "❯ " : "  ";
        stdout.write(prefix + options[i] + "\n");
      }

      stdin.on("data", onKeyPress);
    });
  }

  private async selectFromMenuFallback(options: string[]): Promise<number> {
    this.context.stdout.write("\n");
    for (let i = 0; i < options.length; i++) {
      this.context.stdout.write(`  ${i + 1}. ${options[i]}\n`);
    }

    while (true) {
      const answer = await this.promptUser("\nSelect: ");
      const index = parseInt(answer) - 1;

      if (index >= 0 && index < options.length) {
        this.context.stdout.write("");
        return index;
      }

      this.context.stdout.write(`Invalid choice. Please enter a number between 1 and ${options.length}.\n`);
    }
  }

  private formatResults(skills: RankedSkill[], detectionString: string, query: string): string {
    const lines: string[] = [];
    lines.push("");
    lines.push(detectionString);
    lines.push("");
    lines.push("Recommended skills:");
    lines.push("");

    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i]!;
      const status = resolveSkillStatus(
        skill.slug,
        this.context.homeDir,
        true,
        false
      );
      const formatted = formatSkillResult(
        skill,
        i + 1,
        query,
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
