import { randomBytes } from "node:crypto";

import { db } from "@pm-yc/db";
import {
  encryptTokens,
  IntercomProvider,
  ZendeskProvider,
  SalesforceProvider,
  HubSpotProvider,
} from "@pm-yc/integrations";
import { handleIntercomWebhook } from "@pm-yc/integrations/intercom";
import { handleZendeskWebhook } from "@pm-yc/integrations/zendesk";
import { Queue } from "bullmq";
import type { Request, Response } from "express";
import { Router } from "express";
import IORedis from "ioredis";

import { env } from "../env.js";
import { authenticate } from "../middleware/auth.js";
import { enforceWorkspace, requireRole } from "../middleware/workspace.js";

const router = Router();

// ── Redis + Queue (for enqueuing sync/webhook jobs) ────────────────────

const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
const feedbackQueue = new Queue("feedback-ingestion", { connection: redis });

// ── Provider factory ───────────────────────────────────────────────────

function getProvider(type: string) {
  switch (type) {
    case "INTERCOM":
      return new IntercomProvider(env.INTERCOM_CLIENT_ID, env.INTERCOM_CLIENT_SECRET);
    case "ZENDESK":
      return new ZendeskProvider(env.ZENDESK_CLIENT_ID, env.ZENDESK_CLIENT_SECRET);
    case "SALESFORCE":
      return new SalesforceProvider(env.SALESFORCE_CLIENT_ID, env.SALESFORCE_CLIENT_SECRET);
    case "HUBSPOT":
      return new HubSpotProvider(env.HUBSPOT_CLIENT_ID, env.HUBSPOT_CLIENT_SECRET);
    default:
      return null;
  }
}

// ── OAuth: Start flow ──────────────────────────────────────────────────

router.get(
  "/workspaces/:workspaceId/integrations/:type/oauth/start",
  authenticate,
  enforceWorkspace,
  requireRole("data_source", "manage"),
  (req: Request, res: Response) => {
    const type = req.params.type as string;
    const provider = getProvider(type.toUpperCase());
    if (!provider) {
      res
        .status(400)
        .json({
          success: false,
          error: { code: "INVALID_TYPE", message: `Unknown integration type: ${type}` },
        });
      return;
    }

    const state = randomBytes(32).toString("hex");
    const redirectUri = `${env.API_BASE_URL}/api/integrations/oauth/callback`;

    // Store state in Redis with 10-minute expiry
    const statePayload = JSON.stringify({
      workspaceId: req.workspaceId,
      type: type.toUpperCase(),
      userId: req.user!.id,
      subdomain: req.query.subdomain, // For Zendesk
    });
    redis.set(`oauth:state:${state}`, statePayload, "EX", 600);

    let authUrl: string;
    if (type.toUpperCase() === "ZENDESK" && req.query.subdomain) {
      authUrl = (provider as ZendeskProvider).getAuthUrlForSubdomain(
        req.query.subdomain as string,
        redirectUri,
        state,
      );
    } else {
      authUrl = provider.getAuthUrl(redirectUri, state);
    }

    res.json({ success: true, data: { authUrl, state } });
  },
);

// ── OAuth: Callback ────────────────────────────────────────────────────

router.get("/integrations/oauth/callback", async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      res
        .status(400)
        .json({
          success: false,
          error: { code: "MISSING_PARAMS", message: "Missing code or state" },
        });
      return;
    }

    const statePayloadStr = await redis.get(`oauth:state:${state}`);
    if (!statePayloadStr) {
      res
        .status(400)
        .json({
          success: false,
          error: { code: "INVALID_STATE", message: "OAuth state expired or invalid" },
        });
      return;
    }

    await redis.del(`oauth:state:${state}`);
    const statePayload = JSON.parse(statePayloadStr) as {
      workspaceId: string;
      type: string;
      userId: string;
      subdomain?: string;
    };

    const provider = getProvider(statePayload.type);
    if (!provider) {
      res
        .status(400)
        .json({
          success: false,
          error: { code: "INVALID_TYPE", message: "Invalid integration type in state" },
        });
      return;
    }

    const redirectUri = `${env.API_BASE_URL}/api/integrations/oauth/callback`;
    let tokens;

    if (statePayload.type === "ZENDESK" && statePayload.subdomain) {
      tokens = await (provider as ZendeskProvider).exchangeCode(
        code as string,
        redirectUri,
        statePayload.subdomain,
      );
    } else {
      tokens = await provider.exchangeCode(code as string, redirectUri);
    }

    // Encrypt tokens and store in a DataSource record
    const encrypted = encryptTokens(tokens, env.AUTH_SECRET);

    const config: Record<string, unknown> = { encryptedTokens: encrypted };
    if (statePayload.subdomain) config.subdomain = statePayload.subdomain;
    if (statePayload.type === "ZENDESK" && statePayload.subdomain) config.authMode = "oauth";
    if (tokens.instanceUrl) config.instanceUrl = tokens.instanceUrl;

    // Find existing or create new DataSource
    const existing = await db.dataSource.findFirst({
      where: {
        project: { workspaceId: statePayload.workspaceId },
        type: statePayload.type as "INTERCOM" | "ZENDESK" | "SALESFORCE" | "HUBSPOT",
      },
    });

    if (existing) {
      await db.dataSource.update({
        where: { id: existing.id },
        data: { config: { ...(existing.config as Record<string, unknown>), ...config } as object },
      });
    }

    // Redirect to the frontend with success
    res.redirect(
      `${env.CORS_ORIGIN}/settings/integrations?status=success&type=${statePayload.type.toLowerCase()}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth callback failed";
    res.redirect(
      `${env.CORS_ORIGIN}/settings/integrations?status=error&message=${encodeURIComponent(message)}`,
    );
  }
});

// ── Trigger sync ───────────────────────────────────────────────────────

router.post(
  "/workspaces/:workspaceId/data-sources/:dataSourceId/sync",
  authenticate,
  enforceWorkspace,
  requireRole("data_source", "manage"),
  async (req: Request, res: Response) => {
    const dataSourceId = req.params.dataSourceId as string;

    const ds = await db.dataSource.findUnique({ where: { id: dataSourceId } });
    if (!ds || ds.syncStatus === "SYNCING") {
      res.status(400).json({
        success: false,
        error: {
          code: ds ? "ALREADY_SYNCING" : "NOT_FOUND",
          message: ds ? "Sync already in progress" : "DataSource not found",
        },
      });
      return;
    }

    await feedbackQueue.add("sync", { dataSourceId });
    res.json({ success: true, data: { message: "Sync enqueued" } });
  },
);

// ── Webhooks (public — validated by signature) ─────────────────────────

router.post("/webhooks/intercom", async (req: Request, res: Response) => {
  try {
    const event = handleIntercomWebhook(
      req.headers as Record<string, string | string[] | undefined>,
      req.body,
      env.INTERCOM_WEBHOOK_SECRET,
    );

    if (event.items.length > 0) {
      // Look up the DataSource for this Intercom app
      const ds = await db.dataSource.findFirst({ where: { type: "INTERCOM", enabled: true } });
      if (ds) {
        await feedbackQueue.add("webhook", {
          dataSourceId: ds.id,
          items: event.items,
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook processing failed";
    res.status(400).json({ success: false, error: { code: "WEBHOOK_ERROR", message } });
  }
});

router.post("/webhooks/zendesk", async (req: Request, res: Response) => {
  try {
    const subdomainHeader = req.headers["x-zendesk-subdomain"];
    const subdomain = (Array.isArray(subdomainHeader) ? subdomainHeader[0] : subdomainHeader) ?? "";
    const event = handleZendeskWebhook(
      req.headers as Record<string, string | string[] | undefined>,
      req.body,
      env.ZENDESK_WEBHOOK_SECRET,
      subdomain,
    );

    if (event.items.length > 0) {
      const ds = await db.dataSource.findFirst({ where: { type: "ZENDESK", enabled: true } });
      if (ds) {
        await feedbackQueue.add("webhook", {
          dataSourceId: ds.id,
          items: event.items,
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook processing failed";
    res.status(400).json({ success: false, error: { code: "WEBHOOK_ERROR", message } });
  }
});

export default router;
