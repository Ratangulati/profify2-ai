import { db, Prisma } from "@pm-yc/db";
import { Queue } from "bullmq";
import { Router } from "express";
import type { Request, Response } from "express";
import IORedis from "ioredis";
import { z } from "zod";

import { env } from "../env.js";
import { authenticate } from "../middleware/auth.js";
import { enforceWorkspace, requireRole } from "../middleware/workspace.js";

const router = Router();

const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
const insightQueue = new Queue("insight-generation", { connection: redis });

// ── Query validation ───────────────────────────────────────────────────

const insightListQuerySchema = z.object({
  type: z.enum(["PAIN_POINT", "DESIRE", "OBSERVATION", "TREND", "OPPORTUNITY"]).optional(),
  trend: z.enum(["INCREASING", "STABLE", "DECREASING"]).optional(),
  minSeverity: z.coerce.number().min(0).max(5).optional(),
  segment: z.string().optional(),
  sortBy: z.enum(["frequency", "severity", "createdAt"]).default("frequency"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── GET /projects/:projectId/insights ──────────────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/insights",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const query = insightListQuerySchema.parse(req.query);
      const projectId = req.params.projectId as string;

      const where: Prisma.InsightWhereInput = { projectId };
      if (query.type) where.type = query.type;
      if (query.trend) where.trend = query.trend;
      if (query.minSeverity != null) where.severityScore = { gte: query.minSeverity };
      if (query.segment) {
        // Filter by segment: insights whose segmentDistribution JSON contains this key
        where.segmentDistribution = {
          path: [query.segment],
          not: Prisma.JsonNull,
        };
      }

      const orderByMap: Record<string, Prisma.InsightOrderByWithRelationInput> = {
        frequency: { frequencyCount: query.sortOrder },
        severity: { severityScore: query.sortOrder },
        createdAt: { createdAt: query.sortOrder },
      };

      const [insights, total] = await Promise.all([
        db.insight.findMany({
          where,
          orderBy: orderByMap[query.sortBy],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: {
            id: true,
            title: true,
            description: true,
            type: true,
            severityScore: true,
            frequencyCount: true,
            trend: true,
            segmentDistribution: true,
            affectedWorkflow: true,
            inferredJtbd: true,
            themeId: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { insightEvidence: true } },
          },
        }),
        db.insight.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          insights,
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
      const message = err instanceof Error ? err.message : "Failed to list insights";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /insights/:insightId ───────────────────────────────────────────

router.get(
  "/workspaces/:workspaceId/insights/:insightId",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const insightId = req.params.insightId as string;

      const insight = await db.insight.findUnique({
        where: { id: insightId },
        include: {
          theme: { select: { id: true, title: true, color: true } },
          insightEvidence: {
            include: {
              feedbackItem: {
                select: {
                  id: true,
                  content: true,
                  customerName: true,
                  customerEmail: true,
                  segmentTags: true,
                  sourceUrl: true,
                  createdAt: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!insight) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Insight not found" },
        });
        return;
      }

      res.json({ success: true, data: insight });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get insight";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/insights/extract ─────────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/insights/extract",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const { feedbackItemIds } = req.body as { feedbackItemIds?: string[] };

      // Check how many unprocessed items exist
      const unprocessedCount = await db.feedbackItem.count({
        where: {
          projectId,
          ...(feedbackItemIds ? { id: { in: feedbackItemIds } } : { processedForInsights: false }),
        },
      });

      if (unprocessedCount === 0) {
        res.json({
          success: true,
          data: { message: "No unprocessed feedback items to extract from", jobId: null },
        });
        return;
      }

      const job = await insightQueue.add("extract", {
        projectId,
        feedbackItemIds,
      });

      res.json({
        success: true,
        data: {
          message: `Extraction enqueued for ${unprocessedCount} feedback items`,
          jobId: job.id,
          unprocessedCount,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to trigger extraction";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

export default router;
