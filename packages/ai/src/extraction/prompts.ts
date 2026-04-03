/**
 * LLM prompts for insight extraction from customer feedback.
 */

export interface FeedbackBatchItem {
  id: string;
  content: string;
  customerName?: string;
  segmentTags: string[];
}

// ── Pain Point Extraction ──────────────────────────────────────────────

export function buildPainPointPrompt(items: FeedbackBatchItem[]): string {
  const feedbackBlock = items
    .map((item, i) => `[${i + 1}] (id: ${item.id}) ${item.content}`)
    .join("\n\n");

  return `You are analyzing customer feedback for a software product. Extract specific pain points — problems, frustrations, and complaints the user is experiencing.

For each pain point, provide:
- title: concise name (e.g., "Slow dashboard loading")
- description: 1-2 sentence summary
- severity: 1-5 scale (1=minor annoyance, 5=blocking/deal-breaker)
- verbatim_quotes: array of objects with { text: "exact quote", feedback_id: "the id" }
- affected_workflow: what the user was trying to do when they hit this problem

If no pain points are found, return an empty array.

Feedback to analyze:
${feedbackBlock}

Return a JSON array of pain points. Output ONLY valid JSON, no markdown fences.`;
}

// ── Desire Extraction ──────────────────────────────────────────────────

export function buildDesirePrompt(items: FeedbackBatchItem[]): string {
  const feedbackBlock = items
    .map((item, i) => `[${i + 1}] (id: ${item.id}) ${item.content}`)
    .join("\n\n");

  return `You are analyzing customer feedback for a software product. Extract feature requests, wishes, and desires — things users want that don't exist yet. These are different from complaints about existing features.

For each desire:
- title: concise feature name
- description: what the user wants and why
- frequency_signal: how many of the provided items express this desire (integer)
- verbatim_quotes: array of objects with { text: "exact quote", feedback_id: "the id" }
- inferred_jtbd: the underlying job-to-be-done this desire serves

If no desires are found, return an empty array.

Feedback to analyze:
${feedbackBlock}

Return a JSON array of desires. Output ONLY valid JSON, no markdown fences.`;
}

// ── Response types ─────────────────────────────────────────────────────

export interface ExtractedPainPoint {
  title: string;
  description: string;
  severity: number;
  verbatim_quotes: Array<{ text: string; feedback_id: string }>;
  affected_workflow: string;
}

export interface ExtractedDesire {
  title: string;
  description: string;
  frequency_signal: number;
  verbatim_quotes: Array<{ text: string; feedback_id: string }>;
  inferred_jtbd: string;
}

export type ExtractedInsight = ExtractedPainPoint | ExtractedDesire;
