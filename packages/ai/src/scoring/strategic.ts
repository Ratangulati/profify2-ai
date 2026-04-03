/**
 * Strategic alignment scoring via LLM similarity judgment.
 *
 * Scores each opportunity against each strategic bet using an LLM
 * to judge alignment on a 0-1 scale. Overall alignment is the max
 * score across all bets.
 */

import type { LLMProvider } from "../types.js";

import type { StrategicBet, StrategicAlignmentResult } from "./types.js";

// ── Prompt ───────────────────────────────────────────────────────────

export function buildAlignmentPrompt(
  opportunityTitle: string,
  opportunityDescription: string | null,
  bets: StrategicBet[],
): string {
  const betList = bets.map((b, i) => `${i + 1}. [${b.id}] "${b.statement}"`).join("\n");

  return `You are a product strategy analyst. Score how well this opportunity aligns with each strategic bet.

## Opportunity
Title: ${opportunityTitle}
Description: ${opportunityDescription ?? "No description"}

## Strategic Bets
${betList}

## Instructions
For each strategic bet, provide an alignment score from 0.0 to 1.0:
- 0.0 = no alignment at all
- 0.3 = loosely related
- 0.5 = moderately aligned
- 0.7 = strongly aligned
- 1.0 = directly addresses the bet

Respond ONLY with valid JSON in this format:
{
  "scores": {
    "<bet_id>": <score>,
    ...
  }
}`;
}

// ── Response Parser ──────────────────────────────────────────────────

export function parseAlignmentResponse(raw: string, betIds: string[]): Record<string, number> {
  const scores: Record<string, number> = {};

  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return scores;

    const parsed = JSON.parse(jsonMatch[0]);
    const rawScores = parsed.scores ?? parsed;

    for (const id of betIds) {
      const val = rawScores[id];
      if (typeof val === "number" && val >= 0 && val <= 1) {
        scores[id] = Math.round(val * 100) / 100;
      }
    }
  } catch {
    // Return empty scores on parse failure
  }

  return scores;
}

// ── Scorer ───────────────────────────────────────────────────────────

export async function scoreStrategicAlignment(
  opportunityTitle: string,
  opportunityDescription: string | null,
  bets: StrategicBet[],
  provider: LLMProvider,
): Promise<StrategicAlignmentResult> {
  if (bets.length === 0) {
    return { overallAlignment: 0, perBetScores: {} };
  }

  const prompt = buildAlignmentPrompt(opportunityTitle, opportunityDescription, bets);

  const response = await provider.complete({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    maxTokens: 500,
  });

  const betIds = bets.map((b) => b.id);
  const perBetScores = parseAlignmentResponse(response.content, betIds);

  // Overall alignment = max score across bets (weighted)
  let overallAlignment = 0;
  for (const bet of bets) {
    const score = perBetScores[bet.id] ?? 0;
    const weighted = score * bet.weight;
    if (weighted > overallAlignment) {
      overallAlignment = weighted;
    }
  }

  return {
    overallAlignment: Math.round(overallAlignment * 100) / 100,
    perBetScores,
  };
}

/**
 * Batch-score multiple opportunities against strategic bets.
 * Processes sequentially to avoid LLM rate limits.
 */
export async function batchScoreStrategicAlignment(
  opportunities: Array<{ id: string; title: string; description: string | null }>,
  bets: StrategicBet[],
  provider: LLMProvider,
): Promise<Map<string, StrategicAlignmentResult>> {
  const results = new Map<string, StrategicAlignmentResult>();

  if (bets.length === 0) {
    for (const opp of opportunities) {
      results.set(opp.id, { overallAlignment: 0, perBetScores: {} });
    }
    return results;
  }

  for (const opp of opportunities) {
    try {
      const result = await scoreStrategicAlignment(opp.title, opp.description, bets, provider);
      results.set(opp.id, result);
    } catch {
      results.set(opp.id, { overallAlignment: 0, perBetScores: {} });
    }
  }

  return results;
}
