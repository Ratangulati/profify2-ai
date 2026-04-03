/**
 * Types for the opportunity scoring engine.
 */

// ── Scoring Config ───────────────────────────────────────────────────

export interface ScoringWeights {
  frequency: number; // w1 - default 0.3
  severity: number; // w2 - default 0.3
  strategicAlignment: number; // w3 - default 0.2
  effortInverse: number; // w4 - default 0.2
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  frequency: 0.3,
  severity: 0.3,
  strategicAlignment: 0.2,
  effortInverse: 0.2,
};

export interface SegmentMultipliers {
  [segment: string]: number;
}

export const DEFAULT_SEGMENT_MULTIPLIERS: SegmentMultipliers = {
  enterprise: 5,
  smb: 2,
  free: 1,
};

export interface StrategicBet {
  id: string;
  statement: string;
  weight: number;
}

export interface ScoringConfig {
  weights: ScoringWeights;
  segmentMultipliers: SegmentMultipliers;
  strategicBets: StrategicBet[];
}

// ── Opportunity Input ────────────────────────────────────────────────

export interface EvidenceItem {
  ingestedAt: Date;
  severity: number;
  segmentTags: string[];
}

export interface OpportunityInput {
  id: string;
  title: string;
  description: string | null;
  effortEstimate: number; // 1-5
  strategicAlignment: number; // 0-1 (manual override)
  evidence: EvidenceItem[];
}

// ── Score Results ────────────────────────────────────────────────────

export interface CompositeScoreResult {
  frequencyScore: number;
  severityScore: number;
  strategicAlignment: number;
  effortInverse: number;
  compositeScore: number;
}

export interface RICEScoreResult {
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
  riceScore: number;
}

export interface ICEScoreResult {
  impact: number;
  confidence: number;
  ease: number;
  iceScore: number;
}

export interface SegmentWeightedResult {
  segmentWeightedFrequency: number;
  segmentBreakdown: Record<string, number>;
}

export interface StrategicAlignmentResult {
  overallAlignment: number;
  perBetScores: Record<string, number>;
}

export interface FullScoreResult {
  composite: CompositeScoreResult;
  rice: RICEScoreResult;
  ice: ICEScoreResult;
  segmentWeighted: SegmentWeightedResult;
  strategicAlignment: StrategicAlignmentResult;
}

// ── RICE Impact Mapping ──────────────────────────────────────────────

/** Maps severity (1-5) to RICE impact scale (0.25, 0.5, 1, 2, 3) */
export const SEVERITY_TO_RICE_IMPACT: Record<number, number> = {
  1: 0.25,
  2: 0.5,
  3: 1,
  4: 2,
  5: 3,
};

// ── Confidence Thresholds ────────────────────────────────────────────

export const CONFIDENCE_THRESHOLDS = {
  HIGH: 20, // >20 evidence items
  MEDIUM: 10, // 10-20 evidence items
  LOW: 0, // <10 evidence items
} as const;

export type ConfidenceLevel = "high" | "medium" | "low";
