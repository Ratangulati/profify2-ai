import { AnthropicProvider } from "./providers/anthropic";
import { LocalProvider } from "./providers/local";
import { OpenAIProvider } from "./providers/openai";
import type { LLMProvider, ProviderConfig } from "./types";

export type { LLMProvider, ProviderConfig, ProviderType } from "./types";
export type {
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  StreamEvent,
} from "./types";

export { OpenAIProvider } from "./providers/openai";
export { AnthropicProvider } from "./providers/anthropic";
export { LocalProvider } from "./providers/local";

// Extraction pipeline
export {
  extractInsights,
  parseJsonArray,
  checkDuplicate,
  findDuplicate,
  cosineSimilarity,
  embedInsight,
  calculateInsightScores,
  calculateTrend,
  calculateAverageSeverity,
  calculateFrequency,
  calculateSegmentDistribution,
  buildPainPointPrompt,
  buildDesirePrompt,
} from "./extraction/index.js";

export type {
  FeedbackBatchItem,
  ExtractedPainPoint,
  ExtractedDesire,
  ExtractedInsight,
  ExtractionResult,
  InsightForDedup,
  DedupResult,
  TrendDirection,
  InsightScores,
  EvidenceItem,
} from "./extraction/index.js";

// Sentiment analysis
export {
  analyzeSentimentBatch,
  aggregateThemeSentiment,
  buildSentimentPrompt,
  parseSentimentResponse,
  computeFreshnessWeight,
  freshnessWeightedFrequency,
  freshnessWeightedSeverity,
} from "./sentiment/index.js";

export type { SentimentResult, FeedbackForSentiment } from "./sentiment/index.js";

// Trend tracking
export {
  linearRegressionSlope,
  computeTrendLabel,
  getWeekStart,
  getWeekStarts,
  aggregateWeekly,
  fillMissingWeeks,
  checkSpike,
  detectSpikes,
} from "./trends/index.js";

export type {
  DataPoint,
  TrendLabel,
  FeedbackForAggregation,
  WeeklyAggregate,
  SpikeCheckResult,
} from "./trends/index.js";

// Synthesis (contradictions & assumptions)
export {
  buildContradictionPrompt,
  parseContradictionResponse,
  detectContradictions,
  buildAssumptionPrompt,
  parseAssumptionResponse,
  surfaceAssumptions,
} from "./synthesis/index.js";

export type {
  InsightForContradiction,
  DetectedContradiction,
  ContradictionScanResult,
  SpecSection,
  SpecForAnalysis,
  AssumptionCategory,
  RiskLevel,
  DetectedAssumption,
  AssumptionScanResult,
} from "./synthesis/index.js";

// Competitive intelligence
export {
  detectByNameAndAlias,
  detectByLLM,
  detectCompetitorMentions,
  buildDetectionPrompt,
  parseLLMDetectionResponse,
  buildExtractionPrompt,
  parseExtractionResponse,
  extractCompetitiveInsights,
  buildBriefPrompt,
  generateCompetitiveBrief,
} from "./competitive/index.js";

export type {
  CompetitorConfig,
  DetectionResult,
  FeedbackForDetection,
  DetectionBatchResult,
  ComparisonType,
  CompetitorExtraction,
  ExtractionBatchResult,
  CompetitiveDataSummary,
  CompetitiveBrief,
} from "./competitive/index.js";

// JTBD & Cross-project learning
export {
  buildJTBDPrompt,
  parseJTBDResponse,
  calculateOpportunityScore,
  extractJTBDs,
  buildScoringModel,
  predictOutcome,
  computeCorrelation,
} from "./jtbd/index.js";

export type {
  JTBDJobType,
  FeedbackForJTBD,
  ExtractedJTBD,
  JTBDExtractionResult,
  InsightAttributes,
  OutcomeRecord,
  ScoringModel,
  AttributeWeights,
  PredictionResult,
} from "./jtbd/index.js";

// Opportunity scoring engine
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
  buildAlignmentPrompt,
  parseAlignmentResponse,
  scoreStrategicAlignment,
  batchScoreStrategicAlignment,
} from "./scoring/index.js";

export type {
  RICEInput,
  ScoringWeights,
  SegmentMultipliers,
  ScoringConfig,
  StrategicBet,
  EvidenceItem as ScoringEvidenceItem,
  OpportunityInput,
  CompositeScoreResult,
  RICEScoreResult,
  ICEScoreResult,
  SegmentWeightedResult,
  StrategicAlignmentResult,
  FullScoreResult,
  ConfidenceLevel,
} from "./scoring/index.js";

export {
  DEFAULT_WEIGHTS as DEFAULT_SCORING_WEIGHTS,
  DEFAULT_SEGMENT_MULTIPLIERS,
  SEVERITY_TO_RICE_IMPACT,
  CONFIDENCE_THRESHOLDS,
} from "./scoring/index.js";

// PRD generation
export {
  generatePRD,
  handleAIAssist,
  extractCitations,
  countAssumptions,
  calculateEvidenceStrength,
  parsePRDResponse,
  buildPRDPrompt,
  buildFindEvidencePrompt,
  buildChallengePrompt,
  buildExpandPrompt,
  buildSimplifyPrompt,
  PRD_SECTIONS,
  PRD_SECTION_TITLES,
} from "./prd/index.js";

export type {
  PRDSectionId,
  EvidencePackage,
  EvidencePainPoint,
  EvidenceDesire,
  EvidenceCompetitor,
  EvidenceJTBD,
  EvidenceAnalytics,
  EvidenceTheme,
  GeneratedPRD,
  PRDSection,
  PRDCitation,
  AIAssistCommand,
  AIAssistRequest,
  AIAssistResponse,
} from "./prd/index.js";

// Query engine
export {
  classifyByPattern,
  buildIntentPrompt,
  parseIntentResponse,
  parseQueryIntent,
  formatEvidenceForLLM,
  rankEvidence,
  buildResponsePrompt,
  parseQueryResponse,
  generateQueryResponse,
} from "./query/index.js";

export type {
  QueryIntent,
  ParsedQuery,
  EvidenceInsight,
  EvidenceOpportunity,
  EvidenceTheme as QueryEvidenceTheme,
  EvidenceCompetitor as QueryEvidenceCompetitor,
  AssembledEvidence,
  Recommendation,
  QueryResponse,
} from "./query/index.js";

export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.type) {
    case "openai":
      return new OpenAIProvider(config.apiKey, config.baseUrl, config.defaultModel);
    case "anthropic":
      return new AnthropicProvider(config.apiKey, config.defaultModel);
    case "local":
      return new LocalProvider(config.baseUrl, config.defaultModel);
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}
