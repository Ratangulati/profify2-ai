import { describe, it, expect } from "vitest";

import {
  buildExtractionPrompt,
  parseExtractionResponse,
} from "../../src/competitive/extraction.js";

describe("buildExtractionPrompt", () => {
  it("includes feedback content", () => {
    const prompt = buildExtractionPrompt("Notion has better search than you");
    expect(prompt).toContain("Notion has better search than you");
  });

  it("includes all extraction fields", () => {
    const prompt = buildExtractionPrompt("test");
    expect(prompt).toContain("competitor_name");
    expect(prompt).toContain("comparison_type");
    expect(prompt).toContain("feature_area");
    expect(prompt).toContain("switching_signal");
  });
});

describe("parseExtractionResponse", () => {
  it("parses valid extraction response", () => {
    const raw = JSON.stringify([
      {
        competitor_name: "Notion",
        comparison_type: "favorable",
        feature_area: "search",
        specific_advantage: "Full-text search is much faster",
        verbatim_quote: "Notion search is 10x better",
        switching_signal: true,
      },
    ]);
    const results = parseExtractionResponse(raw);
    expect(results).toHaveLength(1);
    expect(results[0].competitorName).toBe("Notion");
    expect(results[0].comparisonType).toBe("favorable");
    expect(results[0].featureArea).toBe("search");
    expect(results[0].switchingSignal).toBe(true);
  });

  it("defaults unknown comparison_type to neutral", () => {
    const raw = JSON.stringify([
      {
        competitor_name: "Notion",
        comparison_type: "UNKNOWN",
        feature_area: null,
        specific_advantage: null,
        verbatim_quote: "I use Notion",
        switching_signal: false,
      },
    ]);
    const results = parseExtractionResponse(raw);
    expect(results[0].comparisonType).toBe("neutral");
  });

  it("handles null optional fields", () => {
    const raw = JSON.stringify([
      {
        competitor_name: "Linear",
        comparison_type: "unfavorable",
        verbatim_quote: "Linear is worse for our workflow",
      },
    ]);
    const results = parseExtractionResponse(raw);
    expect(results[0].featureArea).toBeNull();
    expect(results[0].specificAdvantage).toBeNull();
    expect(results[0].switchingSignal).toBe(false);
  });

  it("filters out entries missing required fields", () => {
    const raw = JSON.stringify([
      { comparison_type: "favorable", verbatim_quote: "test" }, // missing competitor_name
    ]);
    const results = parseExtractionResponse(raw);
    expect(results).toHaveLength(0);
  });

  it("returns empty for invalid JSON", () => {
    expect(parseExtractionResponse("bad json")).toEqual([]);
  });

  it("handles markdown-fenced JSON", () => {
    const raw =
      "```json\n" +
      JSON.stringify([
        {
          competitor_name: "Aha!",
          comparison_type: "neutral",
          verbatim_quote: "We also looked at Aha!",
          feature_area: null,
          specific_advantage: null,
          switching_signal: false,
        },
      ]) +
      "\n```";
    const results = parseExtractionResponse(raw);
    expect(results).toHaveLength(1);
  });
});
