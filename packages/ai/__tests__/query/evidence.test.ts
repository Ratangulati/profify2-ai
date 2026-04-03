import { describe, it, expect } from "vitest";

import {
  formatEvidenceForLLM,
  rankEvidence,
  type AssembledEvidence,
} from "../../src/query/evidence.js";

const BASE_EVIDENCE: AssembledEvidence = {
  query: {
    intent: "build_recommendation",
    segments: [],
    featureArea: null,
    competitor: null,
    constraints: [],
    rawQuery: "What should we build?",
  },
  insights: [
    {
      id: "i1",
      title: "Slow search",
      type: "PAIN_POINT",
      severityScore: 4.5,
      frequencyCount: 30,
      trend: "INCREASING",
      topQuotes: ["Search is too slow"],
    },
    {
      id: "i2",
      title: "Better exports",
      type: "DESIRE",
      severityScore: 2.0,
      frequencyCount: 10,
      trend: "STABLE",
      topQuotes: [],
    },
    {
      id: "i3",
      title: "Login issues",
      type: "PAIN_POINT",
      severityScore: 3.5,
      frequencyCount: 20,
      trend: "STABLE",
      topQuotes: ["Can't log in"],
    },
  ],
  opportunities: [
    { id: "o1", title: "Search overhaul", riceScore: 85, linkedInsightCount: 5 },
    { id: "o2", title: "Export v2", riceScore: 40, linkedInsightCount: 2 },
  ],
  themes: [{ id: "t1", title: "Performance", feedbackCount: 100 }],
  competitors: [
    {
      name: "Notion",
      favorableCount: 10,
      unfavorableCount: 5,
      switchingSignals: 3,
      topFeatureAreas: ["search"],
    },
  ],
  totalFeedbackItems: 500,
};

describe("formatEvidenceForLLM", () => {
  it("includes insights section", () => {
    const text = formatEvidenceForLLM(BASE_EVIDENCE);
    expect(text).toContain("INSIGHTS (3)");
    expect(text).toContain("Slow search");
    expect(text).toContain("severity: 4.5");
  });

  it("includes first quote", () => {
    const text = formatEvidenceForLLM(BASE_EVIDENCE);
    expect(text).toContain("Search is too slow");
  });

  it("includes opportunities section", () => {
    const text = formatEvidenceForLLM(BASE_EVIDENCE);
    expect(text).toContain("OPPORTUNITIES (2)");
    expect(text).toContain("Search overhaul");
  });

  it("includes themes section", () => {
    const text = formatEvidenceForLLM(BASE_EVIDENCE);
    expect(text).toContain("THEMES (1)");
    expect(text).toContain("Performance");
  });

  it("includes competitive intel", () => {
    const text = formatEvidenceForLLM(BASE_EVIDENCE);
    expect(text).toContain("COMPETITIVE INTEL");
    expect(text).toContain("Notion");
    expect(text).toContain("3 switching signals");
  });

  it("includes total feedback count", () => {
    const text = formatEvidenceForLLM(BASE_EVIDENCE);
    expect(text).toContain("500");
  });
});

describe("rankEvidence", () => {
  it("sorts opportunities by RICE for build_recommendation", () => {
    const ranked = rankEvidence(BASE_EVIDENCE);
    expect(ranked.opportunities[0].title).toBe("Search overhaul");
  });

  it("filters to pain points for pain_exploration", () => {
    const evidence = {
      ...BASE_EVIDENCE,
      query: { ...BASE_EVIDENCE.query, intent: "pain_exploration" as const },
    };
    const ranked = rankEvidence(evidence);
    expect(ranked.insights.every((i) => i.type === "PAIN_POINT" || i.severityScore >= 3)).toBe(
      true,
    );
  });

  it("sorts by frequency for segment_analysis", () => {
    const evidence = {
      ...BASE_EVIDENCE,
      query: { ...BASE_EVIDENCE.query, intent: "segment_analysis" as const },
    };
    const ranked = rankEvidence(evidence);
    expect(ranked.insights[0].frequencyCount).toBeGreaterThanOrEqual(
      ranked.insights[1].frequencyCount,
    );
  });

  it("limits insights to 15", () => {
    const manyInsights = Array(20)
      .fill(null)
      .map((_, i) => ({
        id: `i${i}`,
        title: `Insight ${i}`,
        type: "PAIN_POINT",
        severityScore: i,
        frequencyCount: i,
        trend: "STABLE",
        topQuotes: [],
      }));
    const evidence = { ...BASE_EVIDENCE, insights: manyInsights };
    const ranked = rankEvidence(evidence);
    expect(ranked.insights.length).toBeLessThanOrEqual(15);
  });
});
