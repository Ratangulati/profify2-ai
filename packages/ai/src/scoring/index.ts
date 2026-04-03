export {
  computeFrequencyScore,
  computeAverageSeverity,
  computeSegmentWeightedFrequency,
  computeCompositeScore,
  computeRICEScore,
  computeICEScore,
  computeAllScores,
  getConfidenceLevel,
  getConfidenceValue,
} from "./engine.js";

export type { RICEInput } from "./engine.js";

export {
  buildAlignmentPrompt,
  parseAlignmentResponse,
  scoreStrategicAlignment,
  batchScoreStrategicAlignment,
} from "./strategic.js";

export {
  type ScoringWeights,
  type SegmentMultipliers,
  type ScoringConfig,
  type StrategicBet,
  type EvidenceItem,
  type OpportunityInput,
  type CompositeScoreResult,
  type RICEScoreResult,
  type ICEScoreResult,
  type SegmentWeightedResult,
  type StrategicAlignmentResult,
  type FullScoreResult,
  type ConfidenceLevel,
  DEFAULT_WEIGHTS,
  DEFAULT_SEGMENT_MULTIPLIERS,
  SEVERITY_TO_RICE_IMPACT,
  CONFIDENCE_THRESHOLDS,
} from "./types.js";
