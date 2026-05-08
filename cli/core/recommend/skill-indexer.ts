import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

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

function isCacheValid(cacheTime: string): boolean {
  const cacheDate = new Date(cacheTime);
  const now = new Date();
  const daysDiff = (now.getTime() - cacheDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff < CACHE_TTL_DAYS;
}

async function fetchSkillsFromApi(apiKey?: string): Promise<{ skills: Skill[]; bounds: PopularityBounds }> {
  const skillsData: Array<any> = [];
  let page = 1;
  const pageSize = 50;
  let hasMore = true;

  // Fetch paginated skills from the leaderboard
  while (hasMore && page <= 10) {
    // Limit to 10 pages (500 skills) to avoid excessive requests
    const url = `https://skills.sh/api/v1/skills?page=${page}&limit=${pageSize}`;
    const headers: Record<string, string> = {
      "Accept": "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Skills API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      skills: Array<{
        id: string;
        slug: string;
        name: string;
        source: string;
        installs: number;
        stars?: number;
        url: string;
        description?: string;
      }>;
      pagination?: {
        page: number;
        limit: number;
        total: number;
      };
    };

    if (!data.skills || data.skills.length === 0) {
      hasMore = false;
      break;
    }

    skillsData.push(...data.skills);

    // Check if there are more pages
    if (data.pagination) {
      const totalPages = Math.ceil(data.pagination.total / data.pagination.limit);
      hasMore = page < totalPages;
    } else {
      hasMore = data.skills.length === pageSize;
    }

    page++;
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

  // Transform to Skill format
  const skillsWithEmbeddings: Skill[] = await Promise.all(
    skillsData.map(async (skill) => ({
      slug: skill.slug,
      name: skill.name,
      description: skill.description || `${skill.name} from ${skill.source}`,
      installCount: skill.installs || 0,
      githubStars: skill.stars || 0,
      lastUpdated: new Date().toISOString(), // API doesn't provide this, use current date
      languages: [], // API doesn't provide, will be inferred from domain
      embedding: await generateEmbedding(skill.description || skill.name),
      domain: inferDomainFromName(skill.name),
    }))
  );

  return { skills: skillsWithEmbeddings, bounds };
}

function inferDomainFromName(name: string): string | undefined {
  const nameLower = name.toLowerCase();

  if (nameLower.includes("test")) return "testing";
  if (nameLower.includes("security") || nameLower.includes("audit")) return "security";
  if (nameLower.includes("performance") || nameLower.includes("profile")) return "performance";
  if (nameLower.includes("deploy")) return "deployment";
  if (nameLower.includes("document")) return "documentation";
  if (nameLower.includes("pattern")) return "patterns";
  if (nameLower.includes("lint") || nameLower.includes("format") || nameLower.includes("quality"))
    return "code-quality";
  if (nameLower.includes("debug")) return "debugging";
  if (nameLower.includes("refactor")) return "refactoring";
  if (nameLower.includes("i18n") || nameLower.includes("translation")) return "internationalization";

  return undefined;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const mastraKey = process.env.MASTRA_API_KEY;

  if (!mastraKey) {
    // Mock embedding for now - in production would call Mastra AI
    return Array(EMBEDDING_DIM).fill(0).map(() => Math.random() * 2 - 1);
  }

  try {
    // TODO: Call actual Mastra AI API when available
    // For now, return mock embedding
    return Array(EMBEDDING_DIM).fill(0).map(() => Math.random() * 2 - 1);
  } catch {
    // Fallback to random embedding on error
    return Array(EMBEDDING_DIM).fill(0).map(() => Math.random() * 2 - 1);
  }
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

      // Add mock embeddings (will be replaced by real Mastra AI)
      const skillsWithEmbeddings: Skill[] = data.skills.map((skill) => ({
        ...skill,
        embedding: Array(EMBEDDING_DIM).fill(0).map(() => Math.random() * 2 - 1),
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

  // Try to fetch from API (requires API key for real skills.sh access)
  let result: { skills: Skill[]; bounds: PopularityBounds };
  if (apiKey) {
    try {
      result = await fetchSkillsFromApi(apiKey);
    } catch (error) {
      console.warn(`Failed to fetch from Skills-API: ${error instanceof Error ? error.message : String(error)}`);
      result = loadLocalFallback(repoRoot || homeDir);
    }
  } else {
    // No API key - use local fallback
    result = loadLocalFallback(repoRoot || homeDir);
  }

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
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}
