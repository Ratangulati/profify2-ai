import {
  computeAllScores,
  getConfidenceLevel,
  type OpportunityInput,
  type ScoringEvidenceItem,
  type ScoringConfig,
} from "@pm-yc/ai";
import { db } from "@pm-yc/db";
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { enforceWorkspace, requireRole } from "../middleware/workspace.js";

const router = Router();

// ── Schemas ──────────────────────────────────────────────────────────

const opportunityQuerySchema = z.object({
  status: z
    .enum([
      "IDENTIFIED",
      "EVALUATING",
      "PRIORITIZED",
      "IN_PROGRESS",
      "SHIPPED",
      "KILLED",
      "DEFERRED",
      "ARCHIVED",
    ])
    .optional(),
  sortBy: z
    .enum(["composite", "rice", "ice", "segmentWeighted", "manual", "createdAt"])
    .default("composite"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const patchOpportunitySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z
    .enum([
      "IDENTIFIED",
      "EVALUATING",
      "PRIORITIZED",
      "IN_PROGRESS",
      "SHIPPED",
      "KILLED",
      "DEFERRED",
      "ARCHIVED",
    ])
    .optional(),
  effortEstimate: z.number().int().min(1).max(5).optional(),
  strategicAlignment: z.number().min(0).max(1).optional(),
  manualRank: z.number().int().min(1).nullable().optional(),
});

const scoringConfigSchema = z.object({
  weights: z
    .object({
      frequency: z.number().min(0).max(1),
      severity: z.number().min(0).max(1),
      strategicAlignment: z.number().min(0).max(1),
      effortInverse: z.number().min(0).max(1),
    })
    .refine(
      (w) => Math.abs(w.frequency + w.severity + w.strategicAlignment + w.effortInverse - 1) < 0.01,
      { message: "Weights must sum to 1.0" },
    )
    .optional(),
  segmentMultipliers: z.record(z.number().min(0)).optional(),
  strategicBets: z
    .array(
      z.object({
        id: z.string().optional(),
        statement: z.string().min(1),
        weight: z.number().min(0).max(10).default(1),
        active: z.boolean().default(true),
      }),
    )
    .optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────

function getSortField(sortBy: string): string {
  switch (sortBy) {
    case "composite":
      return "compositeScore";
    case "rice":
      return "riceScore";
    case "ice":
      return "iceScore";
    case "segmentWeighted":
      return "segmentWeightedFreq";
    case "manual":
      return "manualRank";
    case "createdAt":
      return "createdAt";
    default:
      return "compositeScore";
  }
}

async function getOrCreateScoringConfig(projectId: string) {
  let config = await db.scoringConfig.findUnique({
    where: { projectId },
    include: { strategicBets: { where: { active: true } } },
  });

  if (!config) {
    config = await db.scoringConfig.create({
      data: { projectId },
      include: { strategicBets: { where: { active: true } } },
    });
  }

  return config;
}

function toScoringConfig(
  dbConfig: Awaited<ReturnType<typeof getOrCreateScoringConfig>>,
): ScoringConfig {
  return {
    weights: {
      frequency: dbConfig.weightFrequency,
      severity: dbConfig.weightSeverity,
      strategicAlignment: dbConfig.weightStrategicAlignment,
      effortInverse: dbConfig.weightEffortInverse,
    },
    segmentMultipliers: dbConfig.segmentMultipliers as Record<string, number>,
    strategicBets: dbConfig.strategicBets.map((b) => ({
      id: b.id,
      statement: b.statement,
      weight: b.weight,
    })),
  };
}

async function buildOpportunityInput(
  opportunityId: string,
): Promise<OpportunityInput & { evidenceCount: number }> {
  const opp = await db.opportunity.findUniqueOrThrow({
    where: { id: opportunityId },
    include: {
      linkedInsights: {
        include: {
          insight: {
            include: {
              insightEvidence: {
                include: {
                  feedbackItem: {
                    select: { ingestedAt: true, segmentTags: true, sentimentScore: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Collect evidence from all linked insights
  const evidence: ScoringEvidenceItem[] = [];
  for (const link of opp.linkedInsights) {
    const insight = link.insight;
    for (const ev of insight.insightEvidence) {
      evidence.push({
        ingestedAt: ev.feedbackItem.ingestedAt,
        severity: insight.severityScore,
        segmentTags: ev.feedbackItem.segmentTags,
      });
    }
  }

  return {
    id: opp.id,
    title: opp.title,
    description: opp.description,
    effortEstimate: opp.effortEstimate,
    strategicAlignment: opp.strategicAlignment,
    evidence,
    evidenceCount: evidence.length,
  };
}

async function recalculateOpportunity(opportunityId: string, config: ScoringConfig) {
  const input = await buildOpportunityInput(opportunityId);
  const scores = computeAllScores(input, config);

  await db.opportunity.update({
    where: { id: opportunityId },
    data: {
      frequencyScore: scores.composite.frequencyScore,
      severityScore: scores.composite.severityScore,
      compositeScore: scores.composite.compositeScore,
      riceReach: scores.rice.reach,
      riceImpact: scores.rice.impact,
      riceConfidence: scores.rice.confidence,
      riceEffort: scores.rice.effort,
      riceScore: scores.rice.riceScore,
      iceImpact: scores.ice.impact,
      iceConfidence: scores.ice.confidence,
      iceEase: scores.ice.ease,
      iceScore: scores.ice.iceScore,
      segmentWeightedFreq: scores.segmentWeighted.segmentWeightedFrequency,
    },
  });

  return { ...scores, evidenceCount: input.evidenceCount };
}

// ── GET /projects/:projectId/opportunities ───────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/opportunities",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const query = opportunityQuerySchema.parse(req.query);

      const where = {
        projectId,
        ...(query.status ? { status: query.status } : {}),
      };

      const sortField = getSortField(query.sortBy);

      const [opportunities, total] = await Promise.all([
        db.opportunity.findMany({
          where,
          orderBy:
            query.sortBy === "manual"
              ? [
                  { manualRank: query.sortOrder === "asc" ? "asc" : "desc" },
                  { compositeScore: "desc" },
                ]
              : { [sortField]: query.sortOrder },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: {
            linkedInsights: {
              include: {
                insight: {
                  select: {
                    id: true,
                    title: true,
                    type: true,
                    severityScore: true,
                    frequencyCount: true,
                  },
                },
              },
            },
            linkedThemes: {
              include: {
                theme: {
                  select: { id: true, title: true, color: true },
                },
              },
            },
            _count: { select: { linkedInsights: true, linkedThemes: true } },
          },
        }),
        db.opportunity.count({ where }),
      ]);

      // Compute confidence levels and attach to response
      const enriched = opportunities.map((opp) => {
        const evidenceCount = opp.linkedInsights.reduce(
          (sum, link) => sum + link.insight.frequencyCount,
          0,
        );

        return {
          ...opp,
          confidenceLevel: getConfidenceLevel(evidenceCount),
          evidenceCount,
        };
      });

      res.json({
        success: true,
        data: {
          opportunities: enriched,
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
          },
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to fetch opportunities";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── PATCH /opportunities/:opportunityId ──────────────────────────────

router.patch(
  "/workspaces/:workspaceId/opportunities/:opportunityId",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const opportunityId = req.params.opportunityId as string;
      const data = patchOpportunitySchema.parse(req.body);

      // Verify opportunity belongs to workspace
      const existing = await db.opportunity.findUnique({
        where: { id: opportunityId },
        include: { project: { select: { workspaceId: true } } },
      });

      if (!existing || existing.project.workspaceId !== req.workspaceId) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Opportunity not found" },
        });
        return;
      }

      const updated = await db.opportunity.update({
        where: { id: opportunityId },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.effortEstimate !== undefined ? { effortEstimate: data.effortEstimate } : {}),
          ...(data.strategicAlignment !== undefined
            ? { strategicAlignment: data.strategicAlignment }
            : {}),
          ...(data.manualRank !== undefined ? { manualRank: data.manualRank } : {}),
        },
      });

      // If effort or strategic alignment changed, recalculate scores
      if (data.effortEstimate !== undefined || data.strategicAlignment !== undefined) {
        const dbConfig = await getOrCreateScoringConfig(existing.projectId);
        const config = toScoringConfig(dbConfig);
        await recalculateOpportunity(opportunityId, config);
      }

      // Re-fetch with full data
      const result = await db.opportunity.findUnique({
        where: { id: opportunityId },
        include: {
          linkedInsights: {
            include: {
              insight: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                  severityScore: true,
                  frequencyCount: true,
                },
              },
            },
          },
          linkedThemes: {
            include: {
              theme: { select: { id: true, title: true, color: true } },
            },
          },
        },
      });

      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to update opportunity";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── PUT /projects/:projectId/scoring-config ──────────────────────────

router.put(
  "/workspaces/:workspaceId/projects/:projectId/scoring-config",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const data = scoringConfigSchema.parse(req.body);

      const dbConfig = await getOrCreateScoringConfig(projectId);

      // Update weights and multipliers
      const updated = await db.scoringConfig.update({
        where: { id: dbConfig.id },
        data: {
          ...(data.weights
            ? {
                weightFrequency: data.weights.frequency,
                weightSeverity: data.weights.severity,
                weightStrategicAlignment: data.weights.strategicAlignment,
                weightEffortInverse: data.weights.effortInverse,
              }
            : {}),
          ...(data.segmentMultipliers
            ? {
                segmentMultipliers: data.segmentMultipliers,
              }
            : {}),
        },
      });

      // Handle strategic bets
      if (data.strategicBets) {
        // Deactivate existing bets not in new list
        const existingIds = data.strategicBets.filter((b) => b.id).map((b) => b.id as string);

        await db.strategicBet.updateMany({
          where: {
            scoringConfigId: dbConfig.id,
            id: { notIn: existingIds },
          },
          data: { active: false },
        });

        // Upsert bets
        for (const bet of data.strategicBets) {
          if (bet.id) {
            await db.strategicBet.update({
              where: { id: bet.id },
              data: {
                statement: bet.statement,
                weight: bet.weight,
                active: bet.active,
              },
            });
          } else {
            await db.strategicBet.create({
              data: {
                scoringConfigId: dbConfig.id,
                statement: bet.statement,
                weight: bet.weight,
                active: bet.active,
              },
            });
          }
        }
      }

      // Return full config
      const result = await db.scoringConfig.findUnique({
        where: { id: dbConfig.id },
        include: { strategicBets: { where: { active: true } } },
      });

      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to update scoring config";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /projects/:projectId/scoring-config ──────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/scoring-config",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const dbConfig = await getOrCreateScoringConfig(projectId);

      res.json({ success: true, data: dbConfig });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch scoring config";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/opportunities/recalculate ──────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/opportunities/recalculate",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const dbConfig = await getOrCreateScoringConfig(projectId);
      const config = toScoringConfig(dbConfig);

      // Fetch all opportunities for this project
      const opportunities = await db.opportunity.findMany({
        where: { projectId },
        select: { id: true },
      });

      let recalculated = 0;
      const errors: string[] = [];

      for (const opp of opportunities) {
        try {
          await recalculateOpportunity(opp.id, config);
          recalculated++;
        } catch (err) {
          errors.push(`${opp.id}: ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }

      res.json({
        success: true,
        data: {
          total: opportunities.length,
          recalculated,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to recalculate scores";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

export default router;
