/**
 * Simple linear regression for trend direction detection.
 * Fits y = mx + b to time-series points and returns slope.
 */

export interface DataPoint {
  x: number; // e.g., week index or timestamp
  y: number; // e.g., volume or sentiment
}

export type TrendLabel = "SPIKING" | "GROWING" | "STABLE" | "DECLINING";

/**
 * Compute the slope of a simple linear regression line.
 * Returns 0 if fewer than 2 points.
 */
export function linearRegressionSlope(points: DataPoint[]): number {
  const n = points.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (const { x, y } of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * Determine trend label based on comparing current period to previous N periods.
 * Uses the ratio of current value to the average of previous values.
 *
 * - spiking:   >2x increase vs average
 * - growing:   >20% increase vs average
 * - declining: >20% decrease vs average
 * - stable:    otherwise
 */
export function computeTrendLabel(currentValue: number, previousValues: number[]): TrendLabel {
  if (previousValues.length === 0) return "STABLE";

  const avg = previousValues.reduce((sum, v) => sum + v, 0) / previousValues.length;
  if (avg === 0) return currentValue > 0 ? "SPIKING" : "STABLE";

  const ratio = currentValue / avg;

  if (ratio > 2) return "SPIKING";
  if (ratio > 1.2) return "GROWING";
  if (ratio < 0.8) return "DECLINING";
  return "STABLE";
}

/**
 * Get the ISO week start (Monday) for a given date.
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Generate an array of week-start dates for the last N weeks.
 */
export function getWeekStarts(weeks: number, from: Date = new Date()): Date[] {
  const starts: Date[] = [];
  const current = getWeekStart(from);

  for (let i = 0; i < weeks; i++) {
    const weekStart = new Date(current);
    weekStart.setUTCDate(weekStart.getUTCDate() - i * 7);
    starts.push(weekStart);
  }

  return starts.reverse(); // oldest first
}
