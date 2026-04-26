// ABOUTME: Verifies package-backed skill bundle validation, discovery, and ingestion behavior.
// ABOUTME: Protects the npm-pack-based extension source model before command-layer wiring is added.

import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdtemp, mkdir, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
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
  const root = await mkdtemp(join(tmpdir(), "agents-core-skill-packages-"));
  tempRoots.push(root);
  return root;
}

async function createBundleFixture(root: string, options?: { packageName?: string; version?: string; skillName?: string }) {
  const packageName = options?.packageName ?? "@acme/skills-sample";
  const version = options?.version ?? "1.0.0";
  const skillName = options?.skillName ?? "hello-skill";
  const bundleRoot = join(root, "bundle");
  const skillDir = join(bundleRoot, "skills", "shared", skillName);

  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(bundleRoot, "package.json"),
    JSON.stringify(
      {
        name: packageName,
        version,
        description: "fixture",
        license: "MIT",
        files: ["skills", "bundle.json", "README.md"],
        scripts: {
          prepack: "echo PREPACK_RAN > prepack-ran.txt",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(bundleRoot, "bundle.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        bundleName: packageName,
        version,
        skills: [
          {
            name: skillName,
            scope: "shared",
            path: `skills/shared/${skillName}`,
          },
        ],
      },
      null,
      2,
    ),
  );
  await writeFile(join(bundleRoot, "README.md"), "# fixture\n");
  await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skillName}\ndescription: fixture\n---\n`);

  return { bundleRoot, packageName, version, skillName };
}

describe("core skill packages", () => {
  test("loadBundleManifest parses a valid bundle manifest", async () => {
    const root = await createTempRoot();
    const { bundleRoot, packageName, version } = await createBundleFixture(root);

    const { loadBundleManifest } = await import("../cli/core/skill-packages");
    const manifest = await loadBundleManifest(bundleRoot);

    expect(manifest.bundleName).toBe(packageName);
    expect(manifest.version).toBe(version);
    expect(manifest.skills).toHaveLength(1);
  });

  test("loadBundleManifest rejects a missing manifest", async () => {
    const root = await createTempRoot();
    const bundleRoot = join(root, "bundle");
    await mkdir(bundleRoot, { recursive: true });

    const { loadBundleManifest } = await import("../cli/core/skill-packages");
    await expect(loadBundleManifest(bundleRoot)).rejects.toThrow(/bundle\.json/i);
  });

  test("validateBundleManifest rejects invalid skill paths", async () => {
    const root = await createTempRoot();
    const { bundleRoot, packageName, version } = await createBundleFixture(root);
    await writeFile(
      join(bundleRoot, "bundle.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          bundleName: packageName,
          version,
          skills: [{ name: "hello-skill", scope: "shared", path: "../escape" }],
        },
        null,
        2,
      ),
    );

    const { loadBundleManifest, validateBundleManifest } = await import("../cli/core/skill-packages");
    const manifest = await loadBundleManifest(bundleRoot);
    await expect(validateBundleManifest(bundleRoot, manifest, new Set(), packageName, version)).rejects.toThrow(/path/i);
  });

  test("validateBundleManifest rejects a missing SKILL.md", async () => {
    const root = await createTempRoot();
    const { bundleRoot, packageName, version, skillName } = await createBundleFixture(root);
    await rm(join(bundleRoot, "skills", "shared", skillName, "SKILL.md"), { force: true });

    const { loadBundleManifest, validateBundleManifest } = await import("../cli/core/skill-packages");
    const manifest = await loadBundleManifest(bundleRoot);
    await expect(validateBundleManifest(bundleRoot, manifest, new Set(), packageName, version)).rejects.toThrow(/SKILL\.md/i);
  });

  test("validateBundleManifest rejects colliding skill names", async () => {
    const root = await createTempRoot();
    const { bundleRoot, packageName, version } = await createBundleFixture(root, { skillName: "alpha" });

    const { loadBundleManifest, validateBundleManifest } = await import("../cli/core/skill-packages");
    const manifest = await loadBundleManifest(bundleRoot);
    await expect(validateBundleManifest(bundleRoot, manifest, new Set(["alpha"]), packageName, version)).rejects.toThrow(/collision/i);
  });

  test("listInstalledSkillBundles discovers installed bundles from the filesystem layout", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    const versionRoot = join(agentsDir, "packages", "skills", "@acme", "skills-sample", "1.0.0");
    await mkdir(versionRoot, { recursive: true });
    await writeFile(
      join(versionRoot, "bundle.json"),
      JSON.stringify({
        schemaVersion: 1,
        bundleName: "@acme/skills-sample",
        version: "1.0.0",
        skills: [],
      }),
    );
    await symlink("1.0.0", join(agentsDir, "packages", "skills", "@acme", "skills-sample", "current"));

    const { listInstalledSkillBundles } = await import("../cli/core/skill-packages");
    const bundles = await listInstalledSkillBundles(agentsDir);

    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.packageName).toBe("@acme/skills-sample");
    expect(bundles[0]?.activeVersion).toBe("1.0.0");
  });

  test("ingestSkillPackage packs, extracts, validates, and marks the current version", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    const { bundleRoot, packageName, version, skillName } = await createBundleFixture(root);

    const { ingestSkillPackage } = await import("../cli/core/skill-packages");
    const installed = await ingestSkillPackage({
      agentsDir,
      packageSpec: bundleRoot,
      existingSkillNames: new Set(),
    });

    expect(installed.packageName).toBe(packageName);
    expect(installed.activeVersion).toBe(version);
    expect(await readlink(join(agentsDir, "packages", "skills", "@acme", "skills-sample", "current"))).toBe(version);
    expect(await realpath(join(agentsDir, "packages", "skills", "@acme", "skills-sample", "current"))).toBe(
      await realpath(join(agentsDir, "packages", "skills", "@acme", "skills-sample", version)),
    );
    expect(
      await realpath(join(agentsDir, "packages", "skills", "@acme", "skills-sample", version, "skills", "shared", skillName, "SKILL.md")),
    ).toContain(`/@acme/skills-sample/${version}/skills/shared/${skillName}/SKILL.md`);
  });

  test("ingestSkillPackage suppresses local prepack scripts", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    const { bundleRoot } = await createBundleFixture(root);

    const { ingestSkillPackage } = await import("../cli/core/skill-packages");
    await ingestSkillPackage({
      agentsDir,
      packageSpec: bundleRoot,
      existingSkillNames: new Set(),
    });

    await expect(access(join(bundleRoot, "prepack-ran.txt"))).rejects.toThrow();
  });
});
