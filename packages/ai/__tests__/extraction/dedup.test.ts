import { describe, it, expect } from "vitest";

import {
  cosineSimilarity,
  findDuplicate,
  type InsightForDedup,
} from "../../src/extraction/dedup.js";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 0, 0, 1];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for zero vector", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("computes correct similarity for known vectors", () => {
    // cos([1,2,3], [4,5,6]) = 32 / (sqrt(14) * sqrt(77)) ≈ 0.9746
    const sim = cosineSimilarity([1, 2, 3], [4, 5, 6]);
    expect(sim).toBeCloseTo(0.9746, 3);
  });
});

describe("findDuplicate", () => {
  const existing: InsightForDedup[] = [
    {
      id: "ins_1",
      title: "Slow loading",
      description: "Dashboard is slow",
      embedding: [1, 0, 0],
      frequencyCount: 5,
    },
    {
      id: "ins_2",
      title: "Missing export",
      description: "No CSV export",
      embedding: [0, 1, 0],
      frequencyCount: 3,
    },
    {
      id: "ins_3",
      title: "Empty embedding",
      description: "No data",
      embedding: [],
      frequencyCount: 1,
    },
  ];

  it("returns the closest match above threshold", () => {
    // Very similar to ins_1
    const match = findDuplicate([0.99, 0.01, 0], existing, 0.85);
    expect(match?.id).toBe("ins_1");
  });

  it("returns null when no match exceeds threshold", () => {
    // Equidistant from both, low similarity
    const match = findDuplicate([0.5, 0.5, 0.5], existing, 0.95);
    expect(match).toBeNull();
  });

  it("skips insights with empty embeddings", () => {
    const match = findDuplicate([0, 0, 1], existing, 0.1);
    // ins_3 has empty embedding, should not match even though [0,0,1] is orthogonal to others
    expect(match?.id).not.toBe("ins_3");
  });

  it("returns null for empty existing list", () => {
    const match = findDuplicate([1, 0, 0], [], 0.85);
    expect(match).toBeNull();
  });

  it("picks the highest similarity when multiple exceed threshold", () => {
    const similar: InsightForDedup[] = [
      { id: "a", title: "A", description: "A", embedding: [0.9, 0.1, 0], frequencyCount: 1 },
      { id: "b", title: "B", description: "B", embedding: [0.95, 0.05, 0], frequencyCount: 1 },
    ];
    const match = findDuplicate([1, 0, 0], similar, 0.85);
    expect(match?.id).toBe("b");
  });
});
