import { handleAIAssist, type AIAssistCommand } from "@pm-yc/ai";
import { createProvider } from "@pm-yc/ai";
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
const prdQueue = new Queue("prd-generation", { connection: redis });

// ── Schemas ──────────────────────────────────────────────────────────

const specQuerySchema = z.object({
  type: z.enum(["PRD", "ONE_PAGER", "USER_STORY", "RFC", "DESIGN_DOC"]).optional(),
  status: z.enum(["DRAFT", "REVIEW", "APPROVED", "ARCHIVED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const generatePRDSchema = z.object({
  opportunityId: z.string().min(1),
  insightIds: z.array(z.string()).optional(),
});

const updateSpecSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(["DRAFT", "REVIEW", "APPROVED", "ARCHIVED"]).optional(),
  content: z.record(z.unknown()).optional(),
  changeNote: z.string().optional(),
});

const aiAssistSchema = z.object({
  command: z.enum(["find_evidence", "challenge", "expand", "simplify"]),
  selectedText: z.string().min(1),
  sectionContext: z.string(),
  fullPRDContext: z.string().optional(),
});

// ── GET /projects/:projectId/specs ───────────────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/specs",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const query = specQuerySchema.parse(req.query);

      const where = {
        projectId,
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
      };

      const [specs, total] = await Promise.all([
        db.spec.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: {
            _count: {
              select: { evidence: true, comments: true, versions: true, assumptions: true },
            },
          },
        }),
        db.spec.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          specs,
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
      const message = err instanceof Error ? err.message : "Failed to fetch specs";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /specs/:specId ───────────────────────────────────────────────

router.get(
  "/workspaces/:workspaceId/specs/:specId",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const specId = req.params.specId as string;

      const spec = await db.spec.findUnique({
        where: { id: specId },
        include: {
          evidence: {
            include: {
              insight: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                  severityScore: true,
                  description: true,
                },
              },
              feedbackItem: {
                select: {
                  id: true,
                  content: true,
                  customerName: true,
                  segmentTags: true,
                },
              },
            },
          },
          versions: {
            orderBy: { version: "desc" },
            take: 10,
          },
          comments: {
            include: {
              user: { select: { id: true, name: true, avatarUrl: true } },
            },
            orderBy: { createdAt: "desc" },
          },
          assumptions: {
            orderBy: { riskLevel: "desc" },
          },
          project: { select: { workspaceId: true } },
        },
      });

      if (!spec || spec.project.workspaceId !== req.workspaceId) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Spec not found" },
        });
        return;
      }

      res.json({ success: true, data: spec });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch spec";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /projects/:projectId/specs/generate-prd ─────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/specs/generate-prd",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const data = generatePRDSchema.parse(req.body);

      // Verify opportunity belongs to this project
      const opp = await db.opportunity.findUnique({
        where: { id: data.opportunityId },
        select: { projectId: true, title: true },
      });

      if (!opp || opp.projectId !== projectId) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Opportunity not found" },
        });
        return;
      }

      const job = await prdQueue.add("generate", {
        projectId,
        opportunityId: data.opportunityId,
        insightIds: data.insightIds,
      });

      res.json({
        success: true,
        data: {
          message: `PRD generation started for "${opp.title}"`,
          jobId: job.id,
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
      const message = err instanceof Error ? err.message : "Failed to start PRD generation";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── PATCH /specs/:specId ─────────────────────────────────────────────

router.patch(
  "/workspaces/:workspaceId/specs/:specId",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const specId = req.params.specId as string;
      const data = updateSpecSchema.parse(req.body);

      // Verify spec belongs to workspace
      const existing = await db.spec.findUnique({
        where: { id: specId },
        include: {
          project: { select: { workspaceId: true } },
          versions: { orderBy: { version: "desc" }, take: 1 },
        },
      });

      if (!existing || existing.project.workspaceId !== req.workspaceId) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Spec not found" },
        });
        return;
      }

      // Update spec
      const updateData: {
        title?: string;
        status?: "DRAFT" | "REVIEW" | "APPROVED" | "ARCHIVED";
        content?: Prisma.InputJsonValue;
      } = {};
      if (data.title !== undefined) updateData.title = data.title;
      if (data.status !== undefined)
        updateData.status = data.status as "DRAFT" | "REVIEW" | "APPROVED" | "ARCHIVED";
      if (data.content !== undefined) updateData.content = data.content as Prisma.InputJsonValue;

      const updated = await db.spec.update({
        where: { id: specId },
        data: updateData,
      });

      // Create new version if content changed
      if (data.content !== undefined) {
        const nextVersion = (existing.versions[0]?.version ?? 0) + 1;
        await db.specVersion.create({
          data: {
            specId,
            version: nextVersion,
            content: data.content as Prisma.InputJsonValue,
            changeNote: data.changeNote ?? null,
          },
        });
      }

      res.json({ success: true, data: updated });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to update spec";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /specs/:specId/versions/:version ─────────────────────────────

router.get(
  "/workspaces/:workspaceId/specs/:specId/versions/:version",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const specId = req.params.specId as string;
      const version = parseInt(req.params.version as string);

      const specVersion = await db.specVersion.findUnique({
        where: { specId_version: { specId, version } },
      });

      if (!specVersion) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Version not found" },
        });
        return;
      }

      // Also load citations for this version
      const evidence = await db.specEvidence.findMany({
        where: { specId, versionNum: version },
        include: {
          insight: {
            select: { id: true, title: true, type: true, description: true },
          },
          feedbackItem: {
            select: { id: true, content: true, customerName: true },
          },
        },
      });

      res.json({ success: true, data: { ...specVersion, evidence } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch version";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /specs/:specId/ai-assist ────────────────────────────────────

router.post(
  "/workspaces/:workspaceId/specs/:specId/ai-assist",
  authenticate,
  enforceWorkspace,
  requireRole("project", "manage"),
  async (req: Request, res: Response) => {
    try {
      const data = aiAssistSchema.parse(req.body);

      const provider = createProvider({
        type: "openai",
        apiKey: env.OPENAI_API_KEY,
      });

      const result = await handleAIAssist(provider, {
        command: data.command as AIAssistCommand,
        selectedText: data.selectedText,
        sectionContext: data.sectionContext,
        fullPRDContext: data.fullPRDContext,
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
      const message = err instanceof Error ? err.message : "Failed to process AI assist";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

export default router;
