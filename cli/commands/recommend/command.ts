// ABOUTME: Implements the `bgng recommend skill` and `bgng add skill` commands.
// ABOUTME: Provides context-aware skill recommendations and installation.

import { Option } from "clipanion";
import { recommendSkillsWithOpenRouter, createBufferedLogger } from "./index";
import { enrichSkillsWithSummaries } from "./skill-enricher";
import { createInterface } from "readline";
import { spawn } from "child_process";
import { BaseCommand } from "../base";

const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function printSpinner(message: string, frame: number) {
  process.stdout.write(`\r${spinner[frame % spinner.length]} ${message}`);
}

async function searchSkills(query: string, repoPath = process.cwd()) {
  let frame = 0;
  const spinnerInterval = setInterval(() => {
    printSpinner(`Searching skills for: "${query}"`, frame++);
  }, 100);

  try {
    const logger = createBufferedLogger("./skill-recommendations.jsonl");
    const result = await recommendSkillsWithOpenRouter(query, { logger, repoPath });

    clearInterval(spinnerInterval);
    process.stdout.write("\r");

    printProjectContext(result.projectContext);

    console.log(`\n✨ Top 5 Results:\n`);
    const top5 = result.aggregatedSkills.slice(0, 5);

    if (top5.length > 0) {
      let spinnerFrame = 0;
      const enrichmentSpinner = setInterval(() => {
        printSpinner(`Generating summaries...`, spinnerFrame++);
      }, 100);

      const enrichedSkills = await enrichSkillsWithSummaries(top5, undefined, logger);

      clearInterval(enrichmentSpinner);
      process.stdout.write("\r");

      enrichedSkills.forEach((skill, i) => {
        const installs = (skill.metadata?.installs as number) || 0;
        const installStr = formatInstalls(installs, true);
        const summary = (skill.metadata?.summary as string) || "";
        console.log(`   ${i + 1}. ${skill.name} ${installStr}`);
        if (summary) {
          console.log(`      ${summary}`);
        }
        console.log("");
      });
    } else {
      console.log("   (No skills found)\n");
    }

    console.log(`\n⏱️  Latency: ${(result.latencyMs / 1000).toFixed(1)}s (context ${(result.contextLatencyMs).toFixed(0)}ms)\n`);

    return top5;
  } catch (error) {
    clearInterval(spinnerInterval);
    process.stdout.write("\r");
    console.error(
      "\n❌ Error:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

function formatInstalls(count: number, colored = false): string {
  const str = count >= 1000000
    ? (count / 1000000).toFixed(1) + "M"
    : count >= 1000
    ? (count / 1000).toFixed(1) + "K"
    : count.toString();

  if (colored) {
    return `\x1b[36m${str} installs\x1b[0m`;
  }
  return str;
}

function printProjectContext(context: {
  readmeSummary: string;
  languages: Record<string, number>;
  frameworks: string[];
  runtimes: { runtimes: string[]; packageManagers: string[] };
  existingPackages: string[];
  recentSessionThemes: string[];
}) {
  console.log("\nProject context used:");
  console.log(`   Summary: ${context.readmeSummary || "unknown"}`);
  console.log(`   Languages: ${formatLanguages(context.languages) || "unknown"}`);
  console.log(`   Frameworks: ${context.frameworks.join(", ") || "unknown"}`);
  console.log(`   Runtimes: ${context.runtimes.runtimes.join(", ") || "unknown"}`);
  console.log(`   Package managers: ${context.runtimes.packageManagers.join(", ") || "unknown"}`);
  console.log(`   Existing packages: ${formatList(context.existingPackages, 12) || "none"}`);
  console.log(`   Recent themes: ${context.recentSessionThemes.join(", ") || "none"}`);
}

function formatLanguages(languages: Record<string, number>) {
  return Object.entries(languages)
    .map(([language, percent]) => `${language} ${percent}%`)
    .join(", ");
}

function formatList(values: string[], limit: number) {
  if (values.length <= limit) return values.join(", ");
  return `${values.slice(0, limit).join(", ")} (+${values.length - limit} more)`;
}

async function selectWithArrows<T>(items: T[], display: (item: T) => string): Promise<T | null> {
  if (items.length === 0) return null;

  let selected = 0;
  let buffer = "";
  let firstDraw = true;

  const draw = () => {
    if (firstDraw) {
      process.stdout.write("Use ↑↓ arrows and press Enter:\n\n");
      items.forEach((item, i) => {
        const mark = i === selected ? "▶️ " : "  ";
        const color = i === selected ? "\x1b[1;32m" : "";
        const reset = i === selected ? "\x1b[0m" : "";
        process.stdout.write(`${mark}${color}${i + 1}. ${display(item)}${reset}\n`);
      });
      firstDraw = false;
    } else {
      for (let i = 0; i < items.length; i++) {
        process.stdout.write("\x1b[A");
      }
      items.forEach((item, i) => {
        const mark = i === selected ? "▶️ " : "  ";
        const color = i === selected ? "\x1b[1;32m" : "";
        const reset = i === selected ? "\x1b[0m" : "";
        process.stdout.write(`\x1b[K${mark}${color}${i + 1}. ${display(item)}${reset}\n`);
      });
    }
  };

  return new Promise((resolve) => {
    draw();
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const onData = (chunk: string) => {
      buffer += chunk;

      if (buffer === "\x1b[A") {
        selected = (selected - 1 + items.length) % items.length;
        draw();
        buffer = "";
      } else if (buffer === "\x1b[B") {
        selected = (selected + 1) % items.length;
        draw();
        buffer = "";
      } else if (buffer === "\r" || buffer === "\n") {
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        const item = items[selected];
        if (item !== undefined) {
          process.stdout.write(`\n✅ Selected: ${display(item)}\n\n`);
          resolve(item);
        }
        buffer = "";
      } else if (buffer === "\x03") {
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.exit(0);
      }

      if (buffer.length > 3) buffer = "";
    };

    process.stdin.on("data", onData);
  });
}

async function selectMenu(): Promise<number> {
  let selected = 0;
  let buffer = "";
  let firstDraw = true;
  const options = ["Add skill", "Refine search", "Exit"];

  const draw = () => {
    const menuLines = [
      "What would you like to do?",
      "",
      "Use ↑↓ arrows and press Enter:",
      "",
    ];

    if (firstDraw) {
      process.stdout.write(menuLines.join("\n") + "\n\n");
      options.forEach((option, i) => {
        const mark = i === selected ? "▶️ " : "  ";
        const color = i === selected ? "\x1b[1;32m" : "";
        const reset = i === selected ? "\x1b[0m" : "";
        process.stdout.write(`${mark}${color}${i + 1}. ${option}${reset}\n`);
      });
      firstDraw = false;
    } else {
      for (let i = 0; i < 3; i++) {
        process.stdout.write("\x1b[A");
      }
      options.forEach((option, i) => {
        const mark = i === selected ? "▶️ " : "  ";
        const color = i === selected ? "\x1b[1;32m" : "";
        const reset = i === selected ? "\x1b[0m" : "";
        process.stdout.write(`\x1b[K${mark}${color}${i + 1}. ${option}${reset}\n`);
      });
    }
  };

  return new Promise((resolve) => {
    draw();
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const onData = (chunk: string) => {
      buffer += chunk;

      if (buffer === "\x1b[A") {
        selected = (selected - 1 + options.length) % options.length;
        draw();
        buffer = "";
      } else if (buffer === "\x1b[B") {
        selected = (selected + 1) % options.length;
        draw();
        buffer = "";
      } else if (buffer === "\r" || buffer === "\n") {
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        resolve(selected);
        buffer = "";
      } else if (buffer === "\x03") {
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.exit(0);
      }

      if (buffer.length > 3) buffer = "";
    };

    process.stdin.on("data", onData);
  });
}

function promptText(question: string): Promise<string> {
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

async function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit" });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}

export class RecommendCommand extends BaseCommand {
  static override paths = [
    ["recommend", "skill"],
    ["add", "skill"],
  ];

  static override usage = BaseCommand.Usage({
    category: "Skills",
    description: "Recommend and install skills based on your project context.",
    examples: [
      ["Recommend based on context only", "bgng recommend skill"],
      ["Recommend skills for a topic", "bgng recommend skill testing"],
      ["Recommend skills in a specific repo", "bgng recommend skill --repo /path/to/repo testing"],
      ["Add a skill directly", "bgng add skill jest"],
    ],
  });

  repo?: string = Option.String("--repo", process.cwd(), {
    description: "Path to the repository to analyze",
  });

  // Positional arguments - first element is "recommend"/"add", second is "skill", rest is query/skillId
  query: string[] = Option.Rest();

  async execute() {
    const mode = this.path[0]; // "recommend" or "add"

    if (mode === "add") {
      const skillId = this.query.join(" ");
      if (!skillId) {
        this.context.stderr.write("Usage: bgng add skill <skill-id>\n");
        return 1;
      }

      this.context.stdout.write(`\n⏳ Adding skill: ${skillId}...\n\n`);
      try {
        await runCommand("npx", ["skills", "add", skillId]);
        this.context.stdout.write(`✅ Skill added successfully!\n\n`);
      } catch (error) {
        this.context.stdout.write(`📝 To add manually, run:\n\n   npx skills add ${skillId}\n\n`);
      }
      return 0;
    }

    // recommend mode
    let currentQuery = this.query.join(" ");
    if (!currentQuery) {
      // No query provided - recommend based on project context only
      this.context.stdout.write(`\n📚 Generating recommendations based on your project context...\n`);
    }

    this.context.stdout.write("");

    while (true) {
      const skills = await searchSkills(currentQuery, this.repo);

      if (!skills) {
        return 1;
      }

      if (skills.length === 0) {
        this.context.stdout.write("No skills found. Try a different search.\n\n");
        return 0;
      }

      const choice = await selectMenu();

      switch (choice) {
        case 0:
          // Add skill
          const selected = await selectWithArrows(
            skills,
            (skill) => skill.name
          );

          if (selected) {
            this.context.stdout.write(`⏳ Adding skill...\n\n`);
            try {
              await runCommand("npx", ["skills", "add", selected.id]);
              this.context.stdout.write(`✅ Skill added successfully!\n\n`);
            } catch (error) {
              this.context.stdout.write(`📝 To add manually, run:\n\n   npx skills add ${selected.id}\n\n`);
            }
          }
          return 0;

        case 1:
          // Refine search
          const newQuery = await promptText("Enter new search query: ");
          if (newQuery) {
            currentQuery = newQuery;
            this.context.stdout.write("");
          } else {
            this.context.stdout.write("Query cannot be empty.\n\n");
          }
          break;

        case 2:
          return 0;
      }
    }
  }
}
