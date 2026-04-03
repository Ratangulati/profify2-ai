import { describe, it, expect } from "vitest";

import {
  computeCorrelation,
  buildScoringModel,
  predictOutcome,
  type OutcomeRecord,
  type InsightAttributes,
} from "../../src/jtbd/scoring.js";

describe("computeCorrelation", () => {
  it("returns 1 for perfectly correlated data", () => {
    expect(computeCorrelation([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 5);
  });

  it("returns -1 for perfectly anti-correlated data", () => {
    expect(computeCorrelation([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 5);
  });

  it("returns 0 for uncorrelated data", () => {
    // Symmetric around mean → 0 correlation
    expect(computeCorrelation([1, 2, 3, 4], [1, 0, 0, 1])).toBeCloseTo(0, 5);
  });

  it("returns 0 for fewer than 2 points", () => {
    expect(computeCorrelation([1], [2])).toBe(0);
    expect(computeCorrelation([], [])).toBe(0);
  });

  it("returns 0 when all values are identical", () => {
    expect(computeCorrelation([5, 5, 5], [5, 5, 5])).toBe(0);
  });
});

describe("buildScoringModel", () => {
  it("returns default weights for fewer than 3 outcomes", () => {
    const model = buildScoringModel([]);
    expect(model.sampleSize).toBe(0);
    expect(model.weights.severity).toBe(0.3);
  });

  it("builds model from historical data", () => {
    const outcomes: OutcomeRecord[] = [
      {
        impactScore: 8,
        insightAttributes: [
          {
            type: "PAIN_POINT",
            severityScore: 4.5,
            frequencyCount: 30,
            segmentCount: 5,
            sourceCount: 3,
            trendDirection: "INCREASING",
          },
        ],
      },
      {
        impactScore: 2,
        insightAttributes: [
          {
            type: "DESIRE",
            severityScore: 1.5,
            frequencyCount: 5,
            segmentCount: 1,
            sourceCount: 1,
            trendDirection: "STABLE",
          },
        ],
      },
      {
        impactScore: 6,
        insightAttributes: [
          {
            type: "PAIN_POINT",
            severityScore: 3.0,
            frequencyCount: 20,
            segmentCount: 3,
            sourceCount: 2,
            trendDirection: "INCREASING",
          },
        ],
      },
    ];
    const model = buildScoringModel(outcomes);
    expect(model.sampleSize).toBe(3);
    expect(model.avgImpact).toBeCloseTo(5.333, 2);
    // Weights should sum to ~1
    const weightSum =
      model.weights.severity +
      model.weights.frequency +
      model.weights.segmentBreadth +
      model.weights.sourceVariety +
      model.weights.trendBoost;
    expect(weightSum).toBeCloseTo(1, 5);
  });

  it("handles outcomes with no insight attributes", () => {
    const outcomes: OutcomeRecord[] = [
      { impactScore: 5, insightAttributes: [] },
      { impactScore: 3, insightAttributes: [] },
      { impactScore: 7, insightAttributes: [] },
    ];
    const model = buildScoringModel(outcomes);
    expect(model.sampleSize).toBe(3);
  });
});

describe("predictOutcome", () => {
  it("returns insufficient data message for small sample", () => {
    const model = buildScoringModel([]);
    const attrs: InsightAttributes = {
      type: "PAIN_POINT",
      severityScore: 4,
      frequencyCount: 20,
      segmentCount: 5,
      sourceCount: 3,
      trendDirection: "INCREASING",
    };
    const result = predictOutcome(model, attrs);
    expect(result.confidenceScore).toBe(0);
    expect(result.multiplier).toBe(1);
    expect(result.explanation).toContain("Insufficient");
  });

  it("returns higher multiplier for high-signal insights", () => {
    const outcomes: OutcomeRecord[] = [
      {
        impactScore: 8,
        insightAttributes: [
          {
            type: "PAIN_POINT",
            severityScore: 4.5,
            frequencyCount: 30,
            segmentCount: 5,
            sourceCount: 3,
            trendDirection: "INCREASING",
          },
        ],
      },
      {
        impactScore: 2,
        insightAttributes: [
          {
            type: "DESIRE",
            severityScore: 1,
            frequencyCount: 5,
            segmentCount: 1,
            sourceCount: 1,
            trendDirection: "STABLE",
          },
        ],
      },
      {
        impactScore: 6,
        insightAttributes: [
          {
            type: "PAIN_POINT",
            severityScore: 3,
            frequencyCount: 20,
            segmentCount: 3,
            sourceCount: 2,
            trendDirection: "INCREASING",
          },
        ],
      },
    ];
    const model = buildScoringModel(outcomes);

    const highSignal: InsightAttributes = {
      type: "PAIN_POINT",
      severityScore: 5,
      frequencyCount: 40,
      segmentCount: 8,
      sourceCount: 4,
      trendDirection: "INCREASING",
    };
    const lowSignal: InsightAttributes = {
      type: "OBSERVATION",
      severityScore: 1,
      frequencyCount: 2,
      segmentCount: 1,
      sourceCount: 1,
      trendDirection: "STABLE",
    };

    const highResult = predictOutcome(model, highSignal);
    const lowResult = predictOutcome(model, lowSignal);

    expect(highResult.multiplier).toBeGreaterThan(lowResult.multiplier);
  });

  it("confidence scales with sample size", () => {
    const makeOutcome = (n: number): OutcomeRecord[] =>
      Array(n)
        .fill(null)
        .map((_, i) => ({
          impactScore: i + 1,
          insightAttributes: [
            {
              type: "PAIN_POINT",
              severityScore: i + 1,
              frequencyCount: i * 5,
              segmentCount: 1,
              sourceCount: 1,
              trendDirection: "STABLE",
            },
          ],
        }));

    const small = buildScoringModel(makeOutcome(3));
    const large = buildScoringModel(makeOutcome(30));
    const attrs: InsightAttributes = {
      type: "PAIN_POINT",
      severityScore: 3,
      frequencyCount: 15,
      segmentCount: 3,
      sourceCount: 2,
      trendDirection: "STABLE",
    };

    const smallPred = predictOutcome(small, attrs);
    const largePred = predictOutcome(large, attrs);

    expect(largePred.confidenceScore).toBeGreaterThan(smallPred.confidenceScore);
  });

  it("multiplier stays in 0.5-3.0 range", () => {
    const outcomes: OutcomeRecord[] = Array(5)
      .fill(null)
      .map((_, i) => ({
        impactScore: i + 1,
        insightAttributes: [
          {
            type: "PAIN_POINT",
            severityScore: i + 1,
            frequencyCount: i * 10,
            segmentCount: i,
            sourceCount: i,
            trendDirection: "INCREASING",
          },
        ],
      }));
    const model = buildScoringModel(outcomes);

    const extreme: InsightAttributes = {
      type: "PAIN_POINT",
      severityScore: 5,
      frequencyCount: 100,
      segmentCount: 20,
      sourceCount: 10,
      trendDirection: "INCREASING",
    };
    const minimal: InsightAttributes = {
      type: "OBSERVATION",
      severityScore: 0,
      frequencyCount: 0,
      segmentCount: 0,
      sourceCount: 0,
      trendDirection: "STABLE",
    };

    const high = predictOutcome(model, extreme);
    const low = predictOutcome(model, minimal);

    expect(high.multiplier).toBeLessThanOrEqual(3);
    expect(low.multiplier).toBeGreaterThanOrEqual(0.5);
  });
});
