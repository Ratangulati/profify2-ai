import { describe, it, expect } from "vitest";

import {
  linearRegressionSlope,
  computeTrendLabel,
  getWeekStart,
  getWeekStarts,
} from "../../src/trends/regression.js";

describe("linearRegressionSlope", () => {
  it("returns positive slope for increasing data", () => {
    const points = [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 4 },
    ];
    expect(linearRegressionSlope(points)).toBeCloseTo(1, 5);
  });

  it("returns negative slope for decreasing data", () => {
    const points = [
      { x: 0, y: 4 },
      { x: 1, y: 3 },
      { x: 2, y: 2 },
      { x: 3, y: 1 },
    ];
    expect(linearRegressionSlope(points)).toBeCloseTo(-1, 5);
  });

  it("returns 0 for flat data", () => {
    const points = [
      { x: 0, y: 5 },
      { x: 1, y: 5 },
      { x: 2, y: 5 },
    ];
    expect(linearRegressionSlope(points)).toBeCloseTo(0, 5);
  });

  it("returns 0 for fewer than 2 points", () => {
    expect(linearRegressionSlope([{ x: 0, y: 1 }])).toBe(0);
    expect(linearRegressionSlope([])).toBe(0);
  });

  it("handles noisy data", () => {
    // General upward trend: 2, 1, 4, 3, 6
    const points = [
      { x: 0, y: 2 },
      { x: 1, y: 1 },
      { x: 2, y: 4 },
      { x: 3, y: 3 },
      { x: 4, y: 6 },
    ];
    expect(linearRegressionSlope(points)).toBeGreaterThan(0);
  });
});

describe("computeTrendLabel", () => {
  it("returns SPIKING for >2x increase", () => {
    expect(computeTrendLabel(30, [10, 10, 10])).toBe("SPIKING");
  });

  it("returns GROWING for >20% increase", () => {
    expect(computeTrendLabel(13, [10, 10, 10])).toBe("GROWING");
  });

  it("returns DECLINING for >20% decrease", () => {
    expect(computeTrendLabel(7, [10, 10, 10])).toBe("DECLINING");
  });

  it("returns STABLE for small changes", () => {
    expect(computeTrendLabel(10, [10, 10, 10])).toBe("STABLE");
    expect(computeTrendLabel(11, [10, 10, 10])).toBe("STABLE");
  });

  it("returns STABLE for no previous values", () => {
    expect(computeTrendLabel(10, [])).toBe("STABLE");
  });

  it("returns SPIKING when previous average is 0", () => {
    expect(computeTrendLabel(5, [0, 0, 0])).toBe("SPIKING");
  });

  it("returns STABLE when both are 0", () => {
    expect(computeTrendLabel(0, [0, 0, 0])).toBe("STABLE");
  });
});

describe("getWeekStart", () => {
  it("returns Monday for a Wednesday", () => {
    // 2026-03-25 is a Wednesday
    const result = getWeekStart(new Date("2026-03-25T15:00:00Z"));
    expect(result.getUTCDay()).toBe(1); // Monday
    expect(result.toISOString()).toBe("2026-03-23T00:00:00.000Z");
  });

  it("returns the same Monday for a Monday", () => {
    const result = getWeekStart(new Date("2026-03-23T10:00:00Z"));
    expect(result.toISOString()).toBe("2026-03-23T00:00:00.000Z");
  });

  it("returns previous Monday for a Sunday", () => {
    // 2026-03-29 is a Sunday
    const result = getWeekStart(new Date("2026-03-29T10:00:00Z"));
    expect(result.toISOString()).toBe("2026-03-23T00:00:00.000Z");
  });
});

describe("getWeekStarts", () => {
  it("returns correct number of weeks", () => {
    const starts = getWeekStarts(4, new Date("2026-03-28T12:00:00Z"));
    expect(starts).toHaveLength(4);
  });

  it("returns oldest first", () => {
    const starts = getWeekStarts(3, new Date("2026-03-28T12:00:00Z"));
    expect(starts[0].getTime()).toBeLessThan(starts[1].getTime());
    expect(starts[1].getTime()).toBeLessThan(starts[2].getTime());
  });

  it("all dates are Mondays", () => {
    const starts = getWeekStarts(5, new Date("2026-03-28T12:00:00Z"));
    for (const start of starts) {
      expect(start.getUTCDay()).toBe(1);
    }
  });
});
