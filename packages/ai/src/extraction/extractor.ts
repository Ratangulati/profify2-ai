/**
 * LLM-based insight extraction: sends batches of feedback through
 * pain-point and desire extraction prompts, parses structured output.
 */

import type { LLMProvider } from "../types.js";

import {
  buildPainPointPrompt,
  buildDesirePrompt,
  type FeedbackBatchItem,
  type ExtractedPainPoint,
  type ExtractedDesire,
} from "./prompts.js";

export interface ExtractionResult {
  painPoints: ExtractedPainPoint[];
  desires: ExtractedDesire[];
}

const BATCH_SIZE = 30;

/**
 * Extract pain points and desires from a batch of feedback items.
 * Splits into sub-batches of BATCH_SIZE and runs extraction prompts.
 */
export async function extractInsights(
  provider: LLMProvider,
  items: FeedbackBatchItem[],
  model?: string,
): Promise<ExtractionResult> {
  const allPainPoints: ExtractedPainPoint[] = [];
  const allDesires: ExtractedDesire[] = [];

  // Process in batches
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    const [painPoints, desires] = await Promise.all([
      extractPainPoints(provider, batch, model),
      extractDesires(provider, batch, model),
    ]);

    allPainPoints.push(...painPoints);
    allDesires.push(...desires);
  }

  return { painPoints: allPainPoints, desires: allDesires };
}

async function extractPainPoints(
  provider: LLMProvider,
  batch: FeedbackBatchItem[],
  model?: string,
): Promise<ExtractedPainPoint[]> {
  const prompt = buildPainPointPrompt(batch);

  const response = await provider.complete({
    messages: [
      {
        role: "system",
        content: "You are an expert product analyst. Output only valid JSON arrays.",
      },
      { role: "user", content: prompt },
    ],
    model,
    temperature: 0.3,
    maxTokens: 4000,
  });

  return parseJsonArray<ExtractedPainPoint>(response.content);
}

async function extractDesires(
  provider: LLMProvider,
  batch: FeedbackBatchItem[],
  model?: string,
): Promise<ExtractedDesire[]> {
  const prompt = buildDesirePrompt(batch);

  const response = await provider.complete({
    messages: [
      {
        role: "system",
        content: "You are an expert product analyst. Output only valid JSON arrays.",
      },
      { role: "user", content: prompt },
    ],
    model,
    temperature: 0.3,
    maxTokens: 4000,
  });

  return parseJsonArray<ExtractedDesire>(response.content);
}

/**
 * Parse LLM output as a JSON array, with fallback for markdown-fenced output.
 */
export function parseJsonArray<T>(raw: string): T[] {
  let cleaned = raw.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed as T[];
  } catch {
    return [];
  }
}
