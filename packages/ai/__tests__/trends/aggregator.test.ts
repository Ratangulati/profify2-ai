import { describe, it, expect } from "vitest";

import {
  aggregateWeekly,
  fillMissingWeeks,
  type FeedbackForAggregation,
} from "../../src/trends/aggregator.js";

describe("aggregateWeekly", () => {
  it("groups items into weekly buckets", () => {
    const items: FeedbackForAggregation[] = [
      {
        id: "1",
        ingestedAt: new Date("2026-03-23T10:00:00Z"),
        sentimentScore: 0.5,
        dataSourceType: "INTERCOM",
      },
      {
        id: "2",
        ingestedAt: new Date("2026-03-24T10:00:00Z"),
        sentimentScore: -0.5,
        dataSourceType: "ZENDESK",
      },
      {
        id: "3",
        ingestedAt: new Date("2026-03-16T10:00:00Z"),
        sentimentScore: 0.8,
        dataSourceType: "INTERCOM",
      },
    ];

    const result = aggregateWeekly(items);

    // Should have 2 weeks: week of Mar 16 and week of Mar 23
    expect(result).toHaveLength(2);
    expect(result[0].volume).toBe(1); // Mar 16 week
    expect(result[1].volume).toBe(2); // Mar 23 week
  });

  it("computes average sentiment per week", () => {
    const items: FeedbackForAggregation[] = [
      {
        id: "1",
        ingestedAt: new Date("2026-03-23T10:00:00Z"),
        sentimentScore: 0.6,
        dataSourceType: null,
      },
      {
        id: "2",
        ingestedAt: new Date("2026-03-24T10:00:00Z"),
        sentimentScore: 0.4,
        dataSourceType: null,
      },
    ];

    const result = aggregateWeekly(items);
    expect(result).toHaveLength(1);
    expect(result[0].avgSentiment).toBeCloseTo(0.5, 5);
  });

  it("tracks source distribution", () => {
    const items: FeedbackForAggregation[] = [
      {
        id: "1",
        ingestedAt: new Date("2026-03-23T10:00:00Z"),
        sentimentScore: null,
        dataSourceType: "INTERCOM",
      },
      {
        id: "2",
        ingestedAt: new Date("2026-03-24T10:00:00Z"),
        sentimentScore: null,
        dataSourceType: "INTERCOM",
      },
      {
        id: "3",
        ingestedAt: new Date("2026-03-25T10:00:00Z"),
        sentimentScore: null,
        dataSourceType: "ZENDESK",
      },
    ];

    const result = aggregateWeekly(items);
    expect(result[0].sourceDistribution).toEqual({ INTERCOM: 2, ZENDESK: 1 });
  });

  it("returns empty array for no items", () => {
    expect(aggregateWeekly([])).toEqual([]);
  });

  it("handles null sentiment scores", () => {
    const items: FeedbackForAggregation[] = [
      {
        id: "1",
        ingestedAt: new Date("2026-03-23T10:00:00Z"),
        sentimentScore: null,
        dataSourceType: null,
      },
    ];
    const result = aggregateWeekly(items);
    expect(result[0].avgSentiment).toBe(0);
    expect(result[0].volume).toBe(1);
  });
});

describe("fillMissingWeeks", () => {
  it("fills gaps with zero-volume entries", () => {
    const aggregates = [
      {
        period: new Date("2026-03-09T00:00:00.000Z"),
        volume: 5,
        avgSentiment: 0.5,
        sourceDistribution: {},
      },
      {
        period: new Date("2026-03-23T00:00:00.000Z"),
        volume: 10,
        avgSentiment: 0.3,
        sourceDistribution: {},
      },
    ];

    const result = fillMissingWeeks(
      aggregates,
      new Date("2026-03-09T00:00:00Z"),
      new Date("2026-03-23T00:00:00Z"),
    );

    expect(result).toHaveLength(3); // Mar 9, Mar 16 (filled), Mar 23
    expect(result[0].volume).toBe(5);
    expect(result[1].volume).toBe(0); // filled
    expect(result[2].volume).toBe(10);
  });

  it("returns existing data unchanged when no gaps", () => {
    const aggregates = [
      {
        period: new Date("2026-03-16T00:00:00.000Z"),
        volume: 5,
        avgSentiment: 0,
        sourceDistribution: {},
      },
      {
        period: new Date("2026-03-23T00:00:00.000Z"),
        volume: 8,
        avgSentiment: 0,
        sourceDistribution: {},
      },
    ];

    const result = fillMissingWeeks(
      aggregates,
      new Date("2026-03-16T00:00:00Z"),
      new Date("2026-03-23T00:00:00Z"),
    );

    expect(result).toHaveLength(2);
  });
});
