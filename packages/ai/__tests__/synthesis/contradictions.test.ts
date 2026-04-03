import { describe, it, expect } from "vitest";

import {
  buildContradictionPrompt,
  parseContradictionResponse,
  type InsightForContradiction,
} from "../../src/synthesis/contradictions.js";

describe("buildContradictionPrompt", () => {
  it("includes all insight IDs and descriptions", () => {
    const insights: InsightForContradiction[] = [
      {
        id: "i1",
        title: "Users want speed",
        description: "Users prefer faster load times",
        type: "DESIRE",
      },
      {
        id: "i2",
        title: "Users want features",
        description: "Users prefer more features",
        type: "DESIRE",
      },
    ];
    const prompt = buildContradictionPrompt(insights);
    expect(prompt).toContain("[i1]");
    expect(prompt).toContain("[i2]");
    expect(prompt).toContain("Users prefer faster load times");
    expect(prompt).toContain("Users prefer more features");
  });

  it("includes type labels", () => {
    const insights: InsightForContradiction[] = [
      { id: "i1", title: "Pain", description: "desc", type: "PAIN_POINT" },
    ];
    const prompt = buildContradictionPrompt(insights);
    expect(prompt).toContain("(PAIN_POINT)");
  });

  it("instructs to return JSON array", () => {
    const prompt = buildContradictionPrompt([
      { id: "i1", title: "A", description: "a", type: "DESIRE" },
      { id: "i2", title: "B", description: "b", type: "DESIRE" },
    ]);
    expect(prompt).toContain("JSON array");
  });
});

describe("parseContradictionResponse", () => {
  it("parses valid JSON response", () => {
    const raw = JSON.stringify([
      {
        insight_a_id: "i1",
        insight_b_id: "i2",
        description: "Speed vs features conflict",
        explanation: "Users want both speed and features but they trade off.",
        recommended_resolution: "Prioritize based on segment.",
      },
    ]);
    const result = parseContradictionResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].insightAId).toBe("i1");
    expect(result[0].insightBId).toBe("i2");
    expect(result[0].description).toBe("Speed vs features conflict");
    expect(result[0].recommendedResolution).toBe("Prioritize based on segment.");
  });

  it("handles markdown-fenced JSON", () => {
    const raw =
      "```json\n" +
      JSON.stringify([
        {
          insight_a_id: "i1",
          insight_b_id: "i2",
          description: "Conflict",
          explanation: "They conflict",
          recommended_resolution: null,
        },
      ]) +
      "\n```";
    const result = parseContradictionResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].recommendedResolution).toBeNull();
  });

  it("filters out entries where insight_a_id equals insight_b_id", () => {
    const raw = JSON.stringify([
      {
        insight_a_id: "i1",
        insight_b_id: "i1",
        description: "Self-conflict",
        explanation: "Same insight",
        recommended_resolution: null,
      },
    ]);
    const result = parseContradictionResponse(raw);
    expect(result).toHaveLength(0);
  });

  it("filters out entries with missing required fields", () => {
    const raw = JSON.stringify([
      { insight_a_id: "i1", description: "Missing B", explanation: "test" },
      { insight_a_id: "i1", insight_b_id: "i2", description: 123, explanation: "test" },
    ]);
    const result = parseContradictionResponse(raw);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for invalid JSON", () => {
    const result = parseContradictionResponse("not json at all");
    expect(result).toEqual([]);
  });

  it("returns empty array for empty array response", () => {
    const result = parseContradictionResponse("[]");
    expect(result).toEqual([]);
  });

  it("handles null recommended_resolution", () => {
    const raw = JSON.stringify([
      {
        insight_a_id: "i1",
        insight_b_id: "i2",
        description: "Conflict",
        explanation: "They conflict",
        recommended_resolution: null,
      },
    ]);
    const result = parseContradictionResponse(raw);
    expect(result[0].recommendedResolution).toBeNull();
  });

  it("handles missing recommended_resolution (converts to null)", () => {
    const raw = JSON.stringify([
      {
        insight_a_id: "i1",
        insight_b_id: "i2",
        description: "Conflict",
        explanation: "They conflict",
      },
    ]);
    const result = parseContradictionResponse(raw);
    expect(result[0].recommendedResolution).toBeNull();
  });
});
