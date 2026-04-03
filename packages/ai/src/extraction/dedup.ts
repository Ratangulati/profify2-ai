/**
 * Embedding-based deduplication for extracted insights.
 * Uses cosine similarity to detect if a new insight is a duplicate
 * of an existing one. If similarity > threshold, merge instead of create.
 */

import type { LLMProvider } from "../types.js";

export interface InsightForDedup {
  id: string;
  title: string;
  description: string;
  embedding: number[];
  frequencyCount: number;
}

export interface DedupResult {
  /** ID of the existing insight to merge into, or null if novel */
  mergeTargetId: string | null;
  /** The embedding for the new insight (to store if novel) */
  embedding: number[];
}

const DEFAULT_SIMILARITY_THRESHOLD = 0.85;

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Generate an embedding for an insight's title + description.
 */
export async function embedInsight(
  provider: LLMProvider,
  title: string,
  description: string,
): Promise<number[]> {
  if (!provider.embed) {
    throw new Error("LLM provider does not support embeddings");
  }

  const response = await provider.embed({
    input: `${title}: ${description}`,
    model: "text-embedding-3-small",
  });

  return response.embeddings[0];
}

/**
 * Check if a new insight is a duplicate of any existing insights.
 * Returns the merge target if similarity exceeds threshold.
 */
export function findDuplicate(
  newEmbedding: number[],
  existingInsights: InsightForDedup[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): InsightForDedup | null {
  let bestMatch: InsightForDedup | null = null;
  let bestSimilarity = 0;

  for (const existing of existingInsights) {
    if (existing.embedding.length === 0) continue;

    const similarity = cosineSimilarity(newEmbedding, existing.embedding);
    if (similarity > threshold && similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = existing;
    }
  }

  return bestMatch;
}

/**
 * Full dedup check: embed the new insight, then compare against existing.
 */
export async function checkDuplicate(
  provider: LLMProvider,
  title: string,
  description: string,
  existingInsights: InsightForDedup[],
  threshold?: number,
): Promise<DedupResult> {
  const embedding = await embedInsight(provider, title, description);
  const mergeTarget = findDuplicate(embedding, existingInsights, threshold);

  return {
    mergeTargetId: mergeTarget?.id ?? null,
    embedding,
  };
}
