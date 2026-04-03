import { describe, it, expect } from "vitest";

import { buildResponsePrompt, parseQueryResponse } from "../../src/query/response.js";

describe("buildResponsePrompt", () => {
  it("includes question and evidence", () => {
    const prompt = buildResponsePrompt("What should we build?", "INSIGHTS:\n- Search is slow");
    expect(prompt).toContain("What should we build?");
    expect(prompt).toContain("Search is slow");
  });

  it("specifies required JSON fields", () => {
    const prompt = buildResponsePrompt("test", "evidence");
    expect(prompt).toContain("summary");
    expect(prompt).toContain("recommendations");
    expect(prompt).toContain("risks");
    expect(prompt).toContain("next_steps");
  });
});

describe("parseQueryResponse", () => {
  it("parses valid JSON response", () => {
    const raw = JSON.stringify({
      summary: "You should focus on search improvements.",
      recommendations: [
        {
          title: "Overhaul search",
          reasoning: "Users consistently report slow search.",
          confidence_level: "high",
          evidence_count: 30,
          key_quote: "Search takes forever",
          linked_themes: ["Performance", "Search"],
        },
      ],
      risks: ["Search rewrite is complex"],
      next_steps: ["Benchmark current search performance"],
    });

    const result = parseQueryResponse(raw, "What should we build?");
    expect(result.summary).toContain("search improvements");
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].title).toBe("Overhaul search");
    expect(result.recommendations[0].confidenceLevel).toBe("high");
    expect(result.recommendations[0].evidenceCount).toBe(30);
    expect(result.risks).toHaveLength(1);
    expect(result.nextSteps).toHaveLength(1);
    expect(result.query).toBe("What should we build?");
  });

  it("handles markdown-fenced JSON", () => {
    const raw =
      "```json\n" +
      JSON.stringify({
        summary: "Focus on mobile.",
        recommendations: [],
        risks: [],
        next_steps: [],
      }) +
      "\n```";
    const result = parseQueryResponse(raw, "q");
    expect(result.summary).toBe("Focus on mobile.");
  });

  it("defaults unknown confidence level to medium", () => {
    const raw = JSON.stringify({
      summary: "s",
      recommendations: [
        {
          title: "t",
          reasoning: "r",
          confidence_level: "MEGA_HIGH",
          evidence_count: 1,
          key_quote: null,
          linked_themes: [],
        },
      ],
      risks: [],
      next_steps: [],
    });
    const result = parseQueryResponse(raw, "q");
    expect(result.recommendations[0].confidenceLevel).toBe("medium");
  });

  it("falls back gracefully for invalid JSON", () => {
    const result = parseQueryResponse("Just build better search, honestly.", "q");
    expect(result.summary).toContain("Just build better search");
    expect(result.recommendations).toEqual([]);
  });

  it("filters non-string risks and next_steps", () => {
    const raw = JSON.stringify({
      summary: "s",
      recommendations: [],
      risks: ["real risk", 123, null],
      next_steps: [true, "real step"],
    });
    const result = parseQueryResponse(raw, "q");
    expect(result.risks).toEqual(["real risk"]);
    expect(result.nextSteps).toEqual(["real step"]);
  });

  it("filters recommendations with missing required fields", () => {
    const raw = JSON.stringify({
      summary: "s",
      recommendations: [
        { reasoning: "no title" }, // missing title
        {
          title: "has title",
          reasoning: "has reasoning",
          confidence_level: "low",
          evidence_count: 0,
          key_quote: null,
          linked_themes: [],
        },
      ],
      risks: [],
      next_steps: [],
    });
    const result = parseQueryResponse(raw, "q");
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].title).toBe("has title");
  });
});
