import type { Skill, PopularityBounds } from "./skill-indexer";
import type { RankedSkill } from "./query-ranker";
import type { LanguageDetection } from "./repo-detector";
import { extractSkillMetadata } from "./skill-extractor";
import {
  isVectorDbAvailable,
  ensureIndex,
  embedText,
  upsertSkill,
  querySkills,
} from "./mastra-client";
import type { SkillMetadata } from "./mastra-client";

const WEIGHTS = {
  semantic: 0.6,
  popularity: 0.3,
  language: 0.1,
};

export interface VectorIndexMetadata {
  indexedAt: string;
  skillCount: number;
}

function calculatePopularityScore(skill: Skill, bounds: PopularityBounds): number {
  const installsLog = Math.log10(skill.installCount + 1);
  const starsLog = Math.log10(skill.githubStars + 1);

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
      (starsLog - bounds.stars.min_log) / (bounds.stars.max_log - bounds.stars.min_log)
    )
  );

  const lastUpdated = new Date(skill.lastUpdated);
  const now = new Date();
  const daysSince = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
  const freshness = daysSince <= 30 ? 1.0 : Math.max(0, 1.0 - 0.01 * (daysSince - 30));

  return 0.5 * installsNorm + 0.3 * starsNorm + 0.2 * freshness;
}

function calculateLanguageScore(skill: Skill, detection: LanguageDetection): number {
  if (!detection.primary) return 0;
  if (skill.languages.includes(detection.primary)) return 1.0;
  if (skill.languages.some((lang) => detection.languages[lang])) return 0.7;
  return 0.0;
}

export async function indexSkillsToVectorDb(
  skills: Skill[]
): Promise<VectorIndexMetadata> {
  if (!isVectorDbAvailable()) {
    throw new Error('Vector DB not available');
  }

  // Ensure index exists
  await ensureIndex();

  const now = new Date().toISOString();
  let indexed = 0;

  // Process in batches of 5 to avoid overwhelming APIs
  for (let i = 0; i < skills.length; i += 5) {
    const batch = skills.slice(i, i + 5);

    await Promise.all(
      batch.map(async (skill) => {
        try {
          // Extract metadata using Claude Haiku
          const metadata = await extractSkillMetadata(skill.description);

          // Embed the concatenated text
          const embedText_str = `${skill.name} ${metadata.summary} ${metadata.tags.join(
            ' '
          )}`;
          const embedding = await embedText(embedText_str);

          // Prepare metadata for vector store
          const vectorMetadata: SkillMetadata = {
            slug: skill.slug,
            name: skill.name,
            summary: metadata.summary,
            tags: metadata.tags,
            useCase: metadata.useCase,
            installCount: skill.installCount,
            githubStars: skill.githubStars,
            languages: skill.languages,
            domain: skill.domain,
            lastUpdated: skill.lastUpdated,
            indexedAt: now,
          };

          // Upsert to vector DB
          await upsertSkill(embedding, vectorMetadata);
          indexed++;
        } catch (error) {
          console.error(`Failed to index skill ${skill.slug}:`, error);
          // Continue with next skill on error
        }
      })
    );
  }

  return {
    indexedAt: now,
    skillCount: indexed,
  };
}

export async function rankSkillsVectorBased(
  skills: Skill[],
  query: string,
  bounds: PopularityBounds,
  detection: LanguageDetection
): Promise<{ results: RankedSkill[]; embeddingFailed: boolean }> {
  if (!isVectorDbAvailable()) {
    throw new Error('Vector DB not available');
  }

  try {
    // Embed the query
    const queryEmbedding = await embedText(query);

    // Query vector DB
    const vectorResults = await querySkills(queryEmbedding, 10);

    // Rank by applying popularity and language weights
    const rankedSkills: RankedSkill[] = vectorResults
      .map((result) => {
        // Find the original skill object for additional fields
        const skill = skills.find((s) => s.slug === result.metadata.slug);
        if (!skill) return null;

        const popularity = calculatePopularityScore(skill, bounds);
        const language = calculateLanguageScore(skill, detection);

        const finalScore =
          WEIGHTS.semantic * result.score +
          WEIGHTS.popularity * popularity +
          WEIGHTS.language * language;

        return {
          ...skill,
          // Override description with summary from vector DB
          description: result.metadata.summary,
          score: finalScore,
          semantic_similarity: result.score,
          popularity_score: popularity,
          language_match: language,
          // Add extracted metadata for better display
          summary: result.metadata.summary,
          tags: result.metadata.tags,
          useCase: result.metadata.useCase,
        } as RankedSkill & { summary: string; tags: string[]; useCase: string };
      })
      .filter((s) => s !== null)
      .sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))
      .slice(0, 5) as RankedSkill[];

    return {
      results: rankedSkills,
      embeddingFailed: false,
    };
  } catch (error) {
    console.error('Vector-based ranking failed:', error);
    return {
      results: [],
      embeddingFailed: true,
    };
  }
}
