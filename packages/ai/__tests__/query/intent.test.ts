import { describe, it, expect } from "vitest";

import {
  classifyByPattern,
  buildIntentPrompt,
  parseIntentResponse,
} from "../../src/query/intent.js";

describe("classifyByPattern", () => {
  it("classifies build recommendation queries", () => {
    expect(classifyByPattern("What should we build next?")).toBe("build_recommendation");
    expect(classifyByPattern("What to build this quarter")).toBe("build_recommendation");
    expect(classifyByPattern("Help me prioritize features")).toBe("build_recommendation");
    expect(classifyByPattern("What are the top opportunities?")).toBe("build_recommendation");
  });

  it("classifies segment analysis queries", () => {
    expect(classifyByPattern("What do enterprise users want?")).toBe("segment_analysis");
    expect(classifyByPattern("Feedback from SMB customers")).toBe("segment_analysis");
  });

  it("classifies pain exploration queries", () => {
    expect(classifyByPattern("Why are users churning?")).toBe("pain_exploration");
    expect(classifyByPattern("What are users struggling with?")).toBe("pain_exploration");
    expect(classifyByPattern("Top frustrations this month")).toBe("pain_exploration");
  });

  it("classifies feature inquiry queries", () => {
    expect(classifyByPattern("What do users think about our search?")).toBe("feature_inquiry");
    expect(classifyByPattern("Feedback on the new dashboard")).toBe("feature_inquiry");
  });

  it("classifies competitive queries", () => {
    expect(classifyByPattern("How do we compare to Notion?")).toBe("competitive");
    expect(classifyByPattern("Competitor analysis vs Linear")).toBe("competitive");
  });

  it("returns null for unclassifiable queries", () => {
    expect(classifyByPattern("hello")).toBeNull();
    expect(classifyByPattern("what time is it")).toBeNull();
  });
});

describe("buildIntentPrompt", () => {
  it("includes the user's question", () => {
    const prompt = buildIntentPrompt("What should we build?");
    expect(prompt).toContain("What should we build?");
  });

  it("lists all intent types", () => {
    const prompt = buildIntentPrompt("test");
    expect(prompt).toContain("build_recommendation");
    expect(prompt).toContain("segment_analysis");
    expect(prompt).toContain("pain_exploration");
    expect(prompt).toContain("feature_inquiry");
    expect(prompt).toContain("competitive");
  });
});

describe("parseIntentResponse", () => {
  it("parses valid JSON response", () => {
    const raw = JSON.stringify({
      intent: "segment_analysis",
      segments: ["enterprise"],
      feature_area: null,
      competitor: null,
      constraints: ["last 30 days"],
    });
    const result = parseIntentResponse(raw, "What do enterprise users want?");
    expect(result.intent).toBe("segment_analysis");
    expect(result.segments).toEqual(["enterprise"]);
    expect(result.featureArea).toBeNull();
    expect(result.constraints).toEqual(["last 30 days"]);
  });

  it("defaults to build_recommendation for unknown intent", () => {
    const raw = JSON.stringify({
      intent: "unknown_type",
      segments: [],
      feature_area: null,
      competitor: null,
      constraints: [],
    });
    const result = parseIntentResponse(raw, "some query");
    expect(result.intent).toBe("build_recommendation");
  });

  it("falls back to pattern matching for invalid JSON", () => {
    const result = parseIntentResponse("not json", "Why are users churning?");
    expect(result.intent).toBe("pain_exploration");
    expect(result.segments).toEqual([]);
  });

  it("handles markdown-fenced JSON", () => {
    const raw =
      "```json\n" +
      JSON.stringify({
        intent: "competitive",
        segments: [],
        feature_area: "search",
        competitor: "Notion",
        constraints: [],
      }) +
      "\n```";
    const result = parseIntentResponse(raw, "How do we compare to Notion on search?");
    expect(result.intent).toBe("competitive");
    expect(result.featureArea).toBe("search");
    expect(result.competitor).toBe("Notion");
  });

  it("preserves original query", () => {
    const raw = JSON.stringify({
      intent: "build_recommendation",
      segments: [],
      feature_area: null,
      competitor: null,
      constraints: [],
    });
    const result = parseIntentResponse(raw, "What should we build?");
    expect(result.rawQuery).toBe("What should we build?");
  });

  it("filters non-string segments and constraints", () => {
    const raw = JSON.stringify({
      intent: "segment_analysis",
      segments: ["enterprise", 123, null],
      feature_area: null,
      competitor: null,
      constraints: [true, "recent"],
    });
    const result = parseIntentResponse(raw, "query");
    expect(result.segments).toEqual(["enterprise"]);
    expect(result.constraints).toEqual(["recent"]);
  });
});
