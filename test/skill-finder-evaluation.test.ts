// ABOUTME: Verifies skill finder command wrapping, output parsing, and aggregation.
// ABOUTME: Covers Phase 1 candidate preservation without relying on networked npm.

import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { aggregateSkills } from "../cli/commands/recommend/skill-aggregator";
import { findSkills, parseSkillFinderOutput } from "../cli/commands/recommend/skill-finder";
import type { Skill } from "../cli/commands/recommend/types";
import { cleanupTempRoots, createExecutable, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("skill finder", () => {
  test("parses JSON skill results with relevance scores", () => {
    const skills = parseSkillFinderOutput(
      JSON.stringify({
        results: [
          { id: "frontend-design", title: "Frontend Design", score: 0.8 },
          { id: "test-browser", name: "Browser Testing", relevanceScore: 0.9 },
        ],
      }),
    );

    expect(skills.map((skill) => skill.id)).toEqual(["test-browser", "frontend-design"]);
    expect(skills[0]?.relevanceScore).toBe(0.9);
  });

  test("shells out through npx skills find and returns the top five scored skills", async () => {
    const root = await createTempRoot("skill-finder-");
    tempRoots.push(root);
    const binDir = join(root, "bin");
    await createExecutable(
      binDir,
      "npx",
      `printf '%s' '[{"id":"a","name":"A","score":0.1},{"id":"b","name":"B","score":0.9},{"id":"c","name":"C","score":0.8},{"id":"d","name":"D","score":0.7},{"id":"e","name":"E","score":0.6},{"id":"f","name":"F","score":0.5}]'`,
    );

    const skills = await findSkills("frontend testing", { env: { PATH: binDir } });

    expect(skills).toHaveLength(5);
    expect(skills.map((skill) => skill.id)).toEqual(["b", "c", "d", "e", "f"]);
  });

  test("returns an empty array when skill finder command fails", async () => {
    const root = await createTempRoot("skill-finder-fail-");
    tempRoots.push(root);
    const binDir = join(root, "bin");
    await createExecutable(binDir, "npx", "exit 17");

    await expect(findSkills("missing", { env: { PATH: binDir } })).resolves.toEqual([]);
  });

  test("returns an empty array when skill finder command times out", async () => {
    const root = await createTempRoot("skill-finder-timeout-");
    tempRoots.push(root);
    const binDir = join(root, "bin");
    await createExecutable(binDir, "npx", "sleep 2");

    const startedAt = performance.now();
    await expect(findSkills("slow", { env: { PATH: binDir }, timeoutMs: 50 })).resolves.toEqual([]);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });
});

describe("skill aggregation", () => {
  test("deduplicates by id, keeps highest relevance score, and sorts descending", () => {
    const skillsByQuery = new Map<string, Skill[]>([
      [
        "query-a",
        [
          { id: "alpha", name: "Alpha", relevanceScore: 0.4 },
          { id: "beta", name: "Beta", relevanceScore: 0.7 },
        ],
      ],
      [
        "query-b",
        [
          { id: "alpha", name: "Alpha Better", relevanceScore: 0.9 },
          { id: "gamma", name: "Gamma", relevanceScore: 0.5 },
        ],
      ],
    ]);

    const aggregated = aggregateSkills(skillsByQuery);

    expect(aggregated.map((skill) => skill.id)).toEqual(["alpha", "beta", "gamma"]);
    expect(aggregated[0]).toMatchObject({ id: "alpha", name: "Alpha Better", relevanceScore: 0.9 });
  });

  test("targets 20-30 skills by capping aggregated candidates at 30", () => {
    const skillsByQuery = new Map<string, Skill[]>(
      Array.from({ length: 7 }, (_, queryIndex) => [
        `query-${queryIndex}`,
        Array.from({ length: 5 }, (_, skillIndex) => ({
          id: `skill-${queryIndex}-${skillIndex}`,
          name: `Skill ${queryIndex}-${skillIndex}`,
          relevanceScore: 1 - (queryIndex * 5 + skillIndex) / 100,
        })),
      ]),
    );

    expect(aggregateSkills(skillsByQuery)).toHaveLength(30);
  });

  test("filters skills that match existing packages case-insensitively", () => {
    let filteredCount = 0;
    const aggregated = aggregateSkills(
      {
        query: [
          { id: "react", name: "React", relevanceScore: 1 },
          { id: "testing-library", name: "Testing Library", relevanceScore: 0.9 },
        ],
      },
      30,
      {
        existingPackages: ["react"],
        onFiltered: (count) => {
          filteredCount = count;
        },
      },
    );

    expect(aggregated.map((skill) => skill.id)).toEqual(["testing-library"]);
    expect(filteredCount).toBe(1);
  });
});
