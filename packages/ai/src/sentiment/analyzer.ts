/**
 * Sentiment analysis: LLM-based scoring of feedback items
 * on a -1.0 to 1.0 scale with justification.
 */

import type { LLMProvider } from "../types.js";

export interface SentimentResult {
  score: number; // -1.0 to 1.0
  label: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED";
  justification: string;
}

export interface FeedbackForSentiment {
  id: string;
  content: string;
}

const BATCH_SIZE = 20;

/**
 * Build the LLM prompt for batch sentiment analysis.
 */
export function buildSentimentPrompt(items: FeedbackForSentiment[]): string {
  const block = items.map((item, i) => `[${i + 1}] (id: ${item.id}) ${item.content}`).join("\n\n");

  return `Analyze the sentiment of each customer feedback item below. For each item, provide:
- id: the feedback item id
- score: a float from -1.0 (extremely negative) to 1.0 (extremely positive), where 0.0 is neutral
- label: one of "POSITIVE", "NEGATIVE", "NEUTRAL", or "MIXED"
- justification: a brief (1 sentence) explanation of why you assigned this score

Guidelines:
- Pure complaints/frustrations: -0.5 to -1.0
- Mild dissatisfaction: -0.1 to -0.5
- Neutral/informational: -0.1 to 0.1
- Positive with caveats: 0.1 to 0.5
- Strong praise/satisfaction: 0.5 to 1.0
- Mixed (both positive and negative): use MIXED label, score reflects overall lean

Feedback items:
${block}

Return a JSON array of objects with {id, score, label, justification}. Output ONLY valid JSON, no markdown fences.`;
}

/**
 * Parse the LLM response for sentiment results.
 */
export function parseSentimentResponse(raw: string): Array<{ id: string } & SentimentResult> {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: Record<string, unknown>) => ({
      id: String(item.id ?? ""),
      score: clampScore(Number(item.score ?? 0)),
      label: validateLabel(String(item.label ?? "NEUTRAL")),
      justification: String(item.justification ?? ""),
    }));
  } catch {
    return [];
  }
}

function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(-1, Math.min(1, score));
}

function validateLabel(label: string): SentimentResult["label"] {
  const upper = label.toUpperCase();
  if (upper === "POSITIVE" || upper === "NEGATIVE" || upper === "NEUTRAL" || upper === "MIXED") {
    return upper;
  }
  return "NEUTRAL";
}

/**
 * Analyze sentiment for a batch of feedback items using an LLM.
 */
export async function analyzeSentimentBatch(
  provider: LLMProvider,
  items: FeedbackForSentiment[],
  model?: string,
): Promise<Map<string, SentimentResult>> {
  const results = new Map<string, SentimentResult>();

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const prompt = buildSentimentPrompt(batch);

    const response = await provider.complete({
      messages: [
        {
          role: "system",
          content:
            "You are an expert at analyzing customer sentiment. Output only valid JSON arrays.",
        },
        { role: "user", content: prompt },
      ],
      model,
      temperature: 0.2,
      maxTokens: 3000,
    });

    const parsed = parseSentimentResponse(response.content);
    for (const result of parsed) {
      results.set(result.id, {
        score: result.score,
        label: result.label,
        justification: result.justification,
      });
    }
  }

  return results;
}

/**
 * Compute aggregate sentiment for a theme: weighted average of member items.
 * Uses freshness weight if provided, otherwise equal weighting.
 */
export function aggregateThemeSentiment(
  items: Array<{ sentimentScore: number | null; freshnessWeight?: number }>,
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const item of items) {
    if (item.sentimentScore == null) continue;
    const weight = item.freshnessWeight ?? 1;
    weightedSum += item.sentimentScore * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return weightedSum / totalWeight;
}
