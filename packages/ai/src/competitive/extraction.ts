/**
 * Competitive intelligence extraction: analyzes feedback mentioning competitors
 * to extract structured comparison data.
 */

import { parseJsonArray } from "../extraction/extractor.js";
import type { LLMProvider } from "../types.js";

// ── Types ──────────────────────────────────────────────────────────────

export type ComparisonType = "favorable" | "unfavorable" | "neutral";

export interface CompetitorExtraction {
  competitorName: string;
  comparisonType: ComparisonType;
  featureArea: string | null;
  specificAdvantage: string | null;
  verbatimQuote: string;
  switchingSignal: boolean;
}

export interface ExtractionBatchResult {
  feedbackId: string;
  extractions: CompetitorExtraction[];
}

// ── Prompt ─────────────────────────────────────────────────────────────

export function buildExtractionPrompt(feedbackContent: string): string {
  return `Analyze this customer feedback about a competitor product. Extract:

- competitor_name: which competitor is mentioned
- comparison_type: "favorable" (user prefers competitor), "unfavorable" (user prefers us), "neutral" (just mentioning)
- feature_area: what product area is being compared (or null)
- specific_advantage: what specifically the competitor does better/worse (or null)
- verbatim_quote: the exact comparison statement from the feedback
- switching_signal: is the user considering switching to/from the competitor? (true/false)

Feedback: "${feedbackContent}"

Return a JSON array of extraction objects. If no competitive comparison exists, return [].`;
}

// ── Parsing ────────────────────────────────────────────────────────────

interface RawExtraction {
  competitor_name: string;
  comparison_type: string;
  feature_area: string | null;
  specific_advantage: string | null;
  verbatim_quote: string;
  switching_signal: boolean;
}

const VALID_COMPARISON_TYPES = new Set<ComparisonType>(["favorable", "unfavorable", "neutral"]);

export function parseExtractionResponse(raw: string): CompetitorExtraction[] {
  const parsed = parseJsonArray<RawExtraction>(raw);
  return parsed
    .filter(
      (e) =>
        typeof e.competitor_name === "string" &&
        typeof e.comparison_type === "string" &&
        typeof e.verbatim_quote === "string",
    )
    .map((e) => ({
      competitorName: e.competitor_name,
      comparisonType: VALID_COMPARISON_TYPES.has(e.comparison_type as ComparisonType)
        ? (e.comparison_type as ComparisonType)
        : "neutral",
      featureArea: e.feature_area ?? null,
      specificAdvantage: e.specific_advantage ?? null,
      verbatimQuote: e.verbatim_quote,
      switchingSignal: Boolean(e.switching_signal),
    }));
}

// ── Batch extraction ───────────────────────────────────────────────────

/**
 * Extract competitive intelligence from feedback items known to mention competitors.
 */
export async function extractCompetitiveInsights(
  provider: LLMProvider,
  items: Array<{ id: string; content: string }>,
  model?: string,
): Promise<ExtractionBatchResult[]> {
  const results: ExtractionBatchResult[] = [];

  for (const item of items) {
    const prompt = buildExtractionPrompt(item.content);

    const response = await provider.complete({
      messages: [
        {
          role: "system",
          content:
            "You are a competitive intelligence analyst. Extract structured comparison data from customer feedback. Output only valid JSON arrays.",
        },
        { role: "user", content: prompt },
      ],
      model,
      temperature: 0.2,
      maxTokens: 2000,
    });

    const extractions = parseExtractionResponse(response.content);
    if (extractions.length > 0) {
      results.push({ feedbackId: item.id, extractions });
    }
  }

  return results;
}
