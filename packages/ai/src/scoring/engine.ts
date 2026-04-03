/**
 * Opportunity scoring engine.
 *
 * Computes Composite, RICE, ICE, and Segment-Weighted scores
 * for opportunities based on their linked evidence.
 */

import { computeFreshnessWeight } from "../sentiment/freshness.js";

import {
  type ScoringConfig,
  type ScoringWeights,
  type SegmentMultipliers,
  type OpportunityInput,
  type EvidenceItem,
  type CompositeScoreResult,
  type RICEScoreResult,
  type ICEScoreResult,
  type SegmentWeightedResult,
  type FullScoreResult,
  type ConfidenceLevel,
  DEFAULT_WEIGHTS,
  DEFAULT_SEGMENT_MULTIPLIERS,
  SEVERITY_TO_RICE_IMPACT,
  CONFIDENCE_THRESHOLDS,
} from "./types.js";

// ── Confidence ───────────────────────────────────────────────────────

export function getConfidenceLevel(evidenceCount: number): ConfidenceLevel {
  if (evidenceCount >= CONFIDENCE_THRESHOLDS.HIGH) return "high";
  if (evidenceCount >= CONFIDENCE_THRESHOLDS.MEDIUM) return "medium";
  return "low";
}

/** Maps confidence level to RICE confidence value (0-1) */
export function getConfidenceValue(evidenceCount: number): number {
  const level = getConfidenceLevel(evidenceCount);
  switch (level) {
    case "high":
      return 1.0;
    case "medium":
      return 0.8;
    case "low":
      return 0.5;
  }
}

// ── Freshness-Weighted Frequency ─────────────────────────────────────

export function computeFrequencyScore(evidence: EvidenceItem[], halfLifeDays = 90): number {
  const now = new Date();
  return evidence.reduce(
    (sum, item) => sum + computeFreshnessWeight(item.ingestedAt, now, halfLifeDays),
    0,
  );
}

// ── Average Severity ─────────────────────────────────────────────────

export function computeAverageSeverity(evidence: EvidenceItem[]): number {
  if (evidence.length === 0) return 0;
  const total = evidence.reduce((sum, e) => sum + e.severity, 0);
  return total / evidence.length;
}

// ── Segment-Weighted Frequency ───────────────────────────────────────

export function computeSegmentWeightedFrequency(
  evidence: EvidenceItem[],
  multipliers: SegmentMultipliers = DEFAULT_SEGMENT_MULTIPLIERS,
): SegmentWeightedResult {
  const segmentBreakdown: Record<string, number> = {};
  let totalWeighted = 0;

  for (const item of evidence) {
    // Use the highest multiplier among the item's segments
    let maxMultiplier = 1;
    for (const tag of item.segmentTags) {
      const normalized = tag.toLowerCase().trim();
      const mult = multipliers[normalized] ?? 1;
      if (mult > maxMultiplier) maxMultiplier = mult;
      segmentBreakdown[normalized] = (segmentBreakdown[normalized] ?? 0) + 1;
    }
    if (item.segmentTags.length === 0) {
      segmentBreakdown["unknown"] = (segmentBreakdown["unknown"] ?? 0) + 1;
    }
    totalWeighted += maxMultiplier;
  }

  return { segmentWeightedFrequency: totalWeighted, segmentBreakdown };
}

// ── Composite Score ──────────────────────────────────────────────────

export function computeCompositeScore(
  opp: OpportunityInput,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): CompositeScoreResult {
  const frequencyScore = computeFrequencyScore(opp.evidence);
  const severityScore = computeAverageSeverity(opp.evidence);
  const effortInverse = 1 / Math.max(opp.effortEstimate, 1);
  const strategicAlignment = opp.strategicAlignment;

  // Normalize frequency to 0-5 scale (cap at 50 weighted items)
  const normalizedFreq = Math.min(frequencyScore / 10, 5);
  // Severity already on 0-5 scale
  // Strategic alignment on 0-1, scale to 0-5
  const normalizedAlignment = strategicAlignment * 5;
  // Effort inverse: 1/1=1 to 1/5=0.2, scale to 0-5
  const normalizedEffort = effortInverse * 5;

  const compositeScore =
    normalizedFreq * weights.frequency +
    severityScore * weights.severity +
    normalizedAlignment * weights.strategicAlignment +
    normalizedEffort * weights.effortInverse;

  return {
    frequencyScore: Math.round(frequencyScore * 100) / 100,
    severityScore: Math.round(severityScore * 100) / 100,
    strategicAlignment,
    effortInverse: Math.round(effortInverse * 100) / 100,
    compositeScore: Math.round(compositeScore * 100) / 100,
  };
}

// ── RICE Score ───────────────────────────────────────────────────────

export interface RICEInput {
  /** Total customers in each segment */
  segmentCustomerCounts?: Record<string, number>;
  /** Manual override for reach */
  manualReach?: number;
  /** Manual override for effort */
  manualEffort?: number;
}

export function computeRICEScore(
  opp: OpportunityInput,
  riceInput: RICEInput = {},
): RICEScoreResult {
  const evidenceCount = opp.evidence.length;

  // Reach: estimate from segment sizes
  let reach: number;
  if (riceInput.manualReach != null) {
    reach = riceInput.manualReach;
  } else if (riceInput.segmentCustomerCounts) {
    reach = estimateReach(opp.evidence, riceInput.segmentCustomerCounts);
  } else {
    // Fallback: use evidence count as rough proxy
    reach = evidenceCount;
  }

  // Impact: derived from severity (mapped to RICE scale)
  const avgSeverity = computeAverageSeverity(opp.evidence);
  const roundedSeverity = Math.max(1, Math.min(5, Math.round(avgSeverity)));
  const impact = SEVERITY_TO_RICE_IMPACT[roundedSeverity] ?? 1;

  // Confidence: based on evidence volume
  const confidence = getConfidenceValue(evidenceCount);

  // Effort: from manual estimate
  const effort = riceInput.manualEffort ?? opp.effortEstimate;

  const riceScore = effort > 0 ? (reach * impact * confidence) / effort : 0;

  return {
    reach,
    impact,
    confidence,
    effort,
    riceScore: Math.round(riceScore * 100) / 100,
  };
}

function estimateReach(
  evidence: EvidenceItem[],
  segmentCustomerCounts: Record<string, number>,
): number {
  // Count evidence per segment, compute proportion, extrapolate to customer base
  const segmentEvidenceCounts: Record<string, number> = {};
  let totalEvidence = 0;

  for (const item of evidence) {
    for (const tag of item.segmentTags) {
      const normalized = tag.toLowerCase().trim();
      segmentEvidenceCounts[normalized] = (segmentEvidenceCounts[normalized] ?? 0) + 1;
    }
    totalEvidence++;
  }

  if (totalEvidence === 0) return 0;

  let totalReach = 0;
  for (const [segment, evidenceCount] of Object.entries(segmentEvidenceCounts)) {
    const totalCustomers = segmentCustomerCounts[segment] ?? 0;
    if (totalCustomers === 0) continue;
    // Proportion of evidence from this segment × total customers in segment
    const proportion = evidenceCount / totalEvidence;
    totalReach += Math.round(proportion * totalCustomers);
  }

  return totalReach || totalEvidence;
}

// ── ICE Score ────────────────────────────────────────────────────────

export function computeICEScore(opp: OpportunityInput): ICEScoreResult {
  const evidenceCount = opp.evidence.length;

  // Impact: same as severity (1-5)
  const impact = computeAverageSeverity(opp.evidence);

  // Confidence: same as RICE confidence (0-1)
  const confidence = getConfidenceValue(evidenceCount);

  // Ease: inverse of effort (1-5 → 1.0-0.2)
  const ease = 1 / Math.max(opp.effortEstimate, 1);

  const iceScore = impact * confidence * ease;

  return {
    impact: Math.round(impact * 100) / 100,
    confidence,
    ease: Math.round(ease * 100) / 100,
    iceScore: Math.round(iceScore * 100) / 100,
  };
}

// ── Full Score Computation ───────────────────────────────────────────

export function computeAllScores(
  opp: OpportunityInput,
  config: ScoringConfig,
  riceInput: RICEInput = {},
): FullScoreResult {
  const composite = computeCompositeScore(opp, config.weights);
  const rice = computeRICEScore(opp, riceInput);
  const ice = computeICEScore(opp);
  const segmentWeighted = computeSegmentWeightedFrequency(opp.evidence, config.segmentMultipliers);

  // Strategic alignment: use manual value, or auto-scored if available
  const strategicAlignment = {
    overallAlignment: composite.strategicAlignment,
    perBetScores: {} as Record<string, number>,
  };

  return { composite, rice, ice, segmentWeighted, strategicAlignment };
}
