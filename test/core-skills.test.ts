// ABOUTME: Verifies the extracted skill curation and sync helpers for the agents CLI core.
// ABOUTME: Keeps shared-skill publication semantics stable while commands are added on top.

import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-core-skills-"));
  tempRoots.push(root);
  return root;
}

describe("core skills", () => {
  test("listSkillsByScope returns repo skills across all four scopes", async () => {
    const root = await createTempRoot();
    const sharedPath = join(root, "skills", "shared", "alpha");
    const experimentalPath = join(root, "skills", "experimental", "beta");

    await mkdir(sharedPath, { recursive: true });
    await mkdir(experimentalPath, { recursive: true });
    await writeFile(join(sharedPath, "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
    await writeFile(join(experimentalPath, "SKILL.md"), "---\nname: beta\ndescription: beta\n---\n");

    const { listSkillsByScope } = await import("../cli/core/skills");
    const result = await listSkillsByScope(root);

    expect(result.shared.map((skill) => skill.name)).toContain("alpha");
    expect(result.experimental.map((skill) => skill.name)).toContain("beta");
  });

  test("curateSkill creates an agents-layer symlink for a shared skill", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    const sharedPath = join(root, "skills", "shared", "alpha");
    const curatedPath = join(agentsDir, "skills", "alpha");

    await mkdir(sharedPath, { recursive: true });
    await mkdir(dirname(curatedPath), { recursive: true });
    await writeFile(join(sharedPath, "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");

    const { curateSkill } = await import("../cli/core/skills");
    await curateSkill({ repoRoot: root, agentsDir }, "alpha");

    expect((await lstat(curatedPath)).isSymbolicLink()).toBe(true);
    expect(await realpath(curatedPath)).toBe(await realpath(sharedPath));
  });

  test("uncurateSkill removes an agents-layer symlink", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    const sharedPath = join(root, "skills", "shared", "alpha");
    const curatedPath = join(agentsDir, "skills", "alpha");

    await mkdir(sharedPath, { recursive: true });
    await mkdir(dirname(curatedPath), { recursive: true });
    await writeFile(join(sharedPath, "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
    await symlink(sharedPath, curatedPath, "dir");

    const { uncurateSkill } = await import("../cli/core/skills");
    await uncurateSkill({ agentsDir }, "alpha");

    await expect(lstat(curatedPath)).rejects.toThrow();
  });

  test("uncurateSkill throws for skill that is not curated", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    await mkdir(join(agentsDir, "skills"), { recursive: true });

    const { uncurateSkill } = await import("../cli/core/skills");
    await expect(uncurateSkill({ agentsDir }, "not-curated")).rejects.toThrow();
  });
});

describe("skill name validation", () => {
  test("rejects names with path separators", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    await mkdir(join(agentsDir, "skills"), { recursive: true });

    const { curateSkill } = await import("../cli/core/skills");
    await expect(curateSkill({ repoRoot: root, agentsDir }, "../../../etc/passwd")).rejects.toThrow();
    await expect(curateSkill({ repoRoot: root, agentsDir }, "foo/bar")).rejects.toThrow();
    await expect(curateSkill({ repoRoot: root, agentsDir }, "foo\\bar")).rejects.toThrow();
  });

  test("rejects names that are '.' or '..'", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    await mkdir(join(agentsDir, "skills"), { recursive: true });

    const { curateSkill } = await import("../cli/core/skills");
    await expect(curateSkill({ repoRoot: root, agentsDir }, "..")).rejects.toThrow();
    await expect(curateSkill({ repoRoot: root, agentsDir }, ".")).rejects.toThrow();
  });
});
