/**
 * Query intent parsing: classifies natural language product questions
 * into structured query types for evidence assembly.
 */

import type { LLMProvider } from "../types.js";

// ── Types ──────────────────────────────────────────────────────────────

export type QueryIntent =
  | "build_recommendation"
  | "segment_analysis"
  | "pain_exploration"
  | "feature_inquiry"
  | "competitive";

export interface ParsedQuery {
  intent: QueryIntent;
  segments: string[];
  featureArea: string | null;
  competitor: string | null;
  constraints: string[];
  rawQuery: string;
}

// ── Rule-based fast path ───────────────────────────────────────────────

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: QueryIntent }> = [
  { pattern: /what\s+should\s+we\s+build/i, intent: "build_recommendation" },
  { pattern: /what\s+to\s+build/i, intent: "build_recommendation" },
  { pattern: /prioriti[sz]e/i, intent: "build_recommendation" },
  { pattern: /top\s+opportunities/i, intent: "build_recommendation" },
  { pattern: /enterprise\s+users?|smb|segment/i, intent: "segment_analysis" },
  { pattern: /churn|retention|leaving|cancel/i, intent: "pain_exploration" },
  { pattern: /struggling|frustrat|pain\s+point/i, intent: "pain_exploration" },
  { pattern: /what\s+do\s+users?\s+think\s+about/i, intent: "feature_inquiry" },
  { pattern: /feedback\s+(on|about|for)/i, intent: "feature_inquiry" },
  { pattern: /how\s+(does|do)\s+\w+\s+feel\s+about/i, intent: "feature_inquiry" },
  { pattern: /compar[ei]|competitor|versus|vs\.?/i, intent: "competitive" },
  { pattern: /how\s+do\s+we\s+(stack\s+up|compare)/i, intent: "competitive" },
];

/**
 * Try to classify intent using keyword patterns (fast, no LLM call).
 */
export function classifyByPattern(query: string): QueryIntent | null {
  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(query)) return intent;
  }
  return null;
}

// ── LLM-based classification ───────────────────────────────────────────

export function buildIntentPrompt(query: string): string {
  return `Classify this product question into one of these intent types:

- build_recommendation: "What should we build?" → user wants ranked opportunities/features
- segment_analysis: "What do enterprise users want?" → user wants insights filtered by user segment
- pain_exploration: "Why are users churning?" → user wants churn/pain-correlated insights
- feature_inquiry: "What do users think about search?" → user wants insights about a specific feature
- competitive: "How do we compare to X?" → user wants competitive analysis

Query: "${query}"

Return a JSON object with:
- "intent": one of the types above
- "segments": array of user segments mentioned (e.g., ["enterprise", "free tier"]), empty if none
- "feature_area": specific feature/area mentioned (e.g., "search", "onboarding"), or null
- "competitor": specific competitor mentioned, or null
- "constraints": any constraints or filters (e.g., ["last 30 days", "mobile only"]), empty if none`;
}

interface RawParsedQuery {
  intent: string;
  segments: string[];
  feature_area: string | null;
  competitor: string | null;
  constraints: string[];
}

const VALID_INTENTS = new Set<QueryIntent>([
  "build_recommendation",
  "segment_analysis",
  "pain_exploration",
  "feature_inquiry",
  "competitive",
]);

export function parseIntentResponse(raw: string, originalQuery: string): ParsedQuery {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned) as RawParsedQuery;

    return {
      intent: VALID_INTENTS.has(parsed.intent as QueryIntent)
        ? (parsed.intent as QueryIntent)
        : "build_recommendation",
      segments: Array.isArray(parsed.segments)
        ? parsed.segments.filter((s) => typeof s === "string")
        : [],
      featureArea: typeof parsed.feature_area === "string" ? parsed.feature_area : null,
      competitor: typeof parsed.competitor === "string" ? parsed.competitor : null,
      constraints: Array.isArray(parsed.constraints)
        ? parsed.constraints.filter((s) => typeof s === "string")
        : [],
      rawQuery: originalQuery,
    };
  } catch {
    // Fallback: use pattern matching
    const intent = classifyByPattern(originalQuery) ?? "build_recommendation";
    return {
      intent,
      segments: [],
      featureArea: null,
      competitor: null,
      constraints: [],
      rawQuery: originalQuery,
    };
  }
}

/**
 * Parse a natural language query into a structured intent.
 * Uses fast pattern matching first, falls back to LLM.
 */
export async function parseQueryIntent(
  provider: LLMProvider,
  query: string,
  model?: string,
): Promise<ParsedQuery> {
  // Try fast classification first
  const fastIntent = classifyByPattern(query);

  // If we got an intent but might need more details, still use LLM for extraction
  const prompt = buildIntentPrompt(query);

  const response = await provider.complete({
    messages: [
      {
        role: "system",
        content:
          "You classify product questions into structured query types. Output only valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    model,
    temperature: 0.1,
    maxTokens: 500,
  });

  const parsed = parseIntentResponse(response.content, query);

  // Use fast intent if LLM disagrees and fast match is confident
  if (fastIntent && parsed.intent !== fastIntent) {
    parsed.intent = fastIntent;
  }

  return parsed;
}
