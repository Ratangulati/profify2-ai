/**
 * Assumption surfacing: analyzes specs/PRDs for implicit assumptions
 * about user behavior, technical feasibility, market conditions, etc.
 */

import { parseJsonArray } from "../extraction/extractor.js";
import type { LLMProvider } from "../types.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface SpecSection {
  sectionRef: string;
  content: string;
}

export interface SpecForAnalysis {
  id: string;
  title: string;
  sections: SpecSection[];
}

export type AssumptionCategory =
  | "USER_BEHAVIOR"
  | "TECHNICAL"
  | "MARKET"
  | "ADOPTION"
  | "RESOURCE"
  | "REGULATORY";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DetectedAssumption {
  specId: string;
  sectionRef: string | null;
  quoteText: string;
  assumption: string;
  category: AssumptionCategory;
  riskLevel: RiskLevel;
  suggestion: string | null;
}

export interface AssumptionScanResult {
  assumptions: DetectedAssumption[];
  sectionsScanned: number;
}

// ── Prompt builder ─────────────────────────────────────────────────────

export function buildAssumptionPrompt(specTitle: string, sections: SpecSection[]): string {
  const sectionList = sections.map((s) => `### ${s.sectionRef}\n${s.content}`).join("\n\n");

  return `Analyze the following product spec/PRD for implicit assumptions — beliefs the author takes for granted that may or may not be true and could affect the success of this feature.

SPEC: "${specTitle}"

${sectionList}

Categories of assumptions to look for:
- USER_BEHAVIOR: Assumptions about how users will act (e.g., "users will discover this feature organically")
- TECHNICAL: Assumptions about technical feasibility or performance (e.g., "the API can handle 10x current load")
- MARKET: Assumptions about market conditions or competitive landscape
- ADOPTION: Assumptions about adoption rates or user willingness to change
- RESOURCE: Assumptions about team capacity, timeline, or budget
- REGULATORY: Assumptions about compliance, legal, or policy requirements

For each assumption found, return a JSON object with:
- "section_ref": The section where the assumption was found (or null if it spans multiple sections)
- "quote_text": The exact text that contains or implies the assumption
- "assumption": A clear statement of the implicit assumption (1 sentence)
- "category": One of USER_BEHAVIOR, TECHNICAL, MARKET, ADOPTION, RESOURCE, REGULATORY
- "risk_level": LOW, MEDIUM, HIGH, or CRITICAL based on potential impact if wrong
- "suggestion": How to validate this assumption (1-2 sentences, or null)

Return a JSON array. If no assumptions are found, return an empty array [].
Focus on non-obvious, implicit assumptions — not explicitly stated requirements.`;
}

// ── Parsing ────────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set<AssumptionCategory>([
  "USER_BEHAVIOR",
  "TECHNICAL",
  "MARKET",
  "ADOPTION",
  "RESOURCE",
  "REGULATORY",
]);

const VALID_RISK_LEVELS = new Set<RiskLevel>(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

interface RawAssumption {
  section_ref: string | null;
  quote_text: string;
  assumption: string;
  category: string;
  risk_level: string;
  suggestion: string | null;
}

export function parseAssumptionResponse(raw: string, specId: string): DetectedAssumption[] {
  const parsed = parseJsonArray<RawAssumption>(raw);
  return parsed
    .filter(
      (a) =>
        typeof a.quote_text === "string" &&
        typeof a.assumption === "string" &&
        typeof a.category === "string" &&
        typeof a.risk_level === "string",
    )
    .map((a) => ({
      specId,
      sectionRef: a.section_ref ?? null,
      quoteText: a.quote_text,
      assumption: a.assumption,
      category: VALID_CATEGORIES.has(a.category as AssumptionCategory)
        ? (a.category as AssumptionCategory)
        : "TECHNICAL",
      riskLevel: VALID_RISK_LEVELS.has(a.risk_level as RiskLevel)
        ? (a.risk_level as RiskLevel)
        : "MEDIUM",
      suggestion: a.suggestion ?? null,
    }));
}

// ── Analysis ───────────────────────────────────────────────────────────

const MAX_SECTIONS_PER_CALL = 10;

/**
 * Analyze a spec for implicit assumptions. Processes sections in batches
 * to stay within context limits.
 */
export async function surfaceAssumptions(
  provider: LLMProvider,
  spec: SpecForAnalysis,
  model?: string,
): Promise<AssumptionScanResult> {
  if (spec.sections.length === 0) {
    return { assumptions: [], sectionsScanned: 0 };
  }

  const allAssumptions: DetectedAssumption[] = [];
  let sectionsScanned = 0;

  for (let i = 0; i < spec.sections.length; i += MAX_SECTIONS_PER_CALL) {
    const batch = spec.sections.slice(i, i + MAX_SECTIONS_PER_CALL);
    sectionsScanned += batch.length;

    const prompt = buildAssumptionPrompt(spec.title, batch);

    const response = await provider.complete({
      messages: [
        {
          role: "system",
          content:
            "You are an expert product strategist who identifies hidden assumptions in product specs. Output only valid JSON arrays.",
        },
        { role: "user", content: prompt },
      ],
      model,
      temperature: 0.3,
      maxTokens: 4000,
    });

    const batchAssumptions = parseAssumptionResponse(response.content, spec.id);
    allAssumptions.push(...batchAssumptions);
  }

  return { assumptions: allAssumptions, sectionsScanned };
}
