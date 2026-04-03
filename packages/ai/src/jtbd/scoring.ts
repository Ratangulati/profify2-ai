/**
 * Cross-project learning: correlates insight attributes with feature outcomes
 * to build a prediction confidence model for opportunity scoring.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface InsightAttributes {
  type: string;
  severityScore: number;
  frequencyCount: number;
  segmentCount: number;
  sourceCount: number;
  trendDirection: string;
}

export interface OutcomeRecord {
  impactScore: number;
  insightAttributes: InsightAttributes[];
}

export interface ScoringModel {
  weights: AttributeWeights;
  sampleSize: number;
  avgImpact: number;
}

export interface AttributeWeights {
  severity: number;
  frequency: number;
  segmentBreadth: number;
  sourceVariety: number;
  trendBoost: number;
}

export interface PredictionResult {
  confidenceScore: number;
  multiplier: number;
  explanation: string;
}

// ── Default weights (before training data) ─────────────────────────────

const DEFAULT_WEIGHTS: AttributeWeights = {
  severity: 0.3,
  frequency: 0.25,
  segmentBreadth: 0.2,
  sourceVariety: 0.15,
  trendBoost: 0.1,
};

// ── Scoring model ──────────────────────────────────────────────────────

/**
 * Build a scoring model from historical feature outcomes and their linked insights.
 * Uses simple linear correlation to find which insight attributes correlate
 * with higher impact scores.
 */
export function buildScoringModel(outcomes: OutcomeRecord[]): ScoringModel {
  if (outcomes.length < 3) {
    return { weights: DEFAULT_WEIGHTS, sampleSize: outcomes.length, avgImpact: 0 };
  }

  // Flatten: each outcome's average insight attributes → impact
  const dataPoints = outcomes.map((o) => {
    const attrs = o.insightAttributes;
    if (attrs.length === 0) {
      return {
        impact: o.impactScore,
        severity: 0,
        frequency: 0,
        segmentBreadth: 0,
        sourceVariety: 0,
        trendBoost: 0,
      };
    }

    const avgSeverity = attrs.reduce((s, a) => s + a.severityScore, 0) / attrs.length;
    const avgFrequency = attrs.reduce((s, a) => s + a.frequencyCount, 0) / attrs.length;
    const avgSegments = attrs.reduce((s, a) => s + a.segmentCount, 0) / attrs.length;
    const avgSources = attrs.reduce((s, a) => s + a.sourceCount, 0) / attrs.length;
    const trendBoost = attrs.filter((a) => a.trendDirection === "INCREASING").length / attrs.length;

    return {
      impact: o.impactScore,
      severity: avgSeverity,
      frequency: avgFrequency,
      segmentBreadth: avgSegments,
      sourceVariety: avgSources,
      trendBoost,
    };
  });

  const avgImpact = dataPoints.reduce((s, d) => s + d.impact, 0) / dataPoints.length;

  // Compute correlation coefficient for each attribute with impact
  const correlations = {
    severity: computeCorrelation(
      dataPoints.map((d) => d.severity),
      dataPoints.map((d) => d.impact),
    ),
    frequency: computeCorrelation(
      dataPoints.map((d) => d.frequency),
      dataPoints.map((d) => d.impact),
    ),
    segmentBreadth: computeCorrelation(
      dataPoints.map((d) => d.segmentBreadth),
      dataPoints.map((d) => d.impact),
    ),
    sourceVariety: computeCorrelation(
      dataPoints.map((d) => d.sourceVariety),
      dataPoints.map((d) => d.impact),
    ),
    trendBoost: computeCorrelation(
      dataPoints.map((d) => d.trendBoost),
      dataPoints.map((d) => d.impact),
    ),
  };

  // Normalize correlations to weights (use absolute values, handle all-zero case)
  const totalCorr =
    Math.abs(correlations.severity) +
    Math.abs(correlations.frequency) +
    Math.abs(correlations.segmentBreadth) +
    Math.abs(correlations.sourceVariety) +
    Math.abs(correlations.trendBoost);

  const weights: AttributeWeights =
    totalCorr === 0
      ? DEFAULT_WEIGHTS
      : {
          severity: Math.abs(correlations.severity) / totalCorr,
          frequency: Math.abs(correlations.frequency) / totalCorr,
          segmentBreadth: Math.abs(correlations.segmentBreadth) / totalCorr,
          sourceVariety: Math.abs(correlations.sourceVariety) / totalCorr,
          trendBoost: Math.abs(correlations.trendBoost) / totalCorr,
        };

  return { weights, sampleSize: outcomes.length, avgImpact };
}

/**
 * Predict the confidence/impact multiplier for a new insight based on the scoring model.
 */
export function predictOutcome(
  model: ScoringModel,
  attributes: InsightAttributes,
): PredictionResult {
  if (model.sampleSize < 3) {
    return {
      confidenceScore: 0,
      multiplier: 1.0,
      explanation: "Insufficient historical data for prediction",
    };
  }

  // Compute a weighted score from the insight's attributes
  const normalizedSeverity = attributes.severityScore / 5; // 0-1
  const normalizedFrequency = Math.min(attributes.frequencyCount / 50, 1); // cap at 50
  const normalizedSegments = Math.min(attributes.segmentCount / 10, 1); // cap at 10
  const normalizedSources = Math.min(attributes.sourceCount / 5, 1); // cap at 5
  const trendBoost = attributes.trendDirection === "INCREASING" ? 1 : 0;

  const weightedScore =
    normalizedSeverity * model.weights.severity +
    normalizedFrequency * model.weights.frequency +
    normalizedSegments * model.weights.segmentBreadth +
    normalizedSources * model.weights.sourceVariety +
    trendBoost * model.weights.trendBoost;

  // Convert to multiplier: 0.5x to 3x range
  const multiplier = Math.round((0.5 + weightedScore * 2.5) * 100) / 100;

  // Confidence: based on model sample size (log scale, max at ~50 outcomes)
  const confidence = Math.min(Math.log(model.sampleSize + 1) / Math.log(51), 1);
  const confidenceScore = Math.round(confidence * 100) / 100;

  const topFactor = getTopFactor(model.weights, {
    severity: normalizedSeverity,
    frequency: normalizedFrequency,
    segmentBreadth: normalizedSegments,
    sourceVariety: normalizedSources,
    trendBoost,
  });

  return {
    confidenceScore,
    multiplier,
    explanation: `Based on ${model.sampleSize} historical outcomes, insights like this have a ${multiplier.toFixed(1)}x predicted impact. Top factor: ${topFactor}.`,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Pearson correlation coefficient between two arrays.
 */
export function computeCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;

  const xMean = xs.reduce((s, v) => s + v, 0) / n;
  const yMean = ys.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

function getTopFactor(weights: AttributeWeights, values: Record<string, number>): string {
  const contributions = Object.entries(weights).map(([key, weight]) => ({
    key,
    contribution: weight * (values[key] ?? 0),
  }));
  contributions.sort((a, b) => b.contribution - a.contribution);

  const labels: Record<string, string> = {
    severity: "high severity",
    frequency: "high frequency",
    segmentBreadth: "broad segment reach",
    sourceVariety: "multi-source validation",
    trendBoost: "increasing trend",
  };

  return labels[contributions[0].key] ?? contributions[0].key;
}
