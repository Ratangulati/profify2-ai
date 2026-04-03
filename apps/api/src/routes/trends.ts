import { db } from "@pm-yc/db";
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
const sentimentQueue = new Queue("sentiment-analysis", { connection: redis });
const trendQueue = new Queue("trend-aggregation", { connection: redis });
const spikeQueue = new Queue("spike-detection", { connection: redis });

// ── Query schemas ──────────────────────────────────────────────────────

const trendQuerySchema = z.object({
  entityType: z.enum(["project", "theme", "insight"]).default("project"),
  entityId: z.string().optional(),
  metric: z.enum(["volume", "avg_sentiment", "source_distribution"]).default("volume"),
  weeks: z.coerce.number().int().min(1).max(52).default(12),
});

const alertQuerySchema = z.object({
  status: z.enum(["PENDING", "DELIVERED", "RESOLVED", "DISMISSED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ── GET /projects/:projectId/trends ────────────────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/trends",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const query = trendQuerySchema.parse(req.query);

      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - query.weeks * 7);

      const entityId = query.entityId ?? projectId;

      const dataPoints = await db.trendDataPoint.findMany({
        where: {
          projectId,
          entityType: query.entityType,
          entityId,
          metric: query.metric,
          period: { gte: cutoff },
        },
        orderBy: { period: "asc" },
        select: {
          period: true,
          value: true,
          metadata: true,
        },
      });

      res.json({
        success: true,
        data: {
          entityType: query.entityType,
          entityId,
          metric: query.metric,
          dataPoints: dataPoints.map((dp) => ({
            period: dp.period.toISOString(),
            value: dp.value,
            metadata: dp.metadata,
          })),
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
      const message = err instanceof Error ? err.message : "Failed to fetch trends";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /projects/:projectId/alerts ────────────────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/alerts",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const query = alertQuerySchema.parse(req.query);

      const where = {
        projectId,
        ...(query.status ? { status: query.status } : {}),
      };

      const [alerts, total] = await Promise.all([
        db.spikeAlert.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        db.spikeAlert.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          alerts,
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
      const message = err instanceof Error ? err.message : "Failed to fetch alerts";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/alerts/:alertId/dismiss ──────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/alerts/:alertId/dismiss",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const alertId = req.params.alertId as string;

      await db.spikeAlert.update({
        where: { id: alertId },
        data: { status: "DISMISSED", resolvedAt: new Date() },
      });

      res.json({ success: true, data: { message: "Alert dismissed" } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to dismiss alert";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/sentiment/compute ────────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/sentiment/compute",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;

      const unprocessedCount = await db.feedbackItem.count({
        where: { projectId, sentimentProcessed: false },
      });

      if (unprocessedCount === 0) {
        res.json({
          success: true,
          data: { message: "No unprocessed feedback items", jobId: null },
        });
        return;
      }

      const job = await sentimentQueue.add("compute", { projectId });

      res.json({
        success: true,
        data: {
          message: `Sentiment analysis enqueued for ${unprocessedCount} items`,
          jobId: job.id,
          unprocessedCount,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to trigger sentiment analysis";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/trends/aggregate ─────────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/trends/aggregate",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const { weeks } = req.body as { weeks?: number };

      const job = await trendQueue.add("aggregate", { projectId, weeks });

      res.json({
        success: true,
        data: { message: "Trend aggregation enqueued", jobId: job.id },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to trigger trend aggregation";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/spikes/detect ────────────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/spikes/detect",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;

      const job = await spikeQueue.add("detect", { projectId });

      res.json({
        success: true,
        data: { message: "Spike detection enqueued", jobId: job.id },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to trigger spike detection";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

export default router;
