export {
  buildContradictionPrompt,
  parseContradictionResponse,
  detectContradictions,
} from "./contradictions.js";

export type {
  InsightForContradiction,
  DetectedContradiction,
  ContradictionScanResult,
} from "./contradictions.js";

export {
  buildAssumptionPrompt,
  parseAssumptionResponse,
  surfaceAssumptions,
} from "./assumptions.js";

export type {
  SpecSection,
  SpecForAnalysis,
  AssumptionCategory,
  RiskLevel,
  DetectedAssumption,
  AssumptionScanResult,
} from "./assumptions.js";
