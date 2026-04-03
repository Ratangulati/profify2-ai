import { describe, it, expect } from "vitest";

import {
  buildSentimentPrompt,
  parseSentimentResponse,
  aggregateThemeSentiment,
  type FeedbackForSentiment,
} from "../../src/sentiment/analyzer.js";

describe("buildSentimentPrompt", () => {
  it("includes all items with IDs", () => {
    const items: FeedbackForSentiment[] = [
      { id: "fb_1", content: "I love this product" },
      { id: "fb_2", content: "Terrible experience" },
    ];
    const prompt = buildSentimentPrompt(items);
    expect(prompt).toContain("(id: fb_1)");
    expect(prompt).toContain("(id: fb_2)");
    expect(prompt).toContain("I love this product");
    expect(prompt).toContain("-1.0");
    expect(prompt).toContain("1.0");
  });

  it("requests JSON array output", () => {
    const prompt = buildSentimentPrompt([{ id: "x", content: "test" }]);
    expect(prompt).toContain("JSON array");
    expect(prompt).toContain("no markdown fences");
  });
});

describe("parseSentimentResponse", () => {
  it("parses valid JSON response", () => {
    const raw = JSON.stringify([
      { id: "fb_1", score: 0.8, label: "POSITIVE", justification: "User is happy" },
      { id: "fb_2", score: -0.6, label: "NEGATIVE", justification: "User is frustrated" },
    ]);
    const results = parseSentimentResponse(raw);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("fb_1");
    expect(results[0].score).toBe(0.8);
    expect(results[0].label).toBe("POSITIVE");
    expect(results[1].score).toBe(-0.6);
    expect(results[1].label).toBe("NEGATIVE");
  });

  it("clamps scores to [-1, 1] range", () => {
    const raw = JSON.stringify([
      { id: "fb_1", score: 2.5, label: "POSITIVE", justification: "" },
      { id: "fb_2", score: -3.0, label: "NEGATIVE", justification: "" },
    ]);
    const results = parseSentimentResponse(raw);
    expect(results[0].score).toBe(1);
    expect(results[1].score).toBe(-1);
  });

  it("handles markdown code fences", () => {
    const raw = '```json\n[{"id":"x","score":0.5,"label":"POSITIVE","justification":"ok"}]\n```';
    const results = parseSentimentResponse(raw);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.5);
  });

  it("normalizes invalid labels to NEUTRAL", () => {
    const raw = JSON.stringify([{ id: "x", score: 0, label: "HAPPY", justification: "" }]);
    const results = parseSentimentResponse(raw);
    expect(results[0].label).toBe("NEUTRAL");
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseSentimentResponse("not json")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseSentimentResponse('{"id":"x"}')).toEqual([]);
  });

  it("handles NaN scores as 0", () => {
    const raw = JSON.stringify([{ id: "x", score: "abc", label: "NEUTRAL", justification: "" }]);
    const results = parseSentimentResponse(raw);
    expect(results[0].score).toBe(0);
  });
});

describe("aggregateThemeSentiment", () => {
  it("computes weighted average sentiment", () => {
    const items = [
      { sentimentScore: 0.5, freshnessWeight: 1.0 },
      { sentimentScore: -0.5, freshnessWeight: 1.0 },
    ];
    expect(aggregateThemeSentiment(items)).toBe(0);
  });

  it("applies freshness weights", () => {
    const items = [
      { sentimentScore: 1.0, freshnessWeight: 2.0 }, // recent, high weight
      { sentimentScore: -1.0, freshnessWeight: 0.5 }, // old, low weight
    ];
    // (1.0 * 2.0 + -1.0 * 0.5) / (2.0 + 0.5) = 1.5 / 2.5 = 0.6
    expect(aggregateThemeSentiment(items)).toBeCloseTo(0.6, 5);
  });

  it("ignores null sentiment scores", () => {
    const items = [{ sentimentScore: 0.8 }, { sentimentScore: null }];
    expect(aggregateThemeSentiment(items)).toBe(0.8);
  });

  it("returns 0 for empty array", () => {
    expect(aggregateThemeSentiment([])).toBe(0);
  });

  it("returns 0 when all scores are null", () => {
    const items = [{ sentimentScore: null }, { sentimentScore: null }];
    expect(aggregateThemeSentiment(items)).toBe(0);
  });
});
