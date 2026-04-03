import { createProvider, generateCompetitiveBrief, type CompetitiveDataSummary } from "@pm-yc/ai";
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
const competitiveQueue = new Queue("competitive-extraction", { connection: redis });

// ── Schemas ────────────────────────────────────────────────────────────

const competitorCreateSchema = z.object({
  name: z.string().min(1).max(100),
  aliases: z.array(z.string()).default([]),
  description: z.string().optional(),
  websiteUrl: z.string().url().optional(),
});

const mentionQuerySchema = z.object({
  competitorId: z.string().optional(),
  comparisonType: z.enum(["FAVORABLE", "UNFAVORABLE", "NEUTRAL"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ── GET /projects/:projectId/competitors ────────────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/competitors",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;

      const competitors = await db.competitor.findMany({
        where: { projectId },
        orderBy: { name: "asc" },
        include: {
          _count: { select: { mentions: true } },
        },
      });

      res.json({ success: true, data: { competitors } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch competitors";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/competitors ───────────────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/competitors",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const data = competitorCreateSchema.parse(req.body);

      const competitor = await db.competitor.create({
        data: { projectId, ...data },
      });

      res.status(201).json({ success: true, data: competitor });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to create competitor";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── DELETE /projects/:projectId/competitors/:competitorId ───────────────

router.delete(
  "/workspaces/:workspaceId/projects/:projectId/competitors/:competitorId",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const competitorId = req.params.competitorId as string;
      await db.competitor.delete({ where: { id: competitorId } });
      res.json({ success: true, data: { message: "Competitor deleted" } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete competitor";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /projects/:projectId/competitors/mentions ───────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/competitors/mentions",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const query = mentionQuerySchema.parse(req.query);

      const where = {
        projectId,
        ...(query.competitorId ? { competitorId: query.competitorId } : {}),
        ...(query.comparisonType ? { comparisonType: query.comparisonType } : {}),
      };

      const [mentions, total] = await Promise.all([
        db.competitorMention.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: {
            competitor: { select: { id: true, name: true } },
            feedbackItem: {
              select: { id: true, content: true, customerName: true, segmentTags: true },
            },
          },
        }),
        db.competitorMention.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          mentions,
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
      const message = err instanceof Error ? err.message : "Failed to fetch mentions";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /projects/:projectId/competitors/:competitorId/dashboard ────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/competitors/:competitorId/dashboard",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const competitorId = req.params.competitorId as string;

      const competitor = await db.competitor.findUnique({
        where: { id: competitorId },
        select: { id: true, name: true },
      });
      if (!competitor) {
        res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message: "Competitor not found" } });
        return;
      }

      const mentions = await db.competitorMention.findMany({
        where: { projectId, competitorId },
        select: {
          comparisonType: true,
          featureArea: true,
          specificAdvantage: true,
          switchingSignal: true,
          verbatimQuote: true,
          createdAt: true,
          feedbackItem: { select: { segmentTags: true } },
        },
      });

      const favorableCount = mentions.filter((m) => m.comparisonType === "FAVORABLE").length;
      const unfavorableCount = mentions.filter((m) => m.comparisonType === "UNFAVORABLE").length;
      const neutralCount = mentions.filter((m) => m.comparisonType === "NEUTRAL").length;
      const switchingSignals = mentions.filter((m) => m.switchingSignal).length;

      // Feature area breakdown
      const featureMap = new Map<
        string,
        { favorable: number; unfavorable: number; advantages: string[] }
      >();
      for (const m of mentions) {
        if (!m.featureArea) continue;
        const existing = featureMap.get(m.featureArea) ?? {
          favorable: 0,
          unfavorable: 0,
          advantages: [],
        };
        if (m.comparisonType === "FAVORABLE") existing.favorable++;
        if (m.comparisonType === "UNFAVORABLE") existing.unfavorable++;
        if (m.specificAdvantage && existing.advantages.length < 3)
          existing.advantages.push(m.specificAdvantage);
        featureMap.set(m.featureArea, existing);
      }

      const featureAreas = Array.from(featureMap.entries()).map(([area, data]) => ({
        area,
        ...data,
      }));

      // Switching risk by segment
      const switchingBySegment = new Map<string, number>();
      for (const m of mentions) {
        if (!m.switchingSignal) continue;
        for (const tag of m.feedbackItem.segmentTags) {
          switchingBySegment.set(tag, (switchingBySegment.get(tag) ?? 0) + 1);
        }
      }

      res.json({
        success: true,
        data: {
          competitor: competitor.name,
          totalMentions: mentions.length,
          favorableCount,
          unfavorableCount,
          neutralCount,
          switchingSignals,
          featureAreas,
          switchingBySegment: Object.fromEntries(switchingBySegment),
          recentQuotes: mentions.slice(0, 10).map((m) => m.verbatimQuote),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch dashboard";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/competitors/scan ──────────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/competitors/scan",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const job = await competitiveQueue.add("scan", { projectId });
      res.json({ success: true, data: { message: "Competitive scan enqueued", jobId: job.id } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to trigger competitive scan";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/competitors/:competitorId/brief ───────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/competitors/:competitorId/brief",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const competitorId = req.params.competitorId as string;
      const { featureArea } = req.body as { featureArea?: string };

      const competitor = await db.competitor.findUnique({ where: { id: competitorId } });
      if (!competitor) {
        res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message: "Competitor not found" } });
        return;
      }

      const mentions = await db.competitorMention.findMany({
        where: { projectId, competitorId },
        select: {
          comparisonType: true,
          featureArea: true,
          specificAdvantage: true,
          switchingSignal: true,
          verbatimQuote: true,
        },
      });

      // Build summary
      const featureMap = new Map<
        string,
        { favorable: number; unfavorable: number; advantages: string[] }
      >();
      for (const m of mentions) {
        if (!m.featureArea) continue;
        const existing = featureMap.get(m.featureArea) ?? {
          favorable: 0,
          unfavorable: 0,
          advantages: [],
        };
        if (m.comparisonType === "FAVORABLE") existing.favorable++;
        if (m.comparisonType === "UNFAVORABLE") existing.unfavorable++;
        if (m.specificAdvantage) existing.advantages.push(m.specificAdvantage);
        featureMap.set(m.featureArea, existing);
      }

      const summary: CompetitiveDataSummary = {
        competitorName: competitor.name,
        totalMentions: mentions.length,
        favorableCount: mentions.filter((m) => m.comparisonType === "FAVORABLE").length,
        unfavorableCount: mentions.filter((m) => m.comparisonType === "UNFAVORABLE").length,
        neutralCount: mentions.filter((m) => m.comparisonType === "NEUTRAL").length,
        switchingSignals: mentions.filter((m) => m.switchingSignal).length,
        featureAreas: Array.from(featureMap.entries()).map(([area, data]) => ({ area, ...data })),
        recentQuotes: mentions.map((m) => m.verbatimQuote),
      };

      const provider = createProvider({ type: "openai", apiKey: env.OPENAI_API_KEY });
      const brief = await generateCompetitiveBrief(provider, summary, featureArea);

      res.json({ success: true, data: brief });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate brief";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

export default router;
