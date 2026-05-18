// ABOUTME: Detects language runtimes and package managers from common project files.
// ABOUTME: Avoids shelling out so runtime extraction is deterministic and fast.

import { join } from "node:path";
import { pathExists, readJsonFile } from "./file-utils";
import type { RuntimeDetection } from "../types";

interface PackageJson {
  packageManager?: string;
}

export async function detectRuntimes(repoPath: string): Promise<RuntimeDetection> {
  const [packageJson, bunLock, packageLock, yarnLock, pnpmLock, denoJson, pythonVersion, pyproject, goMod, gemfile, cargo] =
    await Promise.all([
      readJsonFile<PackageJson>(join(repoPath, "package.json")),
      pathExists(join(repoPath, "bun.lock")),
      pathExists(join(repoPath, "package-lock.json")),
      pathExists(join(repoPath, "yarn.lock")),
      pathExists(join(repoPath, "pnpm-lock.yaml")),
      pathExists(join(repoPath, "deno.json")),
      pathExists(join(repoPath, ".python-version")),
      pathExists(join(repoPath, "pyproject.toml")),
      pathExists(join(repoPath, "go.mod")),
      pathExists(join(repoPath, "Gemfile")),
      pathExists(join(repoPath, "Cargo.toml")),
    ]);

  const runtimes = new Set<string>();
  const packageManagers = new Set<string>();

  if (packageJson) runtimes.add("Node.js");
  if (bunLock || packageJson?.packageManager?.startsWith("bun")) {
    runtimes.add("Bun");
    packageManagers.add("bun");
  }
  if (packageLock || packageJson?.packageManager?.startsWith("npm")) packageManagers.add("npm");
  if (yarnLock || packageJson?.packageManager?.startsWith("yarn")) packageManagers.add("yarn");
  if (pnpmLock || packageJson?.packageManager?.startsWith("pnpm")) packageManagers.add("pnpm");
  if (denoJson) runtimes.add("Deno");
  if (pythonVersion || pyproject) {
    runtimes.add("Python");
    packageManagers.add("pip");
  }
  if (goMod) runtimes.add("Go");
  if (gemfile) {
    runtimes.add("Ruby");
    packageManagers.add("bundler");
  }
  if (cargo) {
    runtimes.add("Rust");
    packageManagers.add("cargo");
  }

  return {
    runtimes: [...runtimes].sort((a, b) => a.localeCompare(b)),
    packageManagers: [...packageManagers].sort((a, b) => a.localeCompare(b)),
  };
}
