/**
 * PRD generation engine.
 * Takes an evidence package, calls LLM, parses the structured PRD,
 * and extracts citations.
 */

import { parseJsonArray } from "../extraction/extractor.js";
import type { LLMProvider } from "../types.js";

import {
  buildPRDPrompt,
  buildFindEvidencePrompt,
  buildChallengePrompt,
  buildExpandPrompt,
  buildSimplifyPrompt,
  PRD_SECTION_TITLES,
  type PRDSectionId,
} from "./prompt.js";
import type {
  EvidencePackage,
  GeneratedPRD,
  PRDSection,
  PRDCitation,
  AIAssistRequest,
  AIAssistResponse,
} from "./types.js";

// ── Citation Extraction ──────────────────────────────────────────────

const CITATION_REGEX = /\[Evidence:\s*([^\]]+)\]/g;
const ASSUMPTION_REGEX = /\[ASSUMPTION[^\]]*\]/g;

/**
 * Extract all [Evidence: id] citations from content and map them to structured citations.
 */
export function extractCitations(content: string, evidencePackage: EvidencePackage): PRDCitation[] {
  const citations: PRDCitation[] = [];
  let match: RegExpExecArray | null;

  const regex = new RegExp(CITATION_REGEX.source, "g");
  while ((match = regex.exec(content)) !== null) {
    const rawId = match[1].trim();
    const evidenceType = resolveEvidenceType(rawId, evidencePackage);

    citations.push({
      citationRef: match[0],
      evidenceType: evidenceType.type,
      evidenceId: evidenceType.id,
      quote: evidenceType.quote,
      position: match.index,
    });
  }

  return citations;
}

/**
 * Count [ASSUMPTION] markers in content.
 */
export function countAssumptions(content: string): number {
  const matches = content.match(ASSUMPTION_REGEX);
  return matches?.length ?? 0;
}

/**
 * Calculate evidence strength for a section: ratio of evidence-backed statements.
 */
export function calculateEvidenceStrength(content: string): number {
  const citations = (content.match(CITATION_REGEX) || []).length;
  const assumptions = (content.match(ASSUMPTION_REGEX) || []).length;
  const total = citations + assumptions;
  if (total === 0) return 0;
  return Math.round((citations / total) * 100) / 100;
}

interface ResolvedEvidence {
  type: PRDCitation["evidenceType"];
  id: string;
  quote: string | null;
}

function resolveEvidenceType(rawId: string, pkg: EvidencePackage): ResolvedEvidence {
  // Check pain points
  const painPoint = pkg.painPoints.find((p) => p.id === rawId);
  if (painPoint) {
    return { type: "insight", id: rawId, quote: painPoint.quotes[0] ?? null };
  }

  // Check desires
  const desire = pkg.desires.find((d) => d.id === rawId);
  if (desire) {
    return { type: "insight", id: rawId, quote: desire.quotes[0] ?? null };
  }

  // Check JTBDs
  const jtbd = pkg.jtbds.find((j) => j.id === rawId);
  if (jtbd) {
    return { type: "jtbd", id: rawId, quote: jtbd.statement };
  }

  // Check themes
  const theme = pkg.themes.find((t) => t.id === rawId);
  if (theme) {
    return { type: "insight", id: rawId, quote: null };
  }

  // Default: assume insight type
  return { type: "insight", id: rawId, quote: null };
}

// ── PRD Response Parser ──────────────────────────────────────────────

interface RawPRDResponse {
  title: string;
  sections: Array<{
    id: string;
    title: string;
    content: string;
    assumption_count?: number;
  }>;
}

/**
 * Parse LLM response into a structured GeneratedPRD.
 */
export function parsePRDResponse(
  raw: string,
  evidencePackage: EvidencePackage,
  model: string,
): GeneratedPRD {
  // Extract JSON from response
  let jsonStr = raw.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  // Try to find a JSON object
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Fallback: return single section with raw content
    return buildFallbackPRD(raw, evidencePackage, model);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as RawPRDResponse;

    let totalEvidence = 0;
    let totalAssumptions = 0;

    const sections: PRDSection[] = (parsed.sections ?? []).map((s) => {
      const citations = extractCitations(s.content, evidencePackage);
      const assumptionCount = countAssumptions(s.content);
      const evidenceStrength = calculateEvidenceStrength(s.content);

      totalEvidence += citations.length;
      totalAssumptions += assumptionCount;

      const sectionTitle = PRD_SECTION_TITLES[s.id as PRDSectionId] ?? s.title ?? s.id;

      return {
        id: s.id,
        title: sectionTitle,
        content: s.content,
        citations,
        evidenceStrength,
      };
    });

    return {
      title: parsed.title ?? `PRD: ${evidencePackage.opportunityTitle}`,
      sections,
      metadata: {
        generatedAt: new Date().toISOString(),
        evidenceCount: totalEvidence,
        assumptionCount: totalAssumptions,
        model,
      },
    };
  } catch {
    return buildFallbackPRD(raw, evidencePackage, model);
  }
}

function buildFallbackPRD(
  raw: string,
  evidencePackage: EvidencePackage,
  model: string,
): GeneratedPRD {
  const citations = extractCitations(raw, evidencePackage);
  return {
    title: `PRD: ${evidencePackage.opportunityTitle}`,
    sections: [
      {
        id: "full_document",
        title: "Full Document",
        content: raw,
        citations,
        evidenceStrength: calculateEvidenceStrength(raw),
      },
    ],
    metadata: {
      generatedAt: new Date().toISOString(),
      evidenceCount: citations.length,
      assumptionCount: countAssumptions(raw),
      model,
    },
  };
}

// ── Generation ───────────────────────────────────────────────────────

/**
 * Generate a complete evidence-backed PRD.
 */
export async function generatePRD(
  provider: LLMProvider,
  evidencePackage: EvidencePackage,
  model?: string,
): Promise<GeneratedPRD> {
  const prompt = buildPRDPrompt(evidencePackage);

  const response = await provider.complete({
    messages: [
      {
        role: "system",
        content:
          "You are a senior product manager writing evidence-backed PRDs. " +
          "Every claim MUST cite evidence using [Evidence: {id}] format. " +
          "Mark uncited claims as [ASSUMPTION - needs validation]. " +
          "Output only valid JSON matching the requested structure. " +
          "Be specific, thorough, and actionable.",
      },
      { role: "user", content: prompt },
    ],
    model,
    temperature: 0.3,
    maxTokens: 8000,
  });

  const usedModel = response.model ?? model ?? "unknown";
  return parsePRDResponse(response.content, evidencePackage, usedModel);
}

// ── AI Assist ────────────────────────────────────────────────────────

/**
 * Handle AI assist commands within the PRD editor.
 */
export async function handleAIAssist(
  provider: LLMProvider,
  request: AIAssistRequest,
  model?: string,
): Promise<AIAssistResponse> {
  let prompt: string;
  let systemMessage: string;
  let parseAsJson = true;

  switch (request.command) {
    case "find_evidence":
      prompt = buildFindEvidencePrompt(request.selectedText, request.sectionContext);
      systemMessage =
        "You are a product research assistant helping find evidence for PRD claims. Output valid JSON.";
      break;

    case "challenge":
      prompt = buildChallengePrompt(request.selectedText, request.sectionContext);
      systemMessage =
        "You are a critical product reviewer stress-testing PRD claims. Output valid JSON.";
      break;

    case "expand":
      prompt = buildExpandPrompt(request.selectedText, request.sectionContext);
      systemMessage =
        "You are a senior product manager expanding PRD sections with detail and evidence.";
      parseAsJson = false;
      break;

    case "simplify":
      prompt = buildSimplifyPrompt(request.selectedText);
      systemMessage = "You are a communication expert simplifying technical content.";
      parseAsJson = false;
      break;
  }

  const response = await provider.complete({
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: prompt },
    ],
    model,
    temperature: request.command === "expand" ? 0.5 : 0.3,
    maxTokens: 3000,
  });

  return { content: response.content };
}
