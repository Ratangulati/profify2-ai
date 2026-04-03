import { db, type Prisma } from "@pm-yc/db";
import type { FeedbackItemData, SyncResult, IntegrationConfig } from "@pm-yc/integrations";
import { HubSpotProvider } from "@pm-yc/integrations/hubspot";
import { IntercomProvider } from "@pm-yc/integrations/intercom";
import { SalesforceProvider } from "@pm-yc/integrations/salesforce";
import { ZendeskProvider } from "@pm-yc/integrations/zendesk";
import type { Job } from "bullmq";

import { env } from "../env.js";
import { feedbackIngestionQueue } from "../queues/index.js";

// ── Job data types ─────────────────────────────────────────────────────

export interface FeedbackSyncData {
  dataSourceId: string;
  cursor?: string;
}

export interface FeedbackWebhookData {
  dataSourceId: string;
  items: FeedbackItemData[];
}

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
      throw new Error(`Unknown integration type: ${type}`);
  }
}

// ── Sync processor ─────────────────────────────────────────────────────

export async function processFeedbackSync(job: Job<FeedbackSyncData>) {
  const { dataSourceId, cursor } = job.data;

  const dataSource = await db.dataSource.findUniqueOrThrow({
    where: { id: dataSourceId },
    include: { project: { select: { id: true } } },
  });

  if (!dataSource.enabled) {
    console.log(`[FeedbackSync] DataSource ${dataSourceId} is disabled, skipping`);
    return { skipped: true };
  }

  // Mark as syncing
  await db.dataSource.update({
    where: { id: dataSourceId },
    data: { syncStatus: "SYNCING" },
  });

  try {
    const provider = getProvider(dataSource.type);
    const config = dataSource.config as unknown as IntegrationConfig;

    const result: SyncResult = await provider.sync(config, cursor);

    await job.updateProgress(50);

    // Persist feedback items
    const persisted = await persistFeedbackItems(dataSource.projectId, dataSourceId, result.items);

    // If there are more pages, enqueue the next page
    if (result.hasMore && result.cursor) {
      await feedbackIngestionQueue.add("sync", {
        dataSourceId,
        cursor: result.cursor,
      });
    } else {
      // Sync complete — update DataSource
      const updatedConfig = { ...config, lastSyncTimestamp: result.cursor };
      await db.dataSource.update({
        where: { id: dataSourceId },
        data: {
          syncStatus: "SUCCESS",
          lastSyncAt: new Date(),
          lastSyncError: null,
          config: updatedConfig as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await job.updateProgress(100);
    console.log(`[FeedbackSync] Synced ${persisted} items from DataSource ${dataSourceId}`);

    return { persisted, hasMore: result.hasMore };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.dataSource.update({
      where: { id: dataSourceId },
      data: { syncStatus: "FAILED", lastSyncError: message },
    });
    throw err;
  }
}

// ── Webhook processor ──────────────────────────────────────────────────

export async function processFeedbackWebhook(job: Job<FeedbackWebhookData>) {
  const { dataSourceId, items } = job.data;

  const dataSource = await db.dataSource.findUniqueOrThrow({
    where: { id: dataSourceId },
    select: { projectId: true },
  });

  const persisted = await persistFeedbackItems(dataSource.projectId, dataSourceId, items);
  console.log(
    `[FeedbackWebhook] Persisted ${persisted} webhook items for DataSource ${dataSourceId}`,
  );

  return { persisted };
}

// ── Shared persistence logic ───────────────────────────────────────────

async function persistFeedbackItems(
  projectId: string,
  dataSourceId: string,
  items: FeedbackItemData[],
): Promise<number> {
  let count = 0;

  for (const item of items) {
    // Upsert by sourceRef to avoid duplicates
    await db.feedbackItem.upsert({
      where: {
        dataSourceId_sourceRef: {
          dataSourceId,
          sourceRef: item.sourceRef,
        },
      },
      create: {
        projectId,
        dataSourceId,
        content: item.content,
        sourceRef: item.sourceRef,
        sourceUrl: item.sourceUrl,
        customerEmail: item.customerEmail,
        customerName: item.customerName,
        segmentTags: item.segmentTags,
        language: item.language,
        metadata: item.metadata as unknown as Prisma.InputJsonValue,
        ingestedAt: new Date(),
      },
      update: {
        content: item.content,
        sourceUrl: item.sourceUrl,
        customerEmail: item.customerEmail,
        customerName: item.customerName,
        segmentTags: item.segmentTags,
        language: item.language,
        metadata: item.metadata as unknown as Prisma.InputJsonValue,
      },
    });
    count++;
  }

  return count;
}
