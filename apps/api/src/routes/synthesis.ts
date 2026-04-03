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
const contradictionQueue = new Queue("contradiction-detection", { connection: redis });
const assumptionQueue = new Queue("assumption-surfacing", { connection: redis });

// ── Query schemas ──────────────────────────────────────────────────────

const contradictionQuerySchema = z.object({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const assumptionQuerySchema = z.object({
  specId: z.string().optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  validationStatus: z
    .enum(["UNVALIDATED", "VALIDATED", "INVALIDATED", "PARTIALLY_VALIDATED"])
    .optional(),
  category: z
    .enum(["USER_BEHAVIOR", "TECHNICAL", "MARKET", "ADOPTION", "RESOURCE", "REGULATORY"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ── GET /projects/:projectId/contradictions ─────────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/contradictions",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const query = contradictionQuerySchema.parse(req.query);

      const where = {
        projectId,
        ...(query.status ? { status: query.status } : {}),
      };

      const [contradictions, total] = await Promise.all([
        db.contradiction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: {
            insightA: { select: { id: true, title: true, type: true, description: true } },
            insightB: { select: { id: true, title: true, type: true, description: true } },
          },
        }),
        db.contradiction.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          contradictions,
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
      const message = err instanceof Error ? err.message : "Failed to fetch contradictions";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/contradictions/:id/status ─────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/contradictions/:contradictionId/status",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const contradictionId = req.params.contradictionId as string;
      const { status } = z
        .object({ status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"]) })
        .parse(req.body);

      const updated = await db.contradiction.update({
        where: { id: contradictionId },
        data: { status },
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to update contradiction";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/contradictions/scan ───────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/contradictions/scan",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;

      const insightCount = await db.insight.count({ where: { projectId } });
      if (insightCount < 2) {
        res.json({
          success: true,
          data: { message: "Not enough insights to scan for contradictions", jobId: null },
        });
        return;
      }

      const job = await contradictionQueue.add("scan", { projectId });

      res.json({
        success: true,
        data: {
          message: `Contradiction scan enqueued for ${insightCount} insights`,
          jobId: job.id,
          insightCount,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to trigger contradiction scan";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /projects/:projectId/assumptions ────────────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/assumptions",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const query = assumptionQuerySchema.parse(req.query);

      const where = {
        projectId,
        ...(query.specId ? { specId: query.specId } : {}),
        ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
        ...(query.validationStatus ? { validationStatus: query.validationStatus } : {}),
        ...(query.category ? { category: query.category } : {}),
      };

      const [assumptions, total] = await Promise.all([
        db.assumption.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: {
            spec: { select: { id: true, title: true, type: true } },
          },
        }),
        db.assumption.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          assumptions,
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
      const message = err instanceof Error ? err.message : "Failed to fetch assumptions";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/assumptions/:id/validate ──────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/assumptions/:assumptionId/validate",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const assumptionId = req.params.assumptionId as string;
      const { validationStatus } = z
        .object({
          validationStatus: z.enum([
            "UNVALIDATED",
            "VALIDATED",
            "INVALIDATED",
            "PARTIALLY_VALIDATED",
          ]),
        })
        .parse(req.body);

      const updated = await db.assumption.update({
        where: { id: assumptionId },
        data: { validationStatus },
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to update assumption";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/specs/:specId/assumptions/surface ─────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/specs/:specId/assumptions/surface",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const specId = req.params.specId as string;

      const spec = await db.spec.findUnique({
        where: { id: specId },
        select: { id: true, projectId: true },
      });
      if (!spec || spec.projectId !== projectId) {
        res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message: "Spec not found" } });
        return;
      }

      const job = await assumptionQueue.add("surface", { projectId, specId });

      res.json({
        success: true,
        data: {
          message: "Assumption surfacing enqueued",
          jobId: job.id,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to trigger assumption surfacing";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

export default router;
