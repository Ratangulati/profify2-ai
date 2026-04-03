export {
  buildPainPointPrompt,
  buildDesirePrompt,
  type FeedbackBatchItem,
  type ExtractedPainPoint,
  type ExtractedDesire,
  type ExtractedInsight,
} from "./prompts.js";

export { extractInsights, parseJsonArray, type ExtractionResult } from "./extractor.js";

export {
  cosineSimilarity,
  embedInsight,
  findDuplicate,
  checkDuplicate,
  type InsightForDedup,
  type DedupResult,
} from "./dedup.js";

export {
  calculateInsightScores,
  calculateFrequency,
  calculateAverageSeverity,
  calculateTrend,
  calculateSegmentDistribution,
  type TrendDirection,
  type InsightScores,
  type EvidenceItem,
} from "./scoring.js";
