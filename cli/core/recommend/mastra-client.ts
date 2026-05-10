import { PgVector } from '@mastra/pg';
import { embeddingFromText } from './embedding-local';

const EMBEDDING_DIMENSION = 512;
const INDEX_NAME = 'skills';

export interface SkillMetadata {
  slug: string;
  name: string;
  summary: string;
  tags: string[];
  useCase: string;
  installCount: number;
  githubStars: number;
  languages: string[];
  domain?: string;
  lastUpdated: string;
  indexedAt: string;
}

let vectorStoreInstance: PgVector | null = null;

export function isVectorDbAvailable(): boolean {
  return !!process.env.POSTGRES_CONNECTION_STRING;
}

export function getVectorStore(): PgVector {
  if (!isVectorDbAvailable()) {
    throw new Error('Vector DB not available: missing POSTGRES_CONNECTION_STRING');
  }

  if (vectorStoreInstance) {
    return vectorStoreInstance;
  }

  vectorStoreInstance = new PgVector({
    id: 'pgvector-skills',
    connectionString: process.env.POSTGRES_CONNECTION_STRING!,
  });

  return vectorStoreInstance;
}

export async function ensureIndex(): Promise<void> {
  const vectorStore = getVectorStore();

  try {
    await vectorStore.createIndex({
      indexName: INDEX_NAME,
      dimension: EMBEDDING_DIMENSION,
    });
  } catch (error) {
    // Index may already exist, which is fine
    if (!(error instanceof Error) || !error.message.includes('already exists')) {
      throw error;
    }
  }
}

export async function embedText(text: string): Promise<number[]> {
  // Use local TF-IDF embedding (no API calls needed)
  return embeddingFromText(text);
}

export async function upsertSkill(
  embedding: number[],
  metadata: SkillMetadata
): Promise<void> {
  const vectorStore = getVectorStore();

  await vectorStore.upsert({
    indexName: INDEX_NAME,
    vectors: [embedding],
    metadata: [metadata],
  });
}

export async function querySkills(
  queryEmbedding: number[],
  topK: number = 10
): Promise<Array<{ metadata: SkillMetadata; score: number }>> {
  const vectorStore = getVectorStore();

  const results = await vectorStore.query({
    indexName: INDEX_NAME,
    queryVector: queryEmbedding,
    topK,
  });

  return results.map((result) => ({
    metadata: result.metadata as SkillMetadata,
    score: result.score ?? 0,
  }));
}
