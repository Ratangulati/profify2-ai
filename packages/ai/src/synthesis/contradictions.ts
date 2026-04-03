/**
 * Contradiction detection: scans project insights pairwise via LLM
 * to identify opposing or conflicting statements.
 */

import { parseJsonArray } from "../extraction/extractor.js";
import type { LLMProvider } from "../types.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface InsightForContradiction {
  id: string;
  title: string;
  description: string;
  type: string;
}

export interface DetectedContradiction {
  insightAId: string;
  insightBId: string;
  description: string;
  explanation: string;
  recommendedResolution: string | null;
}

export interface ContradictionScanResult {
  contradictions: DetectedContradiction[];
  pairsScanned: number;
}

// ── Prompt builder ─────────────────────────────────────────────────────

export function buildContradictionPrompt(insights: InsightForContradiction[]): string {
  const insightList = insights
    .map((i) => `- [${i.id}] (${i.type}) "${i.title}": ${i.description}`)
    .join("\n");

  return `Analyze the following product insights for contradictions — cases where two insights make opposing or incompatible claims about user needs, behaviors, or product requirements.

INSIGHTS:
${insightList}

For each contradiction found, return a JSON object with:
- "insight_a_id": ID of the first insight
- "insight_b_id": ID of the second insight
- "description": A short summary of the contradiction (1 sentence)
- "explanation": Why these insights contradict each other (2-3 sentences)
- "recommended_resolution": How a PM should resolve this (1-2 sentences, or null if unclear)

Return a JSON array. If no contradictions are found, return an empty array [].
Only flag genuine contradictions — not insights that are merely different topics.`;
}

// ── Parsing ────────────────────────────────────────────────────────────

interface RawContradiction {
  insight_a_id: string;
  insight_b_id: string;
  description: string;
  explanation: string;
  recommended_resolution: string | null;
}

export function parseContradictionResponse(raw: string): DetectedContradiction[] {
  const parsed = parseJsonArray<RawContradiction>(raw);
  return parsed
    .filter(
      (c) =>
        typeof c.insight_a_id === "string" &&
        typeof c.insight_b_id === "string" &&
        typeof c.description === "string" &&
        typeof c.explanation === "string" &&
        c.insight_a_id !== c.insight_b_id,
    )
    .map((c) => ({
      insightAId: c.insight_a_id,
      insightBId: c.insight_b_id,
      description: c.description,
      explanation: c.explanation,
      recommendedResolution: c.recommended_resolution ?? null,
    }));
}

// ── Batch scanning ─────────────────────────────────────────────────────

const BATCH_SIZE = 20;

/**
 * Scan a set of insights for contradictions. Breaks into batches
 * to stay within context limits, then deduplicates results.
 */
export async function detectContradictions(
  provider: LLMProvider,
  insights: InsightForContradiction[],
  model?: string,
): Promise<ContradictionScanResult> {
  if (insights.length < 2) {
    return { contradictions: [], pairsScanned: 0 };
  }

  const allContradictions: DetectedContradiction[] = [];
  let pairsScanned = 0;

  // Process in batches — each batch is an independent LLM call
  for (let i = 0; i < insights.length; i += BATCH_SIZE) {
    const batch = insights.slice(i, i + BATCH_SIZE);
    pairsScanned += (batch.length * (batch.length - 1)) / 2;

    const prompt = buildContradictionPrompt(batch);

    const response = await provider.complete({
      messages: [
        {
          role: "system",
          content:
            "You are an expert product analyst specializing in identifying contradictions in customer feedback insights. Output only valid JSON arrays.",
        },
        { role: "user", content: prompt },
      ],
      model,
      temperature: 0.2,
      maxTokens: 4000,
    });

    const batchContradictions = parseContradictionResponse(response.content);
    allContradictions.push(...batchContradictions);
  }

  // Deduplicate: normalize pair ordering (sort IDs) and remove dupes
  const seen = new Set<string>();
  const unique = allContradictions.filter((c) => {
    const key = [c.insightAId, c.insightBId].sort().join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { contradictions: unique, pairsScanned };
}
