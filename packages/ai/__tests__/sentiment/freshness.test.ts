import { describe, it, expect } from "vitest";

import {
  computeFreshnessWeight,
  freshnessWeightedFrequency,
  freshnessWeightedSeverity,
} from "../../src/sentiment/freshness.js";

const daysAgo = (n: number, from: Date = new Date()): Date =>
  new Date(from.getTime() - n * 24 * 60 * 60 * 1000);

const now = new Date("2026-03-28T12:00:00Z");

describe("computeFreshnessWeight", () => {
  it("returns 1.0 for items ingested right now", () => {
    expect(computeFreshnessWeight(now, now, 90)).toBe(1);
  });

  it("returns 0.5 for items ingested at half-life", () => {
    expect(computeFreshnessWeight(daysAgo(90, now), now, 90)).toBeCloseTo(0.5, 5);
  });

  it("returns ~0.333 for items ingested at 2x half-life", () => {
    expect(computeFreshnessWeight(daysAgo(180, now), now, 90)).toBeCloseTo(1 / 3, 3);
  });

  it("returns ~0.25 for items ingested at 3x half-life", () => {
    expect(computeFreshnessWeight(daysAgo(270, now), now, 90)).toBeCloseTo(0.25, 3);
  });

  it("handles custom half-life", () => {
    // half-life of 30 days, item is 30 days old → 0.5
    expect(computeFreshnessWeight(daysAgo(30, now), now, 30)).toBeCloseTo(0.5, 5);
  });

  it("never returns negative for future dates", () => {
    const future = new Date(now.getTime() + 1000 * 60 * 60 * 24);
    expect(computeFreshnessWeight(future, now, 90)).toBe(1);
  });
});

describe("freshnessWeightedFrequency", () => {
  it("sums freshness weights", () => {
    const items = [
      { ingestedAt: now }, // weight ~1.0
      { ingestedAt: daysAgo(90, now) }, // weight ~0.5
    ];
    const result = freshnessWeightedFrequency(items, now, 90);
    expect(result).toBeCloseTo(1.5, 2);
  });

  it("returns 0 for empty array", () => {
    expect(freshnessWeightedFrequency([], now, 90)).toBe(0);
  });

  it("returns N for N items all ingested now", () => {
    const items = Array(5)
      .fill(null)
      .map(() => ({ ingestedAt: now }));
    expect(freshnessWeightedFrequency(items, now, 90)).toBe(5);
  });
});

describe("freshnessWeightedSeverity", () => {
  it("weights recent items more heavily", () => {
    const items = [
      { ingestedAt: now, severity: 5 }, // weight ~1.0
      { ingestedAt: daysAgo(90, now), severity: 1 }, // weight ~0.5
    ];
    const result = freshnessWeightedSeverity(items, now, 90);
    // (5 * 1.0 + 1 * 0.5) / (1.0 + 0.5) = 5.5 / 1.5 ≈ 3.667
    expect(result).toBeCloseTo(3.667, 2);
  });

  it("returns 0 for empty array", () => {
    expect(freshnessWeightedSeverity([], now, 90)).toBe(0);
  });

  it("returns exact severity when all items are fresh", () => {
    const items = [
      { ingestedAt: now, severity: 3 },
      { ingestedAt: now, severity: 3 },
    ];
    expect(freshnessWeightedSeverity(items, now, 90)).toBe(3);
  });
});
