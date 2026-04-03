import {
  buildScoringModel,
  predictOutcome,
  type InsightAttributes,
  type OutcomeRecord,
} from "@pm-yc/ai";
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
const jtbdQueue = new Queue("jtbd-extraction", { connection: redis });

// ── Schemas ────────────────────────────────────────────────────────────

const jtbdQuerySchema = z.object({
  themeId: z.string().optional(),
  jobType: z.enum(["MAIN", "RELATED", "EMOTIONAL", "SOCIAL"]).optional(),
  minOpportunityScore: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const featureOutcomeSchema = z.object({
  featureName: z.string().min(1),
  description: z.string().optional(),
  impactScore: z.number(),
  linkedInsightIds: z.array(z.string()).default([]),
  metricChanges: z.record(z.number()).default({}),
  shippedAt: z.string().datetime(),
});

// ── GET /projects/:projectId/jtbds ──────────────────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/jtbds",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const query = jtbdQuerySchema.parse(req.query);

      const where = {
        projectId,
        ...(query.themeId ? { themeId: query.themeId } : {}),
        ...(query.jobType ? { jobType: query.jobType } : {}),
        ...(query.minOpportunityScore
          ? { opportunityScore: { gte: query.minOpportunityScore } }
          : {}),
      };

      const [jtbds, total] = await Promise.all([
        db.jTBD.findMany({
          where,
          orderBy: { opportunityScore: "desc" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: { theme: { select: { id: true, title: true } } },
        }),
        db.jTBD.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          jtbds,
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
      const message = err instanceof Error ? err.message : "Failed to fetch JTBDs";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /projects/:projectId/jtbds/opportunity-map ──────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/jtbds/opportunity-map",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;

      const jtbds = await db.jTBD.findMany({
        where: { projectId },
        select: {
          id: true,
          statement: true,
          jobType: true,
          importance: true,
          satisfaction: true,
          opportunityScore: true,
          theme: { select: { title: true } },
        },
        orderBy: { opportunityScore: "desc" },
      });

      res.json({
        success: true,
        data: {
          points: jtbds.map((j) => ({
            id: j.id,
            statement: j.statement,
            jobType: j.jobType,
            importance: j.importance,
            satisfaction: j.satisfaction,
            opportunityScore: j.opportunityScore,
            themeTitle: j.theme?.title ?? null,
          })),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch opportunity map";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/jtbds/extract ─────────────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/jtbds/extract",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const { themeId } = req.body as { themeId?: string };

      const job = await jtbdQueue.add("extract", { projectId, themeId });
      res.json({ success: true, data: { message: "JTBD extraction enqueued", jobId: job.id } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to trigger JTBD extraction";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/feature-outcomes ──────────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/feature-outcomes",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const data = featureOutcomeSchema.parse(req.body);

      const outcome = await db.featureOutcome.create({
        data: {
          projectId,
          featureName: data.featureName,
          description: data.description,
          impactScore: data.impactScore,
          linkedInsights: data.linkedInsightIds,
          metricChanges: data.metricChanges,
          shippedAt: new Date(data.shippedAt),
        },
      });

      res.status(201).json({ success: true, data: outcome });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to create feature outcome";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /projects/:projectId/feature-outcomes ───────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/feature-outcomes",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;

      const outcomes = await db.featureOutcome.findMany({
        where: { projectId },
        orderBy: { shippedAt: "desc" },
      });

      res.json({ success: true, data: { outcomes } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch feature outcomes";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /projects/:projectId/insights/:insightId/prediction ─────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/insights/:insightId/prediction",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const insightId = req.params.insightId as string;

      // Load the insight
      const insight = await db.insight.findUnique({
        where: { id: insightId },
        include: {
          insightEvidence: {
            select: { feedbackItem: { select: { segmentTags: true, dataSourceId: true } } },
          },
        },
      });

      if (!insight || insight.projectId !== projectId) {
        res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message: "Insight not found" } });
        return;
      }

      // Build insight attributes
      const uniqueSegments = new Set(
        insight.insightEvidence.flatMap((e) => e.feedbackItem.segmentTags),
      );
      const uniqueSources = new Set(
        insight.insightEvidence.map((e) => e.feedbackItem.dataSourceId).filter(Boolean),
      );

      const attributes: InsightAttributes = {
        type: insight.type,
        severityScore: insight.severityScore,
        frequencyCount: insight.frequencyCount,
        segmentCount: uniqueSegments.size,
        sourceCount: uniqueSources.size,
        trendDirection: insight.trend,
      };

      // Load historical outcomes to build model
      const outcomes = await db.featureOutcome.findMany({
        where: { projectId },
        select: { impactScore: true, linkedInsights: true },
      });

      const outcomeRecords: OutcomeRecord[] = [];
      for (const outcome of outcomes) {
        const linkedIds = outcome.linkedInsights as string[];
        if (!Array.isArray(linkedIds) || linkedIds.length === 0) continue;

        const linkedInsights = await db.insight.findMany({
          where: { id: { in: linkedIds } },
          include: {
            insightEvidence: {
              select: { feedbackItem: { select: { segmentTags: true, dataSourceId: true } } },
            },
          },
        });

        const insightAttrs: InsightAttributes[] = linkedInsights.map((li) => {
          const segs = new Set(li.insightEvidence.flatMap((e) => e.feedbackItem.segmentTags));
          const srcs = new Set(
            li.insightEvidence.map((e) => e.feedbackItem.dataSourceId).filter(Boolean),
          );
          return {
            type: li.type,
            severityScore: li.severityScore,
            frequencyCount: li.frequencyCount,
            segmentCount: segs.size,
            sourceCount: srcs.size,
            trendDirection: li.trend,
          };
        });

        outcomeRecords.push({ impactScore: outcome.impactScore, insightAttributes: insightAttrs });
      }

      const model = buildScoringModel(outcomeRecords);
      const prediction = predictOutcome(model, attributes);

      res.json({ success: true, data: { prediction, modelSampleSize: model.sampleSize } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get prediction";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

export default router;
