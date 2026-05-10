// Local embedding implementation using TF-IDF + word overlap
// No external API required

const EMBEDDING_DIM = 512;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 2);
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

// Simple hash function to convert words to consistent indices
function hashWord(word: string): number {
  let hash = 0;
  for (let i = 0; i < word.length; i++) {
    const char = word.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % EMBEDDING_DIM;
}

export function embeddingFromText(text: string): number[] {
  const tokens = tokenize(text);
  const embedding = Array(EMBEDDING_DIM).fill(0);

  // TF-IDF style: weight by frequency and normalize
  const tokenCounts: Record<string, number> = {};
  for (const token of tokens) {
    tokenCounts[token] = (tokenCounts[token] || 0) + 1;
  }

  // Distribute token weights across embedding dimensions
  for (const [token, count] of Object.entries(tokenCounts)) {
    const index = hashWord(token);
    // Higher frequency = higher weight
    embedding[index] += Math.sqrt(count) / Math.sqrt(tokens.length);
  }

  // Normalize to unit vector
  let magnitude = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    magnitude += embedding[i] * embedding[i];
  }

  if (magnitude > 0) {
    magnitude = Math.sqrt(magnitude);
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

export function wordOverlapSimilarity(queryText: string, targetText: string): number {
  const queryTokens = new Set(tokenize(queryText));
  const targetTokens = tokenize(targetText);

  if (queryTokens.size === 0 || targetTokens.length === 0) return 0;

  const matches = targetTokens.filter((token) => queryTokens.has(token)).length;
  return matches / Math.max(queryTokens.size, targetTokens.length);
}

export function hybridSimilarity(queryText: string, targetText: string): number {
  // Combine embedding-based similarity (70%) + word overlap (30%)
  const embeddingSim = cosineSimilarity(embeddingFromText(queryText), embeddingFromText(targetText));
  const overlapSim = wordOverlapSimilarity(queryText, targetText);

  return 0.7 * embeddingSim + 0.3 * overlapSim;
}
