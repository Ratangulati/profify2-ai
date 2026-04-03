/**
 * Trend data aggregation: computes weekly volume, avg sentiment,
 * and source distribution for themes and insights.
 */

import { getWeekStart } from "./regression.js";

export interface FeedbackForAggregation {
  id: string;
  ingestedAt: Date;
  sentimentScore: number | null;
  dataSourceType: string | null;
}

export interface WeeklyAggregate {
  period: Date; // Week start (Monday)
  volume: number; // Count of items
  avgSentiment: number; // Average sentiment score
  sourceDistribution: Record<string, number>; // source type → count
}

/**
 * Aggregate feedback items into weekly buckets.
 * Returns aggregates sorted by period (oldest first).
 */
export function aggregateWeekly(items: FeedbackForAggregation[]): WeeklyAggregate[] {
  const buckets = new Map<
    string,
    {
      period: Date;
      count: number;
      sentimentSum: number;
      sentimentCount: number;
      sources: Record<string, number>;
    }
  >();

  for (const item of items) {
    const weekStart = getWeekStart(item.ingestedAt);
    const key = weekStart.toISOString();

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { period: weekStart, count: 0, sentimentSum: 0, sentimentCount: 0, sources: {} };
      buckets.set(key, bucket);
    }

    bucket.count++;

    if (item.sentimentScore != null) {
      bucket.sentimentSum += item.sentimentScore;
      bucket.sentimentCount++;
    }

    if (item.dataSourceType) {
      bucket.sources[item.dataSourceType] = (bucket.sources[item.dataSourceType] ?? 0) + 1;
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.period.getTime() - b.period.getTime())
    .map((b) => ({
      period: b.period,
      volume: b.count,
      avgSentiment: b.sentimentCount > 0 ? b.sentimentSum / b.sentimentCount : 0,
      sourceDistribution: b.sources,
    }));
}

/**
 * Fill missing weeks with zero-volume entries.
 * Ensures continuous time series for charting.
 */
export function fillMissingWeeks(
  aggregates: WeeklyAggregate[],
  startDate: Date,
  endDate: Date,
): WeeklyAggregate[] {
  const existingMap = new Map<string, WeeklyAggregate>();
  for (const agg of aggregates) {
    existingMap.set(agg.period.toISOString(), agg);
  }

  const result: WeeklyAggregate[] = [];
  const current = getWeekStart(startDate);
  const end = getWeekStart(endDate);

  while (current <= end) {
    const key = current.toISOString();
    result.push(
      existingMap.get(key) ?? {
        period: new Date(current),
        volume: 0,
        avgSentiment: 0,
        sourceDistribution: {},
      },
    );
    current.setUTCDate(current.getUTCDate() + 7);
  }

  return result;
}
