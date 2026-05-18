// ABOUTME: Evaluates query generation against the Phase 1 sample query set.
// ABOUTME: Protects context-aware query output, distinct angles, fallback, and prompt wiring.

import { describe, expect, test } from "bun:test";
import sampleQueries from "./sample-queries.json";
import { buildQueryGeneratorPrompt, QUERY_GENERATOR_SYSTEM_PROMPT } from "../cli/commands/recommend/prompts";
import { coerceQueryList, fallbackQueries, generateQueries } from "../cli/commands/recommend/query-generator";
import type { MastraTextClient } from "../cli/commands/recommend/types";

describe("query generator", () => {
  test("system prompt constrains Mastra to three context-aware strategies", () => {
    expect(QUERY_GENERATOR_SYSTEM_PROMPT).toContain("EXACTLY 3");
    expect(QUERY_GENERATOR_SYSTEM_PROMPT).toContain("Library or package names");
    expect(QUERY_GENERATOR_SYSTEM_PROMPT).toContain("Problem-solution wording");
    expect(QUERY_GENERATOR_SYSTEM_PROMPT).toContain("Pattern, framework, or use cases");
    expect(QUERY_GENERATOR_SYSTEM_PROMPT).toContain("NEVER recommend packages");
    expect(QUERY_GENERATOR_SYSTEM_PROMPT).toContain("Consider recent work themes");
  });

  test("calls Mastra-compatible client and returns three refined queries with context", async () => {
    const calls: Array<{ system: string; prompt: string }> = [];
    const client: MastraTextClient = {
      async generateText(input) {
        calls.push({ system: input.system, prompt: input.prompt });
        return JSON.stringify([
          "react hooks library",
          "react state problem solution",
          "custom hook workflow pattern",
        ]);
      },
    };

    const output = await generateQueries(
      {
        query: "find react hook",
        context: {
          readmeSummary: "React app",
          languages: { TypeScript: 100 },
          frameworks: ["React"],
          runtimes: { runtimes: ["Node.js"], packageManagers: ["bun"] },
          existingPackages: ["react"],
          recentSessionThemes: ["testing"],
        },
      },
      { client },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).toBe(QUERY_GENERATOR_SYSTEM_PROMPT);
    expect(calls[0]?.prompt).toContain("find react hook");
    expect(calls[0]?.prompt).toContain("Existing packages (DO NOT recommend): react");
    expect(output.refinedQueries).toHaveLength(3);
    expect(new Set(output.refinedQueries.map((query) => query.toLowerCase())).size).toBe(3);
  });

  test("uses fallback queries when Mastra fails", async () => {
    const client: MastraTextClient = {
      async generateText() {
        throw new Error("provider unavailable");
      },
    };

    const output = await generateQueries({ query: "database migrations" }, { client });

    expect(output.refinedQueries).toEqual(fallbackQueries("database migrations"));
  });

  test("coerces fenced JSON responses from real providers", () => {
    const output = coerceQueryList(
      [
        "```json",
        "[",
        '  "React Hook libraries for state management",',
        '  "How to use React Hooks for form handling",',
        '  "Popular React patterns with Hooks"',
        "]",
        "```",
      ].join("\n"),
      "find react hook",
    );

    expect(output).toEqual([
      "React Hook libraries for state management",
      "How to use React Hooks for form handling",
      "Popular React patterns with Hooks",
    ]);
  });

  test("sample set produces three distinct queries for at least 80 percent of cases", async () => {
    let successes = 0;
    for (const sample of sampleQueries) {
      const output = await generateQueries({ query: sample.query });
      const uniqueCount = new Set(output.refinedQueries.map((query) => query.toLowerCase())).size;
      if (output.refinedQueries.length === 3 && uniqueCount === 3) {
        successes += 1;
      }
    }

    expect(successes / sampleQueries.length).toBeGreaterThanOrEqual(0.8);
  });

  test("builds a prompt that includes project context fields", () => {
    const prompt = buildQueryGeneratorPrompt("testing", {
      readmeSummary: "Harness CLI",
      languages: { TypeScript: 90, Shell: 10 },
      frameworks: ["React"],
      runtimes: { runtimes: ["Bun", "Node.js"], packageManagers: ["bun"] },
      existingPackages: ["react", "typescript"],
      recentSessionThemes: ["testing", "CLI"],
    });

    expect(prompt).toContain("Languages: TypeScript: 90%, Shell: 10%");
    expect(prompt).toContain("Frameworks: React");
    expect(prompt).toContain("Runtimes: Bun, Node.js");
    expect(prompt).toContain("Recent work themes: testing, CLI");
  });
});
