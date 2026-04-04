export {
  generatePRD,
  handleAIAssist,
  extractCitations,
  countAssumptions,
  calculateEvidenceStrength,
  parsePRDResponse,
} from "./generator.js";

export {
  buildPRDPrompt,
  buildFindEvidencePrompt,
  buildChallengePrompt,
  buildExpandPrompt,
  buildSimplifyPrompt,
  PRD_SECTIONS,
  PRD_SECTION_TITLES,
} from "./prompt.js";

export type { PRDSectionId } from "./prompt.js";

export type {
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
} from "./types.js";
