/**
 * Evidence assembly: gathers relevant data based on parsed query intent.
 * Designed to be called with data fetched from the database by the API layer.
 */

import type { ParsedQuery } from "./intent.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface EvidenceInsight {
  id: string;
  title: string;
  type: string;
  severityScore: number;
  frequencyCount: number;
  trend: string;
  topQuotes: string[];
}

export interface EvidenceOpportunity {
  id: string;
  title: string;
  riceScore: number | null;
  linkedInsightCount: number;
}

export interface EvidenceTheme {
  id: string;
  title: string;
  feedbackCount: number;
}

export interface EvidenceCompetitor {
  name: string;
  favorableCount: number;
  unfavorableCount: number;
  switchingSignals: number;
  topFeatureAreas: string[];
}

export interface AssembledEvidence {
  query: ParsedQuery;
  insights: EvidenceInsight[];
  opportunities: EvidenceOpportunity[];
  themes: EvidenceTheme[];
  competitors: EvidenceCompetitor[];
  totalFeedbackItems: number;
}

// ── Evidence formatting ────────────────────────────────────────────────

/**
 * Format assembled evidence into a text block for the LLM response generator.
 */
export function formatEvidenceForLLM(evidence: AssembledEvidence): string {
  const sections: string[] = [];

  if (evidence.insights.length > 0) {
    const insightText = evidence.insights
      .map(
        (i) =>
          `- [${i.type}] "${i.title}" (severity: ${i.severityScore.toFixed(1)}, frequency: ${i.frequencyCount}, trend: ${i.trend})` +
          (i.topQuotes.length > 0 ? `\n  Quote: "${i.topQuotes[0]}"` : ""),
      )
      .join("\n");
    sections.push(`INSIGHTS (${evidence.insights.length}):\n${insightText}`);
  }

  if (evidence.opportunities.length > 0) {
    const oppText = evidence.opportunities
      .map(
        (o) =>
          `- "${o.title}" (RICE: ${o.riceScore?.toFixed(1) ?? "N/A"}, backed by ${o.linkedInsightCount} insights)`,
      )
      .join("\n");
    sections.push(`OPPORTUNITIES (${evidence.opportunities.length}):\n${oppText}`);
  }

  if (evidence.themes.length > 0) {
    const themeText = evidence.themes
      .map((t) => `- "${t.title}" (${t.feedbackCount} items)`)
      .join("\n");
    sections.push(`THEMES (${evidence.themes.length}):\n${themeText}`);
  }

  if (evidence.competitors.length > 0) {
    const compText = evidence.competitors
      .map(
        (c) =>
          `- ${c.name}: ${c.favorableCount} favorable, ${c.unfavorableCount} unfavorable, ${c.switchingSignals} switching signals` +
          (c.topFeatureAreas.length > 0 ? `\n  Key areas: ${c.topFeatureAreas.join(", ")}` : ""),
      )
      .join("\n");
    sections.push(`COMPETITIVE INTEL:\n${compText}`);
  }

  sections.push(`TOTAL FEEDBACK ITEMS ANALYZED: ${evidence.totalFeedbackItems}`);

  return sections.join("\n\n");
}

/**
 * Filter and rank evidence based on query intent.
 * This is a lightweight client-side filter — heavy filtering happens in the DB query.
 */
export function rankEvidence(evidence: AssembledEvidence): AssembledEvidence {
  const { query } = evidence;

  let insights = [...evidence.insights];
  const opportunities = [...evidence.opportunities];

  switch (query.intent) {
    case "build_recommendation":
      // Sort opportunities by RICE score, insights by severity
      opportunities.sort((a, b) => (b.riceScore ?? 0) - (a.riceScore ?? 0));
      insights.sort((a, b) => b.severityScore - a.severityScore);
      break;

    case "pain_exploration":
      // Focus on pain points, high severity
      insights = insights
        .filter((i) => i.type === "PAIN_POINT" || i.severityScore >= 3)
        .sort((a, b) => b.severityScore - a.severityScore);
      break;

    case "segment_analysis":
      // Sort by frequency (segment-filtered data already from DB)
      insights.sort((a, b) => b.frequencyCount - a.frequencyCount);
      break;

    case "feature_inquiry":
      // Sort by frequency for the specific feature area
      insights.sort((a, b) => b.frequencyCount - a.frequencyCount);
      break;

    case "competitive":
      // Keep all, sort insights by severity
      insights.sort((a, b) => b.severityScore - a.severityScore);
      break;
  }

  return {
    ...evidence,
    insights: insights.slice(0, 15),
    opportunities: opportunities.slice(0, 10),
  };
}
