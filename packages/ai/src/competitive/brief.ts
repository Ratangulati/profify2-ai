/**
 * Competitive brief generator: produces positioning briefs
 * from aggregated competitive intelligence data.
 */

import type { LLMProvider } from "../types.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface CompetitiveDataSummary {
  competitorName: string;
  totalMentions: number;
  favorableCount: number;
  unfavorableCount: number;
  neutralCount: number;
  switchingSignals: number;
  featureAreas: Array<{
    area: string;
    favorable: number;
    unfavorable: number;
    advantages: string[];
  }>;
  recentQuotes: string[];
}

export interface CompetitiveBrief {
  competitorName: string;
  featureArea: string | null;
  content: string;
}

// ── Prompt ─────────────────────────────────────────────────────────────

export function buildBriefPrompt(
  featureArea: string | null,
  competitor: CompetitiveDataSummary,
): string {
  const areaSection = featureArea
    ? `comparing our product to ${competitor.competitorName} in the area of "${featureArea}"`
    : `comparing our product to ${competitor.competitorName} overall`;

  const featureBreakdown = competitor.featureAreas
    .map(
      (fa) =>
        `- ${fa.area}: ${fa.favorable} favorable, ${fa.unfavorable} unfavorable mentions` +
        (fa.advantages.length > 0 ? `\n  Key points: ${fa.advantages.join("; ")}` : ""),
    )
    .join("\n");

  const quotes = competitor.recentQuotes
    .slice(0, 10)
    .map((q, i) => `${i + 1}. "${q}"`)
    .join("\n");

  return `Generate a competitive positioning brief ${areaSection}.

Based on the following customer feedback analysis:

COMPETITOR: ${competitor.competitorName}
TOTAL MENTIONS: ${competitor.totalMentions}
FAVORABLE (they prefer competitor): ${competitor.favorableCount}
UNFAVORABLE (they prefer us): ${competitor.unfavorableCount}
NEUTRAL: ${competitor.neutralCount}
SWITCHING SIGNALS: ${competitor.switchingSignals} users considering switching

FEATURE BREAKDOWN:
${featureBreakdown || "No feature-level data available."}

SAMPLE QUOTES:
${quotes || "No quotes available."}

Include:
1. Where the competitor is perceived as stronger (with evidence)
2. Where we're perceived as stronger
3. Key gaps to close
4. Recommended positioning strategy
5. Features to prioritize to win against this competitor

Be specific and evidence-based. Reference the actual feedback data provided.`;
}

// ── Generation ─────────────────────────────────────────────────────────

/**
 * Generate a competitive positioning brief.
 */
export async function generateCompetitiveBrief(
  provider: LLMProvider,
  data: CompetitiveDataSummary,
  featureArea?: string | null,
  model?: string,
): Promise<CompetitiveBrief> {
  const prompt = buildBriefPrompt(featureArea ?? null, data);

  const response = await provider.complete({
    messages: [
      {
        role: "system",
        content:
          "You are a senior product strategist writing competitive positioning briefs. Be specific, evidence-based, and actionable. Use markdown formatting for readability.",
      },
      { role: "user", content: prompt },
    ],
    model,
    temperature: 0.4,
    maxTokens: 3000,
  });

  return {
    competitorName: data.competitorName,
    featureArea: featureArea ?? null,
    content: response.content,
  };
}
