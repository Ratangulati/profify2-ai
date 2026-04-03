export {
  buildJTBDPrompt,
  parseJTBDResponse,
  calculateOpportunityScore,
  extractJTBDs,
} from "./extraction.js";

export type {
  JTBDJobType,
  FeedbackForJTBD,
  ExtractedJTBD,
  JTBDExtractionResult,
} from "./extraction.js";

export { buildScoringModel, predictOutcome, computeCorrelation } from "./scoring.js";

export type {
  InsightAttributes,
  OutcomeRecord,
  ScoringModel,
  AttributeWeights,
  PredictionResult,
} from "./scoring.js";
