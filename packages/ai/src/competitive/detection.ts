/**
 * Competitor mention detection: exact match, alias match, and LLM-based
 * detection for indirect references.
 */

import { parseJsonArray } from "../extraction/extractor.js";
import type { LLMProvider } from "../types.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface CompetitorConfig {
  id: string;
  name: string;
  aliases: string[];
}

export interface DetectionResult {
  competitorId: string;
  competitorName: string;
  method: "exact" | "alias" | "llm";
  matchedTerm: string;
}

export interface FeedbackForDetection {
  id: string;
  content: string;
}

export interface DetectionBatchResult {
  feedbackId: string;
  detections: DetectionResult[];
}

// ── Exact + alias detection ────────────────────────────────────────────

/**
 * Scan text for exact competitor name and alias matches (case-insensitive).
 * Uses word boundary detection to avoid false positives.
 */
export function detectByNameAndAlias(
  content: string,
  competitors: CompetitorConfig[],
): DetectionResult[] {
  const results: DetectionResult[] = [];
  const contentLower = content.toLowerCase();

  for (const comp of competitors) {
    const terms = [comp.name, ...comp.aliases];
    for (const term of terms) {
      if (!term) continue;
      const termLower = term.toLowerCase();
      // Word boundary check: term must be surrounded by non-alphanumeric chars
      const idx = contentLower.indexOf(termLower);
      if (idx === -1) continue;

      const before = idx > 0 ? contentLower[idx - 1] : " ";
      const after =
        idx + termLower.length < contentLower.length ? contentLower[idx + termLower.length] : " ";

      const isWordBoundaryBefore = !/[a-z0-9]/.test(before);
      const isWordBoundaryAfter = !/[a-z0-9]/.test(after);

      if (isWordBoundaryBefore && isWordBoundaryAfter) {
        results.push({
          competitorId: comp.id,
          competitorName: comp.name,
          method: term === comp.name ? "exact" : "alias",
          matchedTerm: term,
        });
        break; // One match per competitor is enough
      }
    }
  }

  return results;
}

// ── LLM-based detection ────────────────────────────────────────────────

export function buildDetectionPrompt(content: string, competitorNames: string[]): string {
  return `Analyze this customer feedback for indirect references to competitor products.
Known competitors: ${competitorNames.join(", ")}

Feedback: "${content}"

If the feedback indirectly references any of these competitors (e.g., "that other tool", "our previous solution", "the one with better search"), identify which competitor is being referenced.

Return a JSON array of objects with:
- "competitor_name": the competitor being referenced
- "matched_phrase": the phrase that references the competitor

If no indirect references are found, return an empty array [].
Only flag clear references — not vague mentions that could apply to anything.`;
}

interface RawLLMDetection {
  competitor_name: string;
  matched_phrase: string;
}

export function parseLLMDetectionResponse(
  raw: string,
  competitors: CompetitorConfig[],
): DetectionResult[] {
  const parsed = parseJsonArray<RawLLMDetection>(raw);
  const nameToComp = new Map(competitors.map((c) => [c.name.toLowerCase(), c]));

  const results: DetectionResult[] = [];
  for (const d of parsed) {
    if (typeof d.competitor_name !== "string" || typeof d.matched_phrase !== "string") continue;
    const comp = nameToComp.get(d.competitor_name.toLowerCase());
    if (!comp) continue;
    results.push({
      competitorId: comp.id,
      competitorName: comp.name,
      method: "llm",
      matchedTerm: d.matched_phrase,
    });
  }
  return results;
}

/**
 * Run LLM-based detection for indirect competitor references.
 */
export async function detectByLLM(
  provider: LLMProvider,
  content: string,
  competitors: CompetitorConfig[],
  model?: string,
): Promise<DetectionResult[]> {
  if (competitors.length === 0) return [];

  const prompt = buildDetectionPrompt(
    content,
    competitors.map((c) => c.name),
  );

  const response = await provider.complete({
    messages: [
      {
        role: "system",
        content:
          "You identify indirect competitor references in customer feedback. Output only valid JSON arrays.",
      },
      { role: "user", content: prompt },
    ],
    model,
    temperature: 0.2,
    maxTokens: 1000,
  });

  return parseLLMDetectionResponse(response.content, competitors);
}

/**
 * Full detection pipeline: exact match → alias match → LLM for remaining items.
 * Only runs LLM on feedback that had no exact/alias matches.
 */
export async function detectCompetitorMentions(
  provider: LLMProvider,
  items: FeedbackForDetection[],
  competitors: CompetitorConfig[],
  model?: string,
): Promise<DetectionBatchResult[]> {
  const results: DetectionBatchResult[] = [];

  for (const item of items) {
    // Phase 1: exact + alias
    const directMatches = detectByNameAndAlias(item.content, competitors);

    if (directMatches.length > 0) {
      results.push({ feedbackId: item.id, detections: directMatches });
      continue;
    }

    // Phase 2: LLM for items with no direct matches
    const llmMatches = await detectByLLM(provider, item.content, competitors, model);
    if (llmMatches.length > 0) {
      results.push({ feedbackId: item.id, detections: llmMatches });
    }
  }

  return results;
}
