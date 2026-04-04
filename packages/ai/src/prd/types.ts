/**
 * Types for the evidence-backed PRD generation system.
 */

// ── Evidence Package ─────────────────────────────────────────────────

export interface EvidencePainPoint {
  id: string;
  title: string;
  description: string;
  severity: number;
  frequency: number;
  quotes: string[];
}

export interface EvidenceDesire {
  id: string;
  title: string;
  description: string;
  frequency: number;
  quotes: string[];
}

export interface EvidenceCompetitor {
  competitorName: string;
  featureArea: string | null;
  comparison: "FAVORABLE" | "UNFAVORABLE" | "NEUTRAL";
  quote: string;
}

export interface EvidenceJTBD {
  id: string;
  statement: string;
  jobType: string;
  importance: number;
  satisfaction: number;
}

export interface EvidenceAnalytics {
  metric: string;
  value: number;
  trend: string;
  period: string;
}

export interface EvidenceTheme {
  id: string;
  title: string;
  feedbackCount: number;
}

export interface EvidencePackage {
  opportunityTitle: string;
  opportunityDescription: string | null;
  painPoints: EvidencePainPoint[];
  desires: EvidenceDesire[];
  themes: EvidenceTheme[];
  competitors: EvidenceCompetitor[];
  jtbds: EvidenceJTBD[];
  analytics: EvidenceAnalytics[];
  existingSpecs: Array<{ id: string; title: string; type: string }>;
  segmentDistribution: Record<string, number>;
}

// ── PRD Structure ────────────────────────────────────────────────────

export interface PRDSection {
  id: string;
  title: string;
  content: string;
  citations: PRDCitation[];
  evidenceStrength: number; // 0-1: ratio of cited vs uncited claims
}

export interface PRDCitation {
  citationRef: string; // "[Evidence: ins_xyz]"
  evidenceType: "insight" | "feedback_item" | "analytics" | "competitive" | "jtbd";
  evidenceId: string;
  quote: string | null;
  position: number; // character offset in content
}

export interface GeneratedPRD {
  title: string;
  sections: PRDSection[];
  metadata: {
    generatedAt: string;
    evidenceCount: number;
    assumptionCount: number;
    model: string;
  };
}

// ── AI Assist Commands ───────────────────────────────────────────────

export type AIAssistCommand = "find_evidence" | "challenge" | "expand" | "simplify";

export interface AIAssistRequest {
  command: AIAssistCommand;
  selectedText: string;
  sectionContext: string;
  fullPRDContext?: string;
}

export interface AIAssistResponse {
  content: string;
  citations?: PRDCitation[];
}
