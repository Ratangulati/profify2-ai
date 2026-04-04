import { db } from "@pm-yc/db";

/**
 * Load insights linked to a spec via SpecEvidence, including quotes.
 */
export async function loadSpecInsightsWithQuotes(specId: string) {
  const evidence = await db.specEvidence.findMany({
    where: { specId, insightId: { not: null } },
    include: {
      insight: {
        include: {
          insightEvidence: {
            take: 5,
            select: { quote: true },
          },
        },
      },
    },
  });

  return evidence
    .filter((e) => e.insight !== null)
    .map((e) => ({
      id: e.insight!.id,
      title: e.insight!.title,
      type: e.insight!.type,
      severityScore: e.insight!.severityScore,
      description: e.insight!.description,
      quotes: e.insight!.insightEvidence.map((ie) => ie.quote),
    }));
}

/**
 * Load insights linked to an opportunity, including quotes.
 */
export async function loadOpportunityInsightsWithQuotes(opportunityId: string) {
  const links = await db.opportunityInsight.findMany({
    where: { opportunityId },
    include: {
      insight: {
        include: {
          insightEvidence: {
            take: 5,
            select: { quote: true },
          },
        },
      },
    },
  });

  return links.map((l) => ({
    id: l.insight.id,
    title: l.insight.title,
    type: l.insight.type,
    severityScore: l.insight.severityScore,
    quotes: l.insight.insightEvidence.map((ie) => ie.quote),
  }));
}

/**
 * Count feedback items linked to an opportunity's insights.
 */
export async function countOpportunityFeedback(opportunityId: string): Promise<number> {
  const links = await db.opportunityInsight.findMany({
    where: { opportunityId },
    select: { insightId: true },
  });

  if (links.length === 0) return 0;

  const insightIds = links.map((l) => l.insightId);
  return db.insightEvidence.count({
    where: { insightId: { in: insightIds } },
  });
}

/**
 * Load decisions related to a project, optionally filtered by text.
 */
export async function loadDecisions(
  projectId: string,
  opts?: { query?: string; featureArea?: string; limit?: number },
) {
  const limit = Math.min(opts?.limit ?? 10, 30);
  const where: Record<string, unknown> = { projectId };

  if (opts?.query) {
    where.OR = [
      { title: { contains: opts.query, mode: "insensitive" } },
      { rationale: { contains: opts.query, mode: "insensitive" } },
    ];
  } else if (opts?.featureArea) {
    where.title = { contains: opts.featureArea, mode: "insensitive" };
  }

  return db.decision.findMany({
    where,
    orderBy: [{ decidedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      decisionEvidence: {
        include: {
          insight: {
            select: { id: true, title: true, type: true },
          },
        },
      },
    },
  });
}
