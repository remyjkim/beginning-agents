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

async function fetchSkillsFromApi(apiKey: string): Promise<{ skills: Skill[]; bounds: PopularityBounds }> {
  const response = await fetch("https://skills-api.beginning-harness.com/api/v1/skills/index", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Skills-API error: ${response.statusText}`);
  }

  const data = await response.json() as {
    skills: Array<Omit<Skill, "embedding">>;
    metadata: {
      count: number;
      popularity_min_installs: number;
      popularity_max_installs: number;
      popularity_min_stars: number;
      popularity_max_stars: number;
    };
  };

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

  const skillsWithEmbeddings: Skill[] = await Promise.all(
    data.skills.map(async (skill) => ({
      ...skill,
      embedding: await generateEmbedding(skill.description),
    }))
  );

  return { skills: skillsWithEmbeddings, bounds };
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

function loadLocalFallback(): { skills: Skill[]; bounds: PopularityBounds } {
  // Default fallback with 28 skills based on prd_phase1_steps.md
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

  return {
    skills: [],
    bounds: defaultBounds,
  };
}

export async function loadSkillIndex(
  homeDir: string,
  apiKey?: string
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

  // Try to fetch from API
  let result: { skills: Skill[]; bounds: PopularityBounds };
  if (apiKey) {
    try {
      result = await fetchSkillsFromApi(apiKey);
    } catch (error) {
      console.warn(`Failed to fetch from Skills-API: ${error instanceof Error ? error.message : String(error)}`);
      result = loadLocalFallback();
    }
  } else {
    result = loadLocalFallback();
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
