/**
 * Signal freshness decay calculator.
 *
 * Each feedback item has a freshness_weight computed as:
 *   1 / (1 + days_since_ingestion / half_life)
 *
 * Default half-life: 90 days (configurable per project).
 * Insights that keep getting new evidence stay "fresh" — the decay
 * applies to individual evidence items, not the insight itself.
 */

const DEFAULT_HALF_LIFE_DAYS = 90;

/**
 * Compute the freshness weight for a single item.
 * Returns a value between 0 (infinitely old) and 1 (just ingested).
 */
export function computeFreshnessWeight(
  ingestedAt: Date,
  now: Date = new Date(),
  halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS,
): number {
  const daysSinceIngestion = Math.max(
    0,
    (now.getTime() - ingestedAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  return 1 / (1 + daysSinceIngestion / halfLifeDays);
}

/**
 * Compute freshness-weighted frequency: sum of freshness weights.
 */
export function freshnessWeightedFrequency(
  items: Array<{ ingestedAt: Date }>,
  now: Date = new Date(),
  halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS,
): number {
  return items.reduce(
    (sum, item) => sum + computeFreshnessWeight(item.ingestedAt, now, halfLifeDays),
    0,
  );
}

/**
 * Compute freshness-weighted average severity.
 */
export function freshnessWeightedSeverity(
  items: Array<{ ingestedAt: Date; severity: number }>,
  now: Date = new Date(),
  halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS,
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const item of items) {
    const w = computeFreshnessWeight(item.ingestedAt, now, halfLifeDays);
    weightedSum += item.severity * w;
    totalWeight += w;
  }

  if (totalWeight === 0) return 0;
  return weightedSum / totalWeight;
}
