/**
 * PRD generation prompt builder.
 * Assembles evidence into a structured prompt for LLM generation.
 */

import type { EvidencePackage } from "./types.js";

// ── PRD Sections ─────────────────────────────────────────────────────

export const PRD_SECTIONS = [
  "problem_statement",
  "user_impact",
  "goals_and_success_metrics",
  "user_stories",
  "requirements",
  "edge_cases",
  "out_of_scope",
  "technical_considerations",
  "ui_recommendations",
  "rollout_strategy",
  "rollback_criteria",
  "open_questions",
] as const;

export type PRDSectionId = (typeof PRD_SECTIONS)[number];

export const PRD_SECTION_TITLES: Record<PRDSectionId, string> = {
  problem_statement: "Problem Statement",
  user_impact: "User Impact",
  goals_and_success_metrics: "Goals & Success Metrics",
  user_stories: "User Stories",
  requirements: "Requirements",
  edge_cases: "Edge Cases",
  out_of_scope: "Out of Scope",
  technical_considerations: "Technical Considerations",
  ui_recommendations: "UI Recommendations",
  rollout_strategy: "Rollout Strategy",
  rollback_criteria: "Rollback Criteria",
  open_questions: "Open Questions",
};

// ── Evidence Formatting ──────────────────────────────────────────────

function formatPainPoints(pkg: EvidencePackage): string {
  if (pkg.painPoints.length === 0) return "No pain points identified.";

  return pkg.painPoints
    .map((p) => {
      const quotes = p.quotes
        .slice(0, 3)
        .map((q) => `  - "${q}"`)
        .join("\n");
      return `- [ID: ${p.id}] ${p.title} (severity: ${p.severity}/5, frequency: ${p.frequency})\n  ${p.description}\n${quotes}`;
    })
    .join("\n\n");
}

function formatDesires(pkg: EvidencePackage): string {
  if (pkg.desires.length === 0) return "No desires identified.";

  return pkg.desires
    .map((d) => {
      const quotes = d.quotes
        .slice(0, 3)
        .map((q) => `  - "${q}"`)
        .join("\n");
      return `- [ID: ${d.id}] ${d.title} (frequency: ${d.frequency})\n  ${d.description}\n${quotes}`;
    })
    .join("\n\n");
}

function formatCompetitors(pkg: EvidencePackage): string {
  if (pkg.competitors.length === 0) return "No competitive data available.";

  return pkg.competitors
    .map(
      (c) =>
        `- ${c.competitorName}${c.featureArea ? ` (${c.featureArea})` : ""}: ${c.comparison.toLowerCase()} — "${c.quote}"`,
    )
    .join("\n");
}

function formatJTBDs(pkg: EvidencePackage): string {
  if (pkg.jtbds.length === 0) return "No JTBD data available.";

  return pkg.jtbds
    .map(
      (j) =>
        `- [ID: ${j.id}] "${j.statement}" (${j.jobType}, importance: ${j.importance}/5, satisfaction: ${j.satisfaction}/5)`,
    )
    .join("\n");
}

function formatAnalytics(pkg: EvidencePackage): string {
  if (pkg.analytics.length === 0) return "No analytics data available.";

  return pkg.analytics.map((a) => `- ${a.metric}: ${a.value} (${a.trend}, ${a.period})`).join("\n");
}

function formatSegments(pkg: EvidencePackage): string {
  const entries = Object.entries(pkg.segmentDistribution).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return "No segment data.";

  return entries.map(([seg, count]) => `- ${seg}: ${count} feedback items`).join("\n");
}

function formatThemes(pkg: EvidencePackage): string {
  if (pkg.themes.length === 0) return "No themes identified.";

  return pkg.themes
    .map((t) => `- [ID: ${t.id}] ${t.title} (${t.feedbackCount} feedback items)`)
    .join("\n");
}

function formatExistingSpecs(pkg: EvidencePackage): string {
  if (pkg.existingSpecs.length === 0) return "No existing specs for context.";

  return pkg.existingSpecs.map((s) => `- ${s.title} (${s.type})`).join("\n");
}

// ── Main Prompt ──────────────────────────────────────────────────────

export function buildPRDPrompt(pkg: EvidencePackage): string {
  return `Generate a Product Requirements Document (PRD) for the following opportunity.

CRITICAL: Every claim must cite specific evidence. Use [Evidence: {id}] citations inline, where {id} is the ID from the evidence package below. Never state user needs without citing the specific feedback, interview, or data that supports it. If you don't have evidence for a claim, explicitly mark it as [ASSUMPTION - needs validation].

## Opportunity
Title: ${pkg.opportunityTitle}
Description: ${pkg.opportunityDescription ?? "No description provided"}

## Evidence Package

### Pain Points
${formatPainPoints(pkg)}

### Desires / Feature Requests
${formatDesires(pkg)}

### Themes
${formatThemes(pkg)}

### Competitive Context
${formatCompetitors(pkg)}

### Jobs-to-be-Done
${formatJTBDs(pkg)}

### Analytics & Trends
${formatAnalytics(pkg)}

### Segment Distribution
${formatSegments(pkg)}

### Related Existing Specs
${formatExistingSpecs(pkg)}

## PRD Structure

Generate each of the following sections. For each section, provide:
1. Rich content with inline [Evidence: {id}] citations
2. Mark any uncited claims as [ASSUMPTION - needs validation]

Sections to generate:
1. **Problem Statement**: What problem are we solving? (with evidence citations)
2. **User Impact**: Who is affected, how many, how severely? (with segment data)
3. **Goals & Success Metrics**: What does success look like numerically?
4. **User Stories**: As a [persona], I want [goal], so that [outcome] — with acceptance criteria
5. **Requirements**: Functional requirements, each traced to evidence
6. **Edge Cases**: What could go wrong? Enumerate failure modes.
7. **Out of Scope**: What we're explicitly NOT building and why
8. **Technical Considerations**: API changes, data model suggestions, performance requirements
9. **UI Recommendations**: Proposed changes to UI (reference current state)
10. **Rollout Strategy**: Feature flag plan, beta cohort, A/B test design
11. **Rollback Criteria**: When should we pull this feature?
12. **Open Questions**: Unresolved issues needing input

Return as valid JSON with this structure:
{
  "title": "PRD: <title>",
  "sections": [
    {
      "id": "<section_id>",
      "title": "<Section Title>",
      "content": "<markdown content with [Evidence: id] citations>",
      "assumption_count": <number of [ASSUMPTION] markers in this section>
    }
  ]
}

Use these section IDs: ${PRD_SECTIONS.join(", ")}`;
}

// ── AI Assist Prompts ────────────────────────────────────────────────

export function buildFindEvidencePrompt(selectedText: string, sectionContext: string): string {
  return `A product manager is editing a PRD and has highlighted the following text, asking you to find supporting evidence for it.

Selected text: "${selectedText}"

Section context:
${sectionContext}

Search the evidence and return relevant supporting data. Format as a brief list of evidence points with their IDs that could be cited to support this claim. If no evidence exists, say so explicitly and suggest what data would be needed.

Return as JSON:
{
  "evidence_found": [
    { "id": "<evidence_id>", "type": "<insight|feedback|competitive|jtbd>", "relevance": "<brief explanation>", "quote": "<relevant quote if available>" }
  ],
  "suggestion": "<what to do if no evidence found>"
}`;
}

export function buildChallengePrompt(selectedText: string, sectionContext: string): string {
  return `A product manager is editing a PRD and wants to challenge/stress-test the following claim.

Selected text: "${selectedText}"

Section context:
${sectionContext}

Act as a critical reviewer. Identify:
1. What assumptions does this claim make?
2. What counter-evidence exists (or might exist)?
3. What would need to be true for this to be wrong?
4. What risks does this create?

Be specific and constructive. If there IS counter-evidence in the data, cite it with [Evidence: id].

Return as JSON:
{
  "assumptions": ["<assumption 1>", "..."],
  "counter_evidence": [{ "id": "<evidence_id>", "point": "<how it contradicts>" }],
  "risks": ["<risk 1>", "..."],
  "recommendation": "<what to do about it>"
}`;
}

export function buildExpandPrompt(selectedText: string, sectionContext: string): string {
  return `A product manager wants to expand this section of their PRD with more detail.

Selected text: "${selectedText}"

Section context:
${sectionContext}

Generate expanded content that:
- Adds more specific detail and nuance
- Includes [Evidence: id] citations where relevant
- Marks uncited claims as [ASSUMPTION - needs validation]
- Maintains the same voice and style

Return the expanded text as plain markdown (not JSON).`;
}

export function buildSimplifyPrompt(
  selectedText: string,
  audience: string = "executive stakeholder",
): string {
  return `Rewrite the following PRD section for a ${audience} audience. Make it concise, clear, and focused on business impact. Remove jargon and technical detail unless essential.

Original text:
${selectedText}

Preserve all [Evidence: id] citations but make the surrounding text simpler. Return the simplified text as plain markdown (not JSON).`;
}
