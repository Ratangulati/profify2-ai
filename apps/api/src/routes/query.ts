import {
  createProvider,
  parseQueryIntent,
  generateQueryResponse,
  type AssembledEvidence,
  type EvidenceInsight,
  type EvidenceOpportunity,
  type EvidenceTheme,
  type QueryEvidenceCompetitor,
} from "@pm-yc/ai";
import { db } from "@pm-yc/db";
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";

import { env } from "../env.js";
import { authenticate } from "../middleware/auth.js";
import { enforceWorkspace, requireRole } from "../middleware/workspace.js";

const router = Router();

const querySchema = z.object({
  question: z.string().min(3).max(500),
});

// ── POST /projects/:projectId/query ─────────────────────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/query",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const { question } = querySchema.parse(req.body);

      const provider = createProvider({ type: "openai", apiKey: env.OPENAI_API_KEY });

      // 1. Parse intent
      const parsed = await parseQueryIntent(provider, question);

      // 2. Assemble evidence based on intent
      const evidence = await assembleEvidence(projectId, parsed.intent, {
        segments: parsed.segments,
        featureArea: parsed.featureArea,
        competitor: parsed.competitor,
      });

      // 3. Generate response
      const response = await generateQueryResponse(provider, question, evidence);

      res.json({ success: true, data: { intent: parsed, response } });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to process query";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

export default router;

// ── Evidence assembly ──────────────────────────────────────────────────

async function assembleEvidence(
  projectId: string,
  intent: string,
  filters: { segments: string[]; featureArea: string | null; competitor: string | null },
): Promise<AssembledEvidence> {
  // Build segment filter if applicable
  const segmentFilter =
    filters.segments.length > 0 ? { segmentTags: { hasSome: filters.segments } } : {};

  // Fetch insights
  const insightWhere: Record<string, unknown> = { projectId };
  if (intent === "pain_exploration") {
    insightWhere.type = { in: ["PAIN_POINT", "OBSERVATION"] };
  }

  const insights = await db.insight.findMany({
    where: insightWhere,
    orderBy: { severityScore: "desc" },
    take: 20,
    include: {
      insightEvidence: {
        take: 3,
        select: { quote: true },
      },
    },
  });

  const evidenceInsights: EvidenceInsight[] = insights.map((i) => ({
    id: i.id,
    title: i.title,
    type: i.type,
    severityScore: i.severityScore,
    frequencyCount: i.frequencyCount,
    trend: i.trend,
    topQuotes: i.insightEvidence.map((e) => e.quote),
  }));

  // Fetch opportunities
  const opportunities = await db.opportunity.findMany({
    where: { projectId },
    orderBy: { riceScore: "desc" },
    take: 10,
    include: {
      _count: { select: { linkedInsights: true } },
    },
  });

  const evidenceOpps: EvidenceOpportunity[] = opportunities.map((o) => ({
    id: o.id,
    title: o.title,
    riceScore: o.riceScore,
    linkedInsightCount: o._count.linkedInsights,
  }));

  // Fetch themes
  const themes = await db.theme.findMany({
    where: { projectId },
    orderBy: { feedbackCount: "desc" },
    take: 10,
    select: { id: true, title: true, feedbackCount: true },
  });

  const evidenceThemes: EvidenceTheme[] = themes.map((t) => ({
    id: t.id,
    title: t.title,
    feedbackCount: t.feedbackCount,
  }));

  // Fetch competitive intel if relevant
  let evidenceCompetitors: QueryEvidenceCompetitor[] = [];
  if (intent === "competitive" || filters.competitor) {
    const compWhere: Record<string, unknown> = { projectId };
    if (filters.competitor) {
      const comp = await db.competitor.findFirst({
        where: { projectId, name: { contains: filters.competitor, mode: "insensitive" } },
      });
      if (comp) compWhere.competitorId = comp.id;
    }

    const competitors = await db.competitor.findMany({
      where: { projectId },
      include: {
        mentions: {
          select: { comparisonType: true, featureArea: true, switchingSignal: true },
        },
      },
    });

    evidenceCompetitors = competitors.map((c) => ({
      name: c.name,
      favorableCount: c.mentions.filter((m) => m.comparisonType === "FAVORABLE").length,
      unfavorableCount: c.mentions.filter((m) => m.comparisonType === "UNFAVORABLE").length,
      switchingSignals: c.mentions.filter((m) => m.switchingSignal).length,
      topFeatureAreas: [
        ...new Set(c.mentions.map((m) => m.featureArea).filter(Boolean) as string[]),
      ].slice(0, 5),
    }));
  }

  const totalFeedback = await db.feedbackItem.count({ where: { projectId } });

  return {
    query: {
      intent: intent as "build_recommendation",
      segments: filters.segments,
      featureArea: filters.featureArea,
      competitor: filters.competitor,
      constraints: [],
      rawQuery: "",
    },
    insights: evidenceInsights,
    opportunities: evidenceOpps,
    themes: evidenceThemes,
    competitors: evidenceCompetitors,
    totalFeedbackItems: totalFeedback,
  };
}
