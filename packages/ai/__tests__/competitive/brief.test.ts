import { describe, it, expect } from "vitest";

import { buildBriefPrompt, type CompetitiveDataSummary } from "../../src/competitive/brief.js";

const SUMMARY: CompetitiveDataSummary = {
  competitorName: "Notion",
  totalMentions: 50,
  favorableCount: 20,
  unfavorableCount: 15,
  neutralCount: 15,
  switchingSignals: 5,
  featureAreas: [
    { area: "search", favorable: 12, unfavorable: 3, advantages: ["Full-text search is faster"] },
    {
      area: "collaboration",
      favorable: 5,
      unfavorable: 8,
      advantages: ["Real-time editing is smoother"],
    },
  ],
  recentQuotes: ["Notion search is so much better", "We prefer your pricing model"],
};

describe("buildBriefPrompt", () => {
  it("includes competitor name", () => {
    const prompt = buildBriefPrompt(null, SUMMARY);
    expect(prompt).toContain("Notion");
  });

  it("includes feature area when specified", () => {
    const prompt = buildBriefPrompt("search", SUMMARY);
    expect(prompt).toContain('"search"');
  });

  it("includes mention counts", () => {
    const prompt = buildBriefPrompt(null, SUMMARY);
    expect(prompt).toContain("TOTAL MENTIONS: 50");
    expect(prompt).toContain("FAVORABLE (they prefer competitor): 20");
    expect(prompt).toContain("SWITCHING SIGNALS: 5");
  });

  it("includes feature breakdown", () => {
    const prompt = buildBriefPrompt(null, SUMMARY);
    expect(prompt).toContain("search");
    expect(prompt).toContain("collaboration");
    expect(prompt).toContain("Full-text search is faster");
  });

  it("includes sample quotes", () => {
    const prompt = buildBriefPrompt(null, SUMMARY);
    expect(prompt).toContain("Notion search is so much better");
  });

  it("includes required output sections", () => {
    const prompt = buildBriefPrompt(null, SUMMARY);
    expect(prompt).toContain("perceived as stronger");
    expect(prompt).toContain("Key gaps to close");
    expect(prompt).toContain("positioning strategy");
  });
});
