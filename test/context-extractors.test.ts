// ABOUTME: Verifies Phase 2 project-context extraction across representative repo fixtures.
// ABOUTME: Covers manifests, README summaries, language percentages, runtimes, and graceful fallbacks.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractProjectContext } from "../cli/commands/recommend/extractors";
import { parseExistingPackages } from "../cli/commands/recommend/extractors/dependency-parser";
import { detectFrameworks } from "../cli/commands/recommend/extractors/framework-detector";
import { detectLanguages } from "../cli/commands/recommend/extractors/language-detector";
import { parseReadmeSummary } from "../cli/commands/recommend/extractors/readme-parser";
import { detectRuntimes } from "../cli/commands/recommend/extractors/runtime-detector";
import { extractRecentSessionThemes } from "../cli/commands/recommend/extractors/session-log-extractor";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("project context extractors", () => {
  test("extracts TypeScript React context", async () => {
    const root = await fixture("ts-react", {
      "README.md": "# Shop UI\n\nA storefront dashboard for merchants.",
      "package.json": JSON.stringify({
        description: "fallback description",
        dependencies: { react: "^19.0.0", express: "^5.0.0" },
        devDependencies: { typescript: "^5.0.0", "@types/bun": "^1.0.0" },
      }),
      "bun.lock": "",
      "src/App.tsx": "export function App() { return null }",
      "src/server.ts": "export const server = true",
      "src/style.css": "body {}",
    });

    expect(await parseReadmeSummary(root)).toBe("Shop UI: A storefront dashboard for merchants.");
    expect(await detectFrameworks(root)).toEqual(["Express", "React"]);
    expect(await parseExistingPackages(root)).toEqual(["@types/bun", "express", "react", "typescript"]);
    expect(await detectRuntimes(root)).toEqual({ runtimes: ["Bun", "Node.js"], packageManagers: ["bun"] });
    expect(await detectLanguages(root)).toMatchObject({ TypeScript: 67, CSS: 33 });
  });

  test("extracts Python, Go, and mixed monorepo context", async () => {
    const root = await fixture("mixed", {
      "pyproject.toml": ['[project]', 'dependencies = ["django>=5", "fastapi"]'].join("\n"),
      "go.mod": ["module example.com/app", "go 1.22", "require github.com/gin-gonic/gin v1.10.0"].join("\n"),
      "Cargo.toml": ["[dependencies]", 'serde = "1"'].join("\n"),
      "app/main.py": "print('hi')",
      "cmd/api/main.go": "package main",
      "src/lib.rs": "pub fn run() {}",
    });

    expect(await detectFrameworks(root)).toEqual(["Django", "FastAPI", "Gin"]);
    expect(await parseExistingPackages(root)).toEqual(["django", "fastapi", "github.com/gin-gonic/gin", "serde"]);
    expect((await detectRuntimes(root)).runtimes).toEqual(["Go", "Python", "Rust"]);
    expect(Object.keys(await detectLanguages(root))).toEqual(["Go", "Python", "Rust"]);
  });

  test("falls back gracefully for minimal projects", async () => {
    const root = await fixture("minimal", {
      "package.json": JSON.stringify({ description: "Minimal package" }),
    });

    const context = await extractProjectContext(root);

    expect(context.readmeSummary).toBe("Minimal package");
    expect(context.languages).toEqual({});
    expect(context.frameworks).toEqual([]);
    expect(context.existingPackages).toEqual([]);
    expect(context.runtimes.runtimes).toEqual(["Node.js"]);
  });

  test("extracts recent session themes from JSONL logs", async () => {
    const root = await createTempRoot("session-logs-");
    tempRoots.push(root);
    await mkdir(join(root, "logs"), { recursive: true });
    await writeFile(
      join(root, "logs", "one.jsonl"),
      [
        JSON.stringify({ role: "user", content: "Need React testing help for an API component" }),
        JSON.stringify({ role: "assistant", content: [{ type: "tool_use", name: "Read" }] }),
        "{not json",
      ].join("\n"),
    );

    const themes = await extractRecentSessionThemes(join(root, "logs"));

    expect(themes).toContain("React");
    expect(themes).toContain("testing");
    expect(themes).toContain("API");
  });
});

async function fixture(name: string, files: Record<string, string>): Promise<string> {
  const root = await createTempRoot(`${name}-`);
  tempRoots.push(root);
  for (const [file, contents] of Object.entries(files)) {
    const path = join(root, file);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, contents);
  }
  return root;
}
