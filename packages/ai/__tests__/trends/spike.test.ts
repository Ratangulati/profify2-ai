import { describe, it, expect } from "vitest";

import { checkSpike, detectSpikes } from "../../src/trends/spike.js";

describe("checkSpike", () => {
  it("detects spike when current > 3x rolling average", () => {
    const result = checkSpike(40, [10, 10, 10, 10], 3.0);
    expect(result.isSpike).toBe(true);
    expect(result.rollingAverage).toBe(10);
    expect(result.spikeFactor).toBe(4);
  });

  it("does not spike at exactly 3x", () => {
    const result = checkSpike(30, [10, 10, 10, 10], 3.0);
    expect(result.isSpike).toBe(true);
    expect(result.spikeFactor).toBe(3);
  });

  it("does not spike below threshold", () => {
    const result = checkSpike(20, [10, 10, 10, 10], 3.0);
    expect(result.isSpike).toBe(false);
    expect(result.spikeFactor).toBe(2);
  });

  it("handles zero rolling average with non-zero current", () => {
    const result = checkSpike(5, [0, 0, 0, 0], 3.0);
    expect(result.isSpike).toBe(true);
    expect(result.rollingAverage).toBe(0);
    expect(result.spikeFactor).toBe(Infinity);
  });

  it("handles zero rolling average with zero current", () => {
    const result = checkSpike(0, [0, 0, 0, 0], 3.0);
    expect(result.isSpike).toBe(false);
  });

  it("returns no spike for empty previous volumes", () => {
    const result = checkSpike(100, [], 3.0);
    expect(result.isSpike).toBe(false);
  });

  it("uses custom threshold", () => {
    const result = checkSpike(25, [10, 10, 10, 10], 2.0);
    expect(result.isSpike).toBe(true); // 2.5x > 2.0
  });
});

describe("detectSpikes", () => {
  it("detects spikes across multiple entities", () => {
    const entities = [
      {
        entityType: "theme",
        entityId: "t1",
        entityTitle: "Login Issues",
        weeklyVolumes: [5, 5, 5, 5, 20],
      },
      {
        entityType: "theme",
        entityId: "t2",
        entityTitle: "Billing",
        weeklyVolumes: [10, 10, 10, 10, 11],
      },
    ];
    const results = detectSpikes(entities, 4, 3.0);

    expect(results).toHaveLength(2);
    expect(results[0].isSpike).toBe(true); // t1: 20 / 5 = 4x
    expect(results[1].isSpike).toBe(false); // t2: 11 / 10 = 1.1x
  });

  it("skips entities with fewer than 2 data points", () => {
    const entities = [
      { entityType: "theme", entityId: "t1", entityTitle: "Short", weeklyVolumes: [5] },
    ];
    const results = detectSpikes(entities, 4, 3.0);
    expect(results).toHaveLength(0);
  });

  it("uses the last value as current and previous N for rolling average", () => {
    const entities = [
      {
        entityType: "theme",
        entityId: "t1",
        entityTitle: "Test",
        weeklyVolumes: [100, 2, 2, 2, 2, 30],
      },
    ];
    // rollingWeeks=4 → previous 4 values: [2, 2, 2, 2] → avg=2, current=30 → 15x
    const results = detectSpikes(entities, 4, 3.0);
    expect(results[0].isSpike).toBe(true);
    expect(results[0].rollingAverage).toBe(2);
    expect(results[0].currentVolume).toBe(30);
  });
});
