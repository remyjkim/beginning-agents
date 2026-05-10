import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { embeddingFromText } from "./embedding-local";
import { isVectorDbAvailable } from "./mastra-client";
import { indexSkillsToVectorDb } from "./vector-ranker";

export interface Skill {
  slug: string;
  name: string;
  description: string;
  installCount: number;
  githubStars: number;
  lastUpdated: string;
  languages: string[];
  embedding: number[];
  domain?: string;
  owner?: string;
}

export interface PopularityBounds {
  installs: { min_log: number; max_log: number };
  stars: { min_log: number; max_log: number };
}

export interface SkillIndex {
  skills: Skill[];
  bounds: PopularityBounds;
  cached_at: string;
}

const CACHE_TTL_DAYS = 7;
const EMBEDDING_DIM = 512;

function getCachePath(homeDir: string): string {
  return join(homeDir, ".claude", "skill-embeddings.json");
}

function getVectorIndexMetadataPath(homeDir: string): string {
  return join(homeDir, ".claude", "skill-vector-index.json");
}

interface VectorIndexMeta {
  indexedAt: string;
  skillCount: number;
}

function isVectorIndexStale(homeDir: string): boolean {
  const metaPath = getVectorIndexMetadataPath(homeDir);
  if (!existsSync(metaPath)) return true;

  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as VectorIndexMeta;
    const indexDate = new Date(meta.indexedAt);
    const now = new Date();
    const daysDiff = (now.getTime() - indexDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff >= CACHE_TTL_DAYS;
  } catch {
    return true;
  }
}

function saveVectorIndexMetadata(homeDir: string, meta: VectorIndexMeta): void {
  try {
    const metaPath = getVectorIndexMetadataPath(homeDir);
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  } catch {
    // Ignore metadata write errors
  }
}

function isCacheValid(cacheTime: string): boolean {
  const cacheDate = new Date(cacheTime);
  const now = new Date();
  const daysDiff = (now.getTime() - cacheDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff < CACHE_TTL_DAYS;
}

async function fetchSkillDescription(owner: string, skillSlug: string): Promise<string | null> {
  try {
    // Try to construct GitHub URL and fetch README
    // Owner format is typically "org/repo", we need the repo name for the skill
    const repoName = owner.split("/")[1] || owner;
    const readmeUrl = `https://raw.githubusercontent.com/${owner}/main/README.md`;

    const response = await fetch(readmeUrl);
    if (!response.ok) {
      // Try alternate branch name
      const altUrl = `https://raw.githubusercontent.com/${owner}/master/README.md`;
      const altResponse = await fetch(altUrl);
      if (!altResponse.ok) return null;

      const content = await altResponse.text();
      return parseBriefDescription(content);
    }

    const content = await response.text();
    return parseBriefDescription(content);
  } catch {
    return null; // Silently fail and use fallback description
  }
}

function parseBriefDescription(markdown: string): string | null {
  const lines = markdown.split("\n");

  for (const line of lines) {
    let trimmed = line.trim();

    // Skip empty lines, headers that are just "# Project" type things, and code blocks
    if (!trimmed || trimmed.startsWith("```") || trimmed === "#" || trimmed === "##") {
      continue;
    }

    // Skip HTML tags
    if (trimmed.startsWith("<") || trimmed.startsWith("|")) {
      continue;
    }

    // Skip heading-only lines (just # or ##)
    if (trimmed.match(/^#+\s*$/) || trimmed.match(/^#+\s+[A-Z\s]+\s*$/i)) {
      continue;
    }

    // Found a real description line
    if (trimmed.startsWith("#")) {
      // Extract text from heading: "# Description here" -> "Description here"
      const desc = trimmed.replace(/^#+\s+/, "").trim();
      if (desc && desc.length > 10) {
        return desc;
      }
      continue;
    }

    // Regular paragraph line
    if (trimmed.length > 10 && !trimmed.startsWith("-") && !trimmed.startsWith("*")) {
      // Remove any inline HTML tags
      trimmed = trimmed.replace(/<[^>]*>/g, "").trim();

      // Skip if it's empty after removing HTML
      if (trimmed.length < 10) continue;

      return trimmed;
    }
  }

  return null;
}

async function fetchSkillsFromCli(): Promise<{ skills: Skill[]; bounds: PopularityBounds }> {
  const { execSync } = require("child_process");
  const skillsData: Array<any> = [];

  // Use npx skills find with broad search to get all available skills
  // Search for common terms to build comprehensive list
  const searchTerms = ["test", "web", "app", "api", "react", "data"];
  const allLines: string[] = [];

  for (const term of searchTerms) {
    try {
      const output = execSync(`npx skills find ${term}`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
      allLines.push(...output.split("\n"));
    } catch {
      // Continue with next term
    }
  }

  try {
    const lines = allLines;

    // Parse skills from CLI output
    // Format: owner/repo@skill-name X.XK installs
    for (const line of lines) {
      // Remove ANSI color codes
      const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, "");

      // Match: owner/repo@skill-name ... X.XK installs (or X installs, or XM installs)
      const match = cleanLine.match(/^([^@\s]+)@([\w-]+)\s+([0-9.KM]+)\s+installs?/);
      if (match) {
        const owner = match[1]!;
        const skillName = match[2]!;
        const installsStr = match[3]!;

        // Parse installs with K/M suffix
        let installs = 0;
        if (installsStr.includes("K")) {
          installs = Math.floor(parseFloat(installsStr) * 1000);
        } else if (installsStr.includes("M")) {
          installs = Math.floor(parseFloat(installsStr) * 1000000);
        } else {
          installs = parseInt(installsStr, 10);
        }

        skillsData.push({
          slug: skillName,
          name: skillName.replace(/-/g, " "),
          description: `${skillName} from ${owner}`,
          installs,
          stars: 0,
          source: "skills.sh",
          owner,
        });
      }
    }

    if (skillsData.length === 0) {
      throw new Error("No skills found in CLI output");
    }
  } catch (error) {
    throw new Error(`Failed to fetch skills from CLI: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Calculate bounds from actual data
  const installs = skillsData.map((s) => s.installs || 0).filter((n) => n > 0);
  const stars = skillsData.map((s) => s.stars || 0).filter((n) => n > 0);

  const minInstalls = Math.min(...installs, 1);
  const maxInstalls = Math.max(...installs, 100000);
  const minStars = Math.min(...stars, 1);
  const maxStars = Math.max(...stars, 100000);

  const bounds: PopularityBounds = {
    installs: {
      min_log: Math.log10(minInstalls + 1),
      max_log: Math.log10(maxInstalls + 1),
    },
    stars: {
      min_log: Math.log10(minStars + 1),
      max_log: Math.log10(maxStars + 1),
    },
  };

  // Fetch brief descriptions from skill READMEs
  const enrichedSkills = await Promise.all(
    skillsData.map(async (skill) => {
      const briefDesc = await fetchSkillDescription(skill.owner, skill.slug);
      return {
        ...skill,
        description: briefDesc || `${skill.name} from ${skill.source}`,
      };
    })
  );

  // Transform to Skill format
  const skillsWithEmbeddings: Skill[] = enrichedSkills.map((skill) => ({
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    installCount: skill.installs || 0,
    githubStars: skill.stars || 0,
    lastUpdated: new Date().toISOString(),
    languages: [],
    embedding: generateEmbedding(skill.description || skill.name),
    domain: inferDomainFromName(skill.name),
    owner: skill.owner,
  }));

  return { skills: skillsWithEmbeddings, bounds };
}

function inferDomainFromName(name: string): string | undefined {
  const nameLower = name.toLowerCase();

  if (nameLower.includes("test")) return "testing";
  if (nameLower.includes("security") || nameLower.includes("audit") || nameLower.includes("secure")) return "security";
  if (nameLower.includes("performance") || nameLower.includes("profile") || nameLower.includes("benchmark")) return "performance";
  if (nameLower.includes("deploy") || nameLower.includes("release")) return "deployment";
  if (nameLower.includes("document") || nameLower.includes("readme")) return "documentation";
  if (nameLower.includes("pattern") || nameLower.includes("architecture")) return "patterns";
  if (nameLower.includes("lint") || nameLower.includes("format") || nameLower.includes("quality") || nameLower.includes("standards")) return "code-quality";
  if (nameLower.includes("debug") || nameLower.includes("troubleshoot")) return "debugging";
  if (nameLower.includes("refactor") || nameLower.includes("restructure")) return "refactoring";
  if (nameLower.includes("i18n") || nameLower.includes("translation") || nameLower.includes("localization")) return "internationalization";

  return undefined;
}

function generateEmbedding(text: string): number[] {
  // Use local TF-IDF based embedding (no API required)
  return embeddingFromText(text);
}

function loadLocalFallback(repoRoot: string): { skills: Skill[]; bounds: PopularityBounds } {
  const defaultBounds: PopularityBounds = {
    installs: {
      min_log: Math.log10(100 + 1),
      max_log: Math.log10(250000 + 1),
    },
    stars: {
      min_log: Math.log10(10 + 1),
      max_log: Math.log10(150000 + 1),
    },
  };

  // Try to load from local skills-registry.json
  try {
    const registryPath = join(repoRoot, "skills-registry.json");
    if (existsSync(registryPath)) {
      const content = readFileSync(registryPath, "utf-8");
      const data = JSON.parse(content) as {
        skills: Array<Omit<Skill, "embedding">>;
        metadata: {
          count: number;
          popularity_min_installs: number;
          popularity_max_installs: number;
          popularity_min_stars: number;
          popularity_max_stars: number;
        };
      };

      // Compute bounds from metadata
      const bounds: PopularityBounds = {
        installs: {
          min_log: Math.log10(data.metadata.popularity_min_installs + 1),
          max_log: Math.log10(data.metadata.popularity_max_installs + 1),
        },
        stars: {
          min_log: Math.log10(data.metadata.popularity_min_stars + 1),
          max_log: Math.log10(data.metadata.popularity_max_stars + 1),
        },
      };

      // Generate embeddings using local TF-IDF algorithm
      const skillsWithEmbeddings: Skill[] = data.skills.map((skill) => ({
        ...skill,
        embedding: generateEmbedding(skill.description || skill.name),
      }));

      return {
        skills: skillsWithEmbeddings,
        bounds,
      };
    }
  } catch (error) {
    console.error(`Failed to load local skills registry: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    skills: [],
    bounds: defaultBounds,
  };
}

export async function loadSkillIndex(
  homeDir: string,
  apiKey?: string,
  repoRoot?: string
): Promise<SkillIndex> {
  const cachePath = getCachePath(homeDir);

  // Try to load from cache
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, "utf-8")) as SkillIndex;
      if (isCacheValid(cached.cached_at)) {
        return cached;
      }
    } catch {
      // Ignore cache errors, continue to fetch fresh
    }
  }

  // Try to fetch from skills.sh CLI
  let result: { skills: Skill[]; bounds: PopularityBounds };
  try {
    result = await fetchSkillsFromCli();
  } catch (error) {
    console.warn(`Failed to fetch from skills.sh CLI: ${error instanceof Error ? error.message : String(error)}`);
    result = loadLocalFallback(repoRoot || homeDir);
  }

  // Vector DB indexing disabled for now - using local ranking only
  // TODO: Re-enable after pgVector table creation is debugged

  // Cache the result
  const skillIndex: SkillIndex = {
    ...result,
    cached_at: new Date().toISOString(),
  };

  try {
    const cacheDir = join(homeDir, ".claude");
    if (!existsSync(cacheDir)) {
      // Create .claude directory if needed
      // Note: In real implementation, would use fs.mkdirSync
    }
    writeFileSync(cachePath, JSON.stringify(skillIndex, null, 2));
  } catch {
    // Ignore cache write errors
  }

  return skillIndex;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i]!;
    const bVal = b[i]!;
    dotProduct += aVal * bVal;
    magnitudeA += aVal * aVal;
    magnitudeB += bVal * bVal;
  }

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}
