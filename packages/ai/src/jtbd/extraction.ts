/**
 * JTBD inference: extracts Jobs-to-be-Done from theme clusters
 * using the "When I..., I want to..., so I can..." framework.
 */

import { parseJsonArray } from "../extraction/extractor.js";
import type { LLMProvider } from "../types.js";

// ── Types ──────────────────────────────────────────────────────────────

export type JTBDJobType = "MAIN" | "RELATED" | "EMOTIONAL" | "SOCIAL";

export interface FeedbackForJTBD {
  id: string;
  content: string;
  sentimentScore: number | null;
}

export interface ExtractedJTBD {
  statement: string;
  jobType: JTBDJobType;
  importance: number;
  satisfaction: number;
  opportunityScore: number;
  evidenceIds: string[];
}

export interface JTBDExtractionResult {
  jobs: ExtractedJTBD[];
  itemsAnalyzed: number;
}

// ── Prompt ─────────────────────────────────────────────────────────────

export function buildJTBDPrompt(themeTitle: string, items: FeedbackForJTBD[]): string {
  const feedbackList = items.map((item) => `- [${item.id}] ${item.content}`).join("\n");

  return `Analyze this collection of customer feedback under the theme "${themeTitle}" and identify the underlying Jobs-to-be-Done (JTBD).

Use the framework: "When I [situation], I want to [motivation], so I can [expected outcome]"

Distinguish between:
- MAIN: the primary goal the user is trying to accomplish
- RELATED: secondary goals in the same context
- EMOTIONAL: how the user wants to feel
- SOCIAL: how the user wants to be perceived

For each job identified, return a JSON object with:
- "statement": formatted as "When I..., I want to..., so I can..."
- "job_type": one of MAIN, RELATED, EMOTIONAL, SOCIAL
- "importance": 1-5 based on frequency and severity of related feedback
- "satisfaction": 1-5 based on current product capability (inferred from feedback sentiment)
- "evidence_ids": array of feedback item IDs that support this job

Feedback items:
${feedbackList}

Return a JSON array. Identify 2-6 jobs per theme cluster.`;
}

// ── Parsing ────────────────────────────────────────────────────────────

const VALID_JOB_TYPES = new Set<JTBDJobType>(["MAIN", "RELATED", "EMOTIONAL", "SOCIAL"]);

interface RawJTBD {
  statement: string;
  job_type: string;
  importance: number;
  satisfaction: number;
  evidence_ids: string[];
}

export function parseJTBDResponse(raw: string): ExtractedJTBD[] {
  const parsed = parseJsonArray<RawJTBD>(raw);
  return parsed
    .filter(
      (j) =>
        typeof j.statement === "string" &&
        typeof j.job_type === "string" &&
        typeof j.importance === "number" &&
        typeof j.satisfaction === "number",
    )
    .map((j) => {
      const importance = Math.max(1, Math.min(5, Math.round(j.importance)));
      const satisfaction = Math.max(1, Math.min(5, Math.round(j.satisfaction)));
      return {
        statement: j.statement,
        jobType: VALID_JOB_TYPES.has(j.job_type as JTBDJobType)
          ? (j.job_type as JTBDJobType)
          : "RELATED",
        importance,
        satisfaction,
        opportunityScore: calculateOpportunityScore(importance, satisfaction),
        evidenceIds: Array.isArray(j.evidence_ids)
          ? j.evidence_ids.filter((id) => typeof id === "string")
          : [],
      };
    });
}

// ── Scoring ────────────────────────────────────────────────────────────

/**
 * ODI opportunity score: importance + max(importance - satisfaction, 0)
 * Higher = bigger opportunity gap.
 */
export function calculateOpportunityScore(importance: number, satisfaction: number): number {
  const gap = Math.max(importance - satisfaction, 0);
  return importance + gap;
}

// ── Extraction ─────────────────────────────────────────────────────────

const MAX_ITEMS_PER_CALL = 30;

/**
 * Extract JTBDs from a theme's feedback cluster.
 */
export async function extractJTBDs(
  provider: LLMProvider,
  themeTitle: string,
  items: FeedbackForJTBD[],
  model?: string,
): Promise<JTBDExtractionResult> {
  if (items.length === 0) {
    return { jobs: [], itemsAnalyzed: 0 };
  }

  const allJobs: ExtractedJTBD[] = [];

  for (let i = 0; i < items.length; i += MAX_ITEMS_PER_CALL) {
    const batch = items.slice(i, i + MAX_ITEMS_PER_CALL);
    const prompt = buildJTBDPrompt(themeTitle, batch);

    const response = await provider.complete({
      messages: [
        {
          role: "system",
          content:
            "You are an expert in Jobs-to-be-Done theory. Identify the underlying jobs customers are trying to accomplish from their feedback. Output only valid JSON arrays.",
        },
        { role: "user", content: prompt },
      ],
      model,
      temperature: 0.3,
      maxTokens: 4000,
    });

    const jobs = parseJTBDResponse(response.content);
    allJobs.push(...jobs);
  }

  return { jobs: allJobs, itemsAnalyzed: items.length };
}
