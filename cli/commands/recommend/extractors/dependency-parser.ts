// ABOUTME: Collects installed package names from common language manifests.
// ABOUTME: Supports duplicate filtering without requiring external package managers.

import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { readJsonFile, readTextFile, uniqueSorted } from "./file-utils";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export async function parseExistingPackages(repoPath: string): Promise<string[]> {
  const packageSets = await Promise.all([
    parsePackageJson(repoPath),
    parsePyproject(repoPath),
    parseGemfile(repoPath),
    parseCargoToml(repoPath),
    parseGoMod(repoPath),
  ]);

  return uniqueSorted(packageSets.flat());
}

async function parsePackageJson(repoPath: string): Promise<string[]> {
  const pkg = await readJsonFile<PackageJson>(join(repoPath, "package.json"));
  if (!pkg) return [];
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ];
}

async function parsePyproject(repoPath: string): Promise<string[]> {
  const text = await readTextFile(join(repoPath, "pyproject.toml"));
  if (!text) return [];
  try {
    const parsed = parseToml(text) as Record<string, unknown>;
    const project = parsed["project"] as Record<string, unknown> | undefined;
    const poetry = (parsed["tool"] as Record<string, unknown> | undefined)?.["poetry"] as Record<string, unknown> | undefined;
    return [
      ...normalizePythonDependencies(project?.["dependencies"]),
      ...Object.keys(asRecord(poetry?.["dependencies"])),
      ...Object.keys(asRecord(poetry?.["dev-dependencies"])),
    ].filter((name) => name.toLowerCase() !== "python");
  } catch {
    return [];
  }
}

async function parseGemfile(repoPath: string): Promise<string[]> {
  const text = await readTextFile(join(repoPath, "Gemfile"));
  if (!text) return [];
  return [...text.matchAll(/^\s*gem\s+["']([^"']+)["']/gm)].map((match) => match[1] ?? "");
}

async function parseCargoToml(repoPath: string): Promise<string[]> {
  const text = await readTextFile(join(repoPath, "Cargo.toml"));
  if (!text) return [];
  try {
    const parsed = parseToml(text) as Record<string, unknown>;
    return [
      ...Object.keys(asRecord(parsed["dependencies"])),
      ...Object.keys(asRecord(parsed["dev-dependencies"])),
      ...Object.keys(asRecord(parsed["build-dependencies"])),
    ];
  } catch {
    return [];
  }
}

async function parseGoMod(repoPath: string): Promise<string[]> {
  const text = await readTextFile(join(repoPath, "go.mod"));
  if (!text) return [];
  const packages: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed === "require (") continue;
    const match = trimmed.match(/^(?:require\s+)?([^\s]+)\s+v/);
    if (match?.[1]) packages.push(match[1]);
  }
  return packages;
}

function normalizePythonDependencies(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.split(/[<>=~!;\[]/, 1)[0]?.trim() ?? "")
    .filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
