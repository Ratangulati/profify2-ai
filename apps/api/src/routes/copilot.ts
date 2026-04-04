import { db } from "@pm-yc/db";
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { enforceWorkspace, requireRole } from "../middleware/workspace.js";
import { streamCopilotResponse } from "../services/copilot/stream.js";

const router = Router();

// ── Schemas ───────────────────────────────────────────────────────────

const chatSchema = z.object({
  message: z.string().min(1).max(5000),
  mentions: z
    .array(
      z.object({
        type: z.enum(["spec", "insight", "theme", "decision"]),
        id: z.string(),
        title: z.string(),
      }),
    )
    .default([]),
  activeContext: z
    .object({
      specId: z.string().optional(),
      specTitle: z.string().optional(),
      sectionContent: z.string().max(5000).optional(),
    })
    .nullable()
    .default(null),
  threadId: z.string().nullable().default(null),
});

const feedbackSchema = z.object({
  feedback: z.enum(["POSITIVE", "NEGATIVE"]).nullable(),
});

const mentionSearchSchema = z.object({
  query: z.string().min(1).max(200),
  types: z
    .array(z.enum(["spec", "insight", "theme", "decision"]))
    .default(["spec", "insight", "theme", "decision"]),
});

// ── POST /copilot/chat (SSE streaming) ────────────────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/copilot/chat",
  authenticate,
  enforceWorkspace,
  requireRole("project", "update"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const parsed = chatSchema.parse(req.body);

      await streamCopilotResponse(
        {
          message: parsed.message,
          mentions: parsed.mentions,
          activeContext: parsed.activeContext,
          threadId: parsed.threadId,
          projectId,
        },
        res,
      );
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Copilot chat failed";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /copilot/threads ──────────────────────────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/copilot/threads",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;

      const threads = await db.copilotThread.findMany({
        where: { projectId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
      });

      res.json({
        success: true,
        data: {
          threads: threads.map((t) => ({
            id: t.id,
            title: t.title,
            messageCount: t._count.messages,
            updatedAt: t.updatedAt.toISOString(),
          })),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list threads";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /copilot/threads/:threadId/messages ───────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/copilot/threads/:threadId/messages",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const threadId = req.params.threadId as string;
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const before = req.query.before as string | undefined;

      const where: Record<string, unknown> = { threadId };
      if (before) {
        where.createdAt = { lt: new Date(before) };
      }

      const messages = await db.copilotMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        select: {
          id: true,
          role: true,
          content: true,
          mentions: true,
          toolTrace: true,
          citations: true,
          feedback: true,
          commandType: true,
          createdAt: true,
        },
      });

      const hasMore = messages.length > limit;
      const results = messages.slice(0, limit).reverse();

      res.json({
        success: true,
        data: {
          messages: results.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            mentions: m.mentions,
            toolTrace: m.toolTrace,
            citations: m.citations,
            feedback: m.feedback,
            commandType: m.commandType,
            createdAt: m.createdAt.toISOString(),
          })),
          hasMore,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load messages";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── PATCH /copilot/messages/:messageId/feedback ───────────────────────

router.patch(
  "/workspaces/:workspaceId/projects/:projectId/copilot/messages/:messageId/feedback",
  authenticate,
  enforceWorkspace,
  requireRole("project", "update"),
  async (req: Request, res: Response) => {
    try {
      const messageId = req.params.messageId as string;
      const { feedback } = feedbackSchema.parse(req.body);

      await db.copilotMessage.update({
        where: { id: messageId },
        data: { feedback },
      });

      res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to update feedback";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /copilot/mentions/search ─────────────────────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/copilot/mentions/search",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const { query, types } = mentionSearchSchema.parse(req.body);

      const results: Array<{ type: string; id: string; title: string }> = [];

      const searches = types.map(async (type) => {
        switch (type) {
          case "spec": {
            const specs = await db.spec.findMany({
              where: { projectId, title: { contains: query, mode: "insensitive" } },
              take: 3,
              select: { id: true, title: true },
            });
            for (const s of specs) results.push({ type: "spec", id: s.id, title: s.title });
            break;
          }
          case "insight": {
            const insights = await db.insight.findMany({
              where: { projectId, title: { contains: query, mode: "insensitive" } },
              take: 3,
              select: { id: true, title: true },
            });
            for (const i of insights) results.push({ type: "insight", id: i.id, title: i.title });
            break;
          }
          case "theme": {
            const themes = await db.theme.findMany({
              where: { projectId, title: { contains: query, mode: "insensitive" } },
              take: 3,
              select: { id: true, title: true },
            });
            for (const t of themes) results.push({ type: "theme", id: t.id, title: t.title });
            break;
          }
          case "decision": {
            const decisions = await db.decision.findMany({
              where: { projectId, title: { contains: query, mode: "insensitive" } },
              take: 3,
              select: { id: true, title: true },
            });
            for (const d of decisions) results.push({ type: "decision", id: d.id, title: d.title });
            break;
          }
        }
      });

      await Promise.all(searches);

      res.json({
        success: true,
        data: { results: results.slice(0, 8) },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Search failed";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

export default router;
