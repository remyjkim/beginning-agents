import { env } from "process";

// Real semantic embeddings using Xenova/all-MiniLM-L6-v2
// Model: 384-dimensional, ~30MB, excellent semantic quality
// First run: ~2-5 seconds (downloads model)
// Subsequent runs: <10ms inference

const EMBEDDING_DIM = 384;
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

let pipelineInstance: any = null;

async function getPipeline() {
  if (pipelineInstance) {
    return pipelineInstance;
  }

  try {
    // Lazy-load the transformer pipeline on first use
    const { pipeline } = await import("@xenova/transformers");

    pipelineInstance = await pipeline("feature-extraction", MODEL_NAME, {
      // Cache models in .cache/huggingface if TRANSFORMERS_CACHE not set
      cache_dir: env.TRANSFORMERS_CACHE || "./.cache/huggingface",
    });

    return pipelineInstance;
  } catch (error) {
    throw new Error(
      `Failed to load embedding model: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function embedText(text: string): Promise<number[]> {
  if (!text || text.length === 0) {
    return Array(EMBEDDING_DIM).fill(0);
  }

  try {
    const pipeline = await getPipeline();

    // Generate embedding for the text
    // Returns shape [1, 384], we want [384]
    const output = await pipeline(text, {
      pooling: "mean",
      normalize: true,
    });

    // Convert to regular array with proper typing
    const embeddingArray = Array.from(output.data);
    const embedding = embeddingArray.map((v) => Number(v)) as number[];

    if (embedding.length !== EMBEDDING_DIM) {
      throw new Error(
        `Expected ${EMBEDDING_DIM}-dim embedding, got ${embedding.length}`
      );
    }

    return embedding;
  } catch (error) {
    throw new Error(
      `Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
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
