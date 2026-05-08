import { Skill, PopularityBounds, cosineSimilarity } from "./skill-indexer";
import { LanguageDetection } from "./repo-detector";

export interface RankedSkill extends Skill {
  score: number;
  semantic_similarity: number;
  popularity_score: number;
  language_match: number;
}

const SEMANTIC_THRESHOLD = 0.5;
const WEIGHTS = {
  semantic: 0.6,
  popularity: 0.3,
  language: 0.1,
};

const EMBEDDING_DIM = 512;

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

async function generateQueryEmbedding(text: string): Promise<number[] | null> {
  const mastraKey = process.env.MASTRA_API_KEY;

  if (!mastraKey) {
    // No API key - return null to trigger graceful degradation
    return null;
  }

  try {
    // TODO: Call actual Mastra AI API
    return Array(EMBEDDING_DIM).fill(0).map(() => Math.random() * 2 - 1);
  } catch (error) {
    // Return null on API error to trigger graceful degradation
    console.warn(`Embedding API error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function calculatePopularityScore(
  skill: Skill,
  bounds: PopularityBounds
): number {
  const installsLog = Math.log10(skill.installCount + 1);
  const starsLog = Math.log10(skill.githubStars + 1);

  // Normalize to [0, 1]
  const installsNorm = Math.max(
    0,
    Math.min(
      1,
      (installsLog - bounds.installs.min_log) /
        (bounds.installs.max_log - bounds.installs.min_log)
    )
  );

  const starsNorm = Math.max(
    0,
    Math.min(
      1,
      (starsLog - bounds.stars.min_log) /
        (bounds.stars.max_log - bounds.stars.min_log)
    )
  );

  // Calculate freshness: days_since_update <= 30 → 1.0, else max(0, 1.0 - 0.01×(days-30))
  const lastUpdated = new Date(skill.lastUpdated);
  const now = new Date();
  const daysSince = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
  const freshness = daysSince <= 30 ? 1.0 : Math.max(0, 1.0 - 0.01 * (daysSince - 30));

  // Weighted average: 0.5×installs + 0.3×stars + 0.2×freshness
  return 0.5 * installsNorm + 0.3 * starsNorm + 0.2 * freshness;
}

function calculateLanguageScore(
  skill: Skill,
  detection: LanguageDetection
): number {
  if (!detection.primary) return 0;
  if (skill.languages.includes(detection.primary)) return 1.0;
  if (skill.languages.some((lang) => detection.languages[lang])) return 0.7;
  return 0.0;
}

function normalizeQueryForExpansion(query: string): string {
  return query.toLowerCase().trim();
}

async function expandQuery(baseQuery: string): Promise<string[]> {
  // Phase 1b: 3-iteration query expansion via npm synonyms
  // For now, just use the base query; real implementation would use npm synonyms package
  const normalized = normalizeQueryForExpansion(baseQuery);

  // TODO: Import and use npm synonyms package for 3-iteration expansion
  // For MVP, return base query + simple variations
  return [normalized, `${normalized} tool`, `${normalized} library`];
}

export async function rankSkills(
  skills: Skill[],
  query: string,
  bounds: PopularityBounds,
  detection: LanguageDetection
): Promise<{ results: RankedSkill[]; embeddingFailed: boolean }> {
  // Expand query (3 hidden iterations)
  const queries = await expandQuery(query);

  // Generate embeddings for all query variations
  const queryEmbeddings = await Promise.all(queries.map((q) => generateQueryEmbedding(q)));

  // Check if embeddings failed
  const embeddingFailed = queryEmbeddings.some((e) => e === null);
  const validEmbeddings = queryEmbeddings.filter((e) => e !== null) as number[][];

  // Score each skill across all query iterations
  const skillScores = new Map<string, { skill: Skill; scores: number[] }>();

  if (!embeddingFailed && validEmbeddings.length > 0) {
    // Normal path: use semantic + popularity + language
    for (let i = 0; i < queries.length; i++) {
      const queryEmbedding = queryEmbeddings[i];
      if (!queryEmbedding) continue;

      for (const skill of skills) {
        const semantic = cosineSimilarity(queryEmbedding, skill.embedding);

        // Skip if semantic similarity below threshold
        if (semantic < SEMANTIC_THRESHOLD) continue;

        const popularity = calculatePopularityScore(skill, bounds);
        const language = calculateLanguageScore(skill, detection);

        const finalScore =
          WEIGHTS.semantic * semantic +
          WEIGHTS.popularity * popularity +
          WEIGHTS.language * language;

        if (!skillScores.has(skill.slug)) {
          skillScores.set(skill.slug, { skill, scores: [] });
        }
        skillScores.get(skill.slug)!.scores.push(finalScore);
      }
    }
  } else if (embeddingFailed) {
    // Degraded path: use semantic (from cached embedding) + language only
    // Fall back to language + popularity only (no semantic embedding)
    for (const skill of skills) {
      const language = calculateLanguageScore(skill, detection);
      const popularity = calculatePopularityScore(skill, bounds);

      // Simplified scoring: language (0.5) + popularity (0.5) without semantic
      const finalScore = 0.5 * popularity + 0.5 * language;

      if (!skillScores.has(skill.slug)) {
        skillScores.set(skill.slug, { skill, scores: [] });
      }
      skillScores.get(skill.slug)!.scores.push(finalScore);
    }
  }

  // Merge results by averaging scores across iterations
  const rankedSkills: RankedSkill[] = Array.from(skillScores.values()).map(
    ({ skill, scores }) => {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const avgSemantic = validEmbeddings.length > 0
        ? cosineSimilarity(validEmbeddings[0], skill.embedding)
        : 0;
      const popularity = calculatePopularityScore(skill, bounds);
      const language = calculateLanguageScore(skill, detection);

      return {
        ...skill,
        score: avgScore,
        semantic_similarity: avgSemantic,
        popularity_score: popularity,
        language_match: language,
      };
    }
  );

  // Sort by score and return top-5
  return {
    results: rankedSkills.sort((a, b) => b.score - a.score).slice(0, 5),
    embeddingFailed,
  };
}
