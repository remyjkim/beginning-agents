import { readdirSync, statSync } from "fs";
import { join } from "path";

export interface LanguageDetection {
  languages: Record<string, number>;
  primary?: string;
  confidence: "high" | "medium" | "low" | "none";
}

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".cs": "C#",
  ".cpp": "C++",
  ".c": "C",
  ".h": "C",
  ".hpp": "C++",
  ".rb": "Ruby",
  ".php": "PHP",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".scala": "Scala",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".toml": "TOML",
  ".xml": "XML",
  ".html": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".less": "LESS",
};

const SKIP_DIRS = new Set([
  "node_modules",
  "build",
  "dist",
  ".git",
  "vendor",
  "__pycache__",
  "target",
  ".next",
  ".venv",
  "venv",
  ".gradle",
  ".m2",
  ".cargo",
  "coverage",
  ".nyc_output",
  ".turbo",
]);

function isSkippable(dirName: string): boolean {
  return SKIP_DIRS.has(dirName) || dirName.startsWith(".");
}

function walkDir(dir: string, fileExtensions: Map<string, number>, maxDepth: number = 3, currentDepth: number = 0): void {
  if (currentDepth > maxDepth) return;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!isSkippable(entry.name)) {
          walkDir(fullPath, fileExtensions, maxDepth, currentDepth + 1);
        }
      } else if (entry.isFile()) {
        const ext = entry.name.substring(entry.name.lastIndexOf(".")).toLowerCase();
        if (ext && LANGUAGE_EXTENSIONS[ext]) {
          fileExtensions.set(ext, (fileExtensions.get(ext) ?? 0) + 1);
        }
      }
    }
  } catch {
    // Ignore permission errors and continue
  }
}

export function detectLanguages(repoRoot: string): LanguageDetection {
  const fileExtensions = new Map<string, number>();
  walkDir(repoRoot, fileExtensions);

  const languages: Record<string, number> = {};
  let totalFiles = 0;

  for (const [ext, count] of fileExtensions.entries()) {
    const lang = LANGUAGE_EXTENSIONS[ext];
    if (lang) {
      languages[lang] = (languages[lang] ?? 0) + count;
      totalFiles += count;
    }
  }

  if (totalFiles === 0) {
    return {
      languages: {},
      confidence: "none",
    };
  }

  // Calculate percentages and sort by count
  const sorted = Object.entries(languages)
    .map(([lang, count]) => ({
      language: lang,
      count,
      percent: Math.round((count / totalFiles) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const languagePercentages: Record<string, number> = {};
  for (const { language, percent } of sorted) {
    languagePercentages[language] = percent;
  }

  const confidence: LanguageDetection["confidence"] =
    totalFiles > 100 ? "high" : totalFiles >= 10 ? "medium" : "low";

  return {
    languages: languagePercentages,
    primary: sorted[0]?.language,
    confidence,
  };
}

export function formatLanguageDetection(detection: LanguageDetection): string {
  if (detection.confidence === "none") {
    return "[No detectable source files in project]";
  }

  const entries = Object.entries(detection.languages)
    .sort(([, a], [, b]) => b - a)
    .map(([lang, percent]) => `${lang} (${percent}%)`)
    .join(", ");

  return `[Detected: ${entries}]`;
}
