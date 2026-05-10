import { cosineSimilarity } from "./skill-indexer";
import type { Skill, PopularityBounds } from "./skill-indexer";
import type { LanguageDetection } from "./repo-detector";
import { hybridSimilarity, embeddingFromText } from "./embedding-local";
import { isVectorDbAvailable } from "./mastra-client";
import { rankSkillsVectorBased as vectorRankSkills } from "./vector-ranker";

export interface RankedSkill extends Skill {
  score: number;
  semantic_similarity: number;
  popularity_score: number;
  language_match: number;
}

const SEMANTIC_THRESHOLD = 0.0; // No threshold - rank all skills, return top 5
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

function generateQueryEmbedding(text: string): number[] {
  // Use local TF-IDF embedding (no API required)
  return embeddingFromText(text);
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
  // Use local ranking (with Claude-extracted descriptions if available)
  // Vector DB integration coming later
  // Expand query (3 hidden iterations)
  const queries = await expandQuery(query);

  // Score each skill across all query iterations
  const skillScores = new Map<string, { skill: Skill; scores: number[] }>();

  // Use hybrid similarity (embedding + text overlap)
  for (const queryText of queries) {
    for (const skill of skills) {
      // Search against skill name, description, and domain combined
      const searchText = `${skill.name} ${skill.description} ${skill.domain || ""}`;

      // Calculate semantic similarity using hybrid approach (embeddings + text overlap)
      const semantic = hybridSimilarity(queryText, searchText);

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

  // Merge results by averaging scores across iterations
  const rankedSkills: RankedSkill[] = Array.from(skillScores.values()).map(
    ({ skill, scores }) => {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const searchText = `${skill.name} ${skill.description} ${skill.domain || ""}`;
      const semantic = hybridSimilarity(query, searchText);
      const popularity = calculatePopularityScore(skill, bounds);
      const language = calculateLanguageScore(skill, detection);

      return {
        ...skill,
        score: avgScore,
        semantic_similarity: semantic,
        popularity_score: popularity,
        language_match: language,
      };
    }
  );

  // Sort by score and return top-5
  return {
    results: rankedSkills.sort((a, b) => b.score - a.score).slice(0, 5),
    embeddingFailed: false, // Local embeddings always work
  };
}
