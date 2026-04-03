/**
 * Query response generation: produces structured answers from assembled evidence.
 */

import { parseJsonArray } from "../extraction/extractor.js";
import type { LLMProvider } from "../types.js";

import type { AssembledEvidence } from "./evidence.js";
import { formatEvidenceForLLM, rankEvidence } from "./evidence.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface Recommendation {
  title: string;
  reasoning: string;
  confidenceLevel: "high" | "medium" | "low";
  evidenceCount: number;
  keyQuote: string | null;
  linkedThemes: string[];
}

export interface QueryResponse {
  summary: string;
  recommendations: Recommendation[];
  risks: string[];
  nextSteps: string[];
  query: string;
}

// ── Prompt ─────────────────────────────────────────────────────────────

export function buildResponsePrompt(question: string, evidenceText: string): string {
  return `Based on the following evidence from customer feedback, analytics, and product data, answer this question: "${question}"

Evidence:
${evidenceText}

Provide a response as a JSON object with:
- "summary": A direct 2-3 sentence answer to the question
- "recommendations": Array of 3-5 recommendation objects, each with:
  - "title": Short recommendation title
  - "reasoning": 1-2 sentence explanation
  - "confidence_level": "high", "medium", or "low"
  - "evidence_count": number of supporting data points
  - "key_quote": one representative customer quote (or null)
  - "linked_themes": array of related theme names
- "risks": Array of 1-3 risk/caveat strings
- "next_steps": Array of 2-3 suggested next step strings

Cite specific feedback items and data points. Never invent evidence.`;
}

// ── Parsing ────────────────────────────────────────────────────────────

interface RawResponse {
  summary: string;
  recommendations: Array<{
    title: string;
    reasoning: string;
    confidence_level: string;
    evidence_count: number;
    key_quote: string | null;
    linked_themes: string[];
  }>;
  risks: string[];
  next_steps: string[];
}

const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

export function parseQueryResponse(raw: string, originalQuery: string): QueryResponse {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned) as RawResponse;

    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "Unable to generate summary.",
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations
            .filter((r) => typeof r.title === "string" && typeof r.reasoning === "string")
            .map((r) => ({
              title: r.title,
              reasoning: r.reasoning,
              confidenceLevel: VALID_CONFIDENCE.has(r.confidence_level)
                ? (r.confidence_level as "high" | "medium" | "low")
                : "medium",
              evidenceCount: typeof r.evidence_count === "number" ? r.evidence_count : 0,
              keyQuote: typeof r.key_quote === "string" ? r.key_quote : null,
              linkedThemes: Array.isArray(r.linked_themes)
                ? r.linked_themes.filter((t) => typeof t === "string")
                : [],
            }))
        : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.filter((r) => typeof r === "string") : [],
      nextSteps: Array.isArray(parsed.next_steps)
        ? parsed.next_steps.filter((s) => typeof s === "string")
        : [],
      query: originalQuery,
    };
  } catch {
    return {
      summary: raw.slice(0, 500),
      recommendations: [],
      risks: [],
      nextSteps: [],
      query: originalQuery,
    };
  }
}

// ── Generation ─────────────────────────────────────────────────────────

/**
 * Generate a structured response to a product query from assembled evidence.
 */
export async function generateQueryResponse(
  provider: LLMProvider,
  question: string,
  evidence: AssembledEvidence,
  model?: string,
): Promise<QueryResponse> {
  const ranked = rankEvidence(evidence);
  const evidenceText = formatEvidenceForLLM(ranked);
  const prompt = buildResponsePrompt(question, evidenceText);

  const response = await provider.complete({
    messages: [
      {
        role: "system",
        content:
          "You are a senior product strategist answering questions about a product based on customer feedback evidence. Be specific, evidence-based, and actionable. Output only valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    model,
    temperature: 0.3,
    maxTokens: 4000,
  });

  return parseQueryResponse(response.content, question);
}
