import { describe, it, expect } from "vitest";

import {
  calculateFrequency,
  calculateAverageSeverity,
  calculateTrend,
  calculateSegmentDistribution,
  calculateInsightScores,
  type EvidenceItem,
} from "../../src/extraction/scoring.js";

const daysAgo = (n: number, from: Date = new Date()): Date =>
  new Date(from.getTime() - n * 24 * 60 * 60 * 1000);

describe("calculateFrequency", () => {
  it("returns the count of evidence items", () => {
    const items: EvidenceItem[] = [
      { feedbackItemCreatedAt: new Date(), segmentTags: [] },
      { feedbackItemCreatedAt: new Date(), segmentTags: [] },
      { feedbackItemCreatedAt: new Date(), segmentTags: [] },
    ];
    expect(calculateFrequency(items)).toBe(3);
  });

  it("returns 0 for empty array", () => {
    expect(calculateFrequency([])).toBe(0);
  });
});

describe("calculateAverageSeverity", () => {
  it("averages severity scores", () => {
    const items: EvidenceItem[] = [
      { feedbackItemCreatedAt: new Date(), segmentTags: [], severity: 4 },
      { feedbackItemCreatedAt: new Date(), segmentTags: [], severity: 2 },
    ];
    expect(calculateAverageSeverity(items)).toBe(3);
  });

  it("ignores null/undefined severity", () => {
    const items: EvidenceItem[] = [
      { feedbackItemCreatedAt: new Date(), segmentTags: [], severity: 5 },
      { feedbackItemCreatedAt: new Date(), segmentTags: [] },
      { feedbackItemCreatedAt: new Date(), segmentTags: [], severity: undefined },
    ];
    expect(calculateAverageSeverity(items)).toBe(5);
  });

  it("returns 0 when no severity values present", () => {
    const items: EvidenceItem[] = [{ feedbackItemCreatedAt: new Date(), segmentTags: [] }];
    expect(calculateAverageSeverity(items)).toBe(0);
  });

  it("ignores zero severity", () => {
    const items: EvidenceItem[] = [
      { feedbackItemCreatedAt: new Date(), segmentTags: [], severity: 0 },
      { feedbackItemCreatedAt: new Date(), segmentTags: [], severity: 4 },
    ];
    expect(calculateAverageSeverity(items)).toBe(4);
  });
});

describe("calculateTrend", () => {
  const now = new Date("2026-03-28T12:00:00Z");

  it("returns INCREASING when recent > 1.5x previous", () => {
    const items: EvidenceItem[] = [
      // 3 recent (last 30 days)
      { feedbackItemCreatedAt: daysAgo(5, now), segmentTags: [] },
      { feedbackItemCreatedAt: daysAgo(10, now), segmentTags: [] },
      { feedbackItemCreatedAt: daysAgo(15, now), segmentTags: [] },
      // 1 previous (31-60 days ago)
      { feedbackItemCreatedAt: daysAgo(45, now), segmentTags: [] },
    ];
    expect(calculateTrend(items, now)).toBe("INCREASING");
  });

  it("returns DECREASING when recent < 0.5x previous", () => {
    const items: EvidenceItem[] = [
      // 1 recent
      { feedbackItemCreatedAt: daysAgo(5, now), segmentTags: [] },
      // 3 previous
      { feedbackItemCreatedAt: daysAgo(35, now), segmentTags: [] },
      { feedbackItemCreatedAt: daysAgo(40, now), segmentTags: [] },
      { feedbackItemCreatedAt: daysAgo(50, now), segmentTags: [] },
    ];
    expect(calculateTrend(items, now)).toBe("DECREASING");
  });

  it("returns STABLE when ratio is between 0.5 and 1.5", () => {
    const items: EvidenceItem[] = [
      { feedbackItemCreatedAt: daysAgo(5, now), segmentTags: [] },
      { feedbackItemCreatedAt: daysAgo(10, now), segmentTags: [] },
      { feedbackItemCreatedAt: daysAgo(35, now), segmentTags: [] },
      { feedbackItemCreatedAt: daysAgo(40, now), segmentTags: [] },
    ];
    expect(calculateTrend(items, now)).toBe("STABLE");
  });

  it("returns STABLE for fewer than 3 items in range", () => {
    const items: EvidenceItem[] = [{ feedbackItemCreatedAt: daysAgo(5, now), segmentTags: [] }];
    expect(calculateTrend(items, now)).toBe("STABLE");
  });

  it("returns INCREASING when previous is 0 but recent > 0", () => {
    const items: EvidenceItem[] = [
      { feedbackItemCreatedAt: daysAgo(1, now), segmentTags: [] },
      { feedbackItemCreatedAt: daysAgo(2, now), segmentTags: [] },
      { feedbackItemCreatedAt: daysAgo(3, now), segmentTags: [] },
    ];
    expect(calculateTrend(items, now)).toBe("INCREASING");
  });
});

describe("calculateSegmentDistribution", () => {
  it("counts segment tags across items", () => {
    const items: EvidenceItem[] = [
      { feedbackItemCreatedAt: new Date(), segmentTags: ["enterprise", "us"] },
      { feedbackItemCreatedAt: new Date(), segmentTags: ["enterprise", "eu"] },
      { feedbackItemCreatedAt: new Date(), segmentTags: ["startup"] },
    ];
    const dist = calculateSegmentDistribution(items);
    expect(dist).toEqual({ enterprise: 2, us: 1, eu: 1, startup: 1 });
  });

  it("returns empty object for no tags", () => {
    const items: EvidenceItem[] = [{ feedbackItemCreatedAt: new Date(), segmentTags: [] }];
    expect(calculateSegmentDistribution(items)).toEqual({});
  });
});

describe("calculateInsightScores", () => {
  it("returns combined scores", () => {
    const now = new Date("2026-03-28T12:00:00Z");
    const items: EvidenceItem[] = [
      { feedbackItemCreatedAt: daysAgo(5, now), segmentTags: ["enterprise"], severity: 4 },
      { feedbackItemCreatedAt: daysAgo(10, now), segmentTags: ["enterprise"], severity: 2 },
      { feedbackItemCreatedAt: daysAgo(45, now), segmentTags: ["startup"], severity: 3 },
    ];
    const scores = calculateInsightScores(items);

    expect(scores.frequency).toBe(3);
    expect(scores.severity).toBe(3); // (4+2+3)/3
    expect(scores.trend).toBe("INCREASING"); // 2 recent vs 1 previous
    expect(scores.segmentDistribution).toEqual({ enterprise: 2, startup: 1 });
  });
});
