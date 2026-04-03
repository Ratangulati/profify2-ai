export {
  detectByNameAndAlias,
  detectByLLM,
  detectCompetitorMentions,
  buildDetectionPrompt,
  parseLLMDetectionResponse,
} from "./detection.js";

export type {
  CompetitorConfig,
  DetectionResult,
  FeedbackForDetection,
  DetectionBatchResult,
} from "./detection.js";

export {
  buildExtractionPrompt,
  parseExtractionResponse,
  extractCompetitiveInsights,
} from "./extraction.js";

export type { ComparisonType, CompetitorExtraction, ExtractionBatchResult } from "./extraction.js";

export { buildBriefPrompt, generateCompetitiveBrief } from "./brief.js";

export type { CompetitiveDataSummary, CompetitiveBrief } from "./brief.js";
