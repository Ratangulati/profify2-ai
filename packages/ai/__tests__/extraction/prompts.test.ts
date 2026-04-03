import { describe, it, expect } from "vitest";

import {
  buildPainPointPrompt,
  buildDesirePrompt,
  type FeedbackBatchItem,
} from "../../src/extraction/prompts.js";

const makeBatch = (count: number): FeedbackBatchItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `fb_${i}`,
    content: `Feedback content ${i}`,
    customerName: `User ${i}`,
    segmentTags: ["enterprise"],
  }));

describe("buildPainPointPrompt", () => {
  it("includes all feedback items with IDs", () => {
    const items = makeBatch(3);
    const prompt = buildPainPointPrompt(items);

    expect(prompt).toContain("(id: fb_0)");
    expect(prompt).toContain("(id: fb_1)");
    expect(prompt).toContain("(id: fb_2)");
    expect(prompt).toContain("Feedback content 0");
    expect(prompt).toContain("pain points");
    expect(prompt).toContain("severity");
  });

  it("requests JSON array output", () => {
    const prompt = buildPainPointPrompt(makeBatch(1));
    expect(prompt).toContain("JSON array");
    expect(prompt).toContain("no markdown fences");
  });
});

describe("buildDesirePrompt", () => {
  it("includes all feedback items with IDs", () => {
    const items = makeBatch(2);
    const prompt = buildDesirePrompt(items);

    expect(prompt).toContain("(id: fb_0)");
    expect(prompt).toContain("(id: fb_1)");
    expect(prompt).toContain("desires");
    expect(prompt).toContain("inferred_jtbd");
  });

  it("differentiates from pain points", () => {
    const prompt = buildDesirePrompt(makeBatch(1));
    expect(prompt).toContain("feature requests");
    expect(prompt).toContain("don't exist yet");
  });
});
