/**
 * Insight scoring calculations: frequency, severity, trend detection,
 * and segment distribution analysis.
 */

export type TrendDirection = "INCREASING" | "STABLE" | "DECREASING";

export interface InsightScores {
  frequency: number;
  severity: number;
  trend: TrendDirection;
  segmentDistribution: Record<string, number>;
}

export interface EvidenceItem {
  feedbackItemCreatedAt: Date;
  segmentTags: string[];
  severity?: number;
}

/**
 * Calculate all scores for an insight based on its evidence.
 */
export function calculateInsightScores(evidence: EvidenceItem[]): InsightScores {
  return {
    frequency: calculateFrequency(evidence),
    severity: calculateAverageSeverity(evidence),
    trend: calculateTrend(evidence),
    segmentDistribution: calculateSegmentDistribution(evidence),
  };
}

/**
 * Frequency = count of unique feedback items that mention this insight.
 */
export function calculateFrequency(evidence: EvidenceItem[]): number {
  return evidence.length;
}

/**
 * Average severity from extraction (for pain points).
 * Returns 0 if no severity values present.
 */
export function calculateAverageSeverity(evidence: EvidenceItem[]): number {
  const severities = evidence.map((e) => e.severity).filter((s): s is number => s != null && s > 0);

  if (severities.length === 0) return 0;
  return severities.reduce((sum, s) => sum + s, 0) / severities.length;
}

/**
 * Trend detection: compare frequency in last 30 days vs previous 30 days.
 * Uses a simple ratio with thresholds.
 */
export function calculateTrend(evidence: EvidenceItem[], now: Date = new Date()): TrendDirection {
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const recentCutoff = new Date(now.getTime() - thirtyDaysMs);
  const previousCutoff = new Date(now.getTime() - 2 * thirtyDaysMs);

  let recentCount = 0;
  let previousCount = 0;

  for (const item of evidence) {
    const ts = item.feedbackItemCreatedAt.getTime();
    if (ts >= recentCutoff.getTime()) {
      recentCount++;
    } else if (ts >= previousCutoff.getTime()) {
      previousCount++;
    }
  }

  // Need at least some data to determine a trend
  if (recentCount + previousCount < 3) return "STABLE";

  // Avoid division by zero — if previous is 0 and recent > 0, it's increasing
  if (previousCount === 0) return recentCount > 0 ? "INCREASING" : "STABLE";

  const ratio = recentCount / previousCount;

  if (ratio >= 1.5) return "INCREASING";
  if (ratio <= 0.5) return "DECREASING";
  return "STABLE";
}

/**
 * Calculate which segments report this insight most.
 * Returns a map of segment tag → count.
 */
export function calculateSegmentDistribution(evidence: EvidenceItem[]): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const item of evidence) {
    for (const tag of item.segmentTags) {
      distribution[tag] = (distribution[tag] ?? 0) + 1;
    }
  }

  return distribution;
}
