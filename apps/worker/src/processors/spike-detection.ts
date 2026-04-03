import { detectSpikes, getWeekStart } from "@pm-yc/ai";
import { db, type Prisma } from "@pm-yc/db";
import type { Job } from "bullmq";

import { env } from "../env.js";

// ── Job data types ─────────────────────────────────────────────────────

export interface SpikeDetectionData {
  projectId: string;
  /** Rolling window size in weeks (default 4) */
  rollingWeeks?: number;
  /** Spike threshold multiplier (default 3.0) */
  threshold?: number;
}

const SPIKE_ROLLING_WEEKS = 4;
const SPIKE_THRESHOLD = 3.0;
const SAMPLE_ITEMS_COUNT = 5;

// ── Main processor ─────────────────────────────────────────────────────

export async function processSpikeDetection(job: Job<SpikeDetectionData>) {
  const { projectId, rollingWeeks = SPIKE_ROLLING_WEEKS, threshold = SPIKE_THRESHOLD } = job.data;

  console.log(`[SpikeDetection] Checking for spikes in project ${projectId}`);

  // 1. Get current week start
  const currentWeekStart = getWeekStart(new Date());

  // 2. Load volume data for themes (current + N previous weeks)
  const weeksNeeded = rollingWeeks + 1;
  const cutoff = new Date(currentWeekStart);
  cutoff.setUTCDate(cutoff.getUTCDate() - weeksNeeded * 7);

  const themes = await db.theme.findMany({
    where: { projectId },
    select: { id: true, title: true },
  });

  const trendPoints = await db.trendDataPoint.findMany({
    where: {
      projectId,
      entityType: "theme",
      metric: "volume",
      period: { gte: cutoff },
    },
    orderBy: { period: "asc" },
  });

  // 3. Build weekly volume arrays per theme
  const themeEntities = themes.map((theme) => {
    const points = trendPoints
      .filter((p) => p.entityId === theme.id)
      .sort((a, b) => a.period.getTime() - b.period.getTime());

    return {
      entityType: "theme" as const,
      entityId: theme.id,
      entityTitle: theme.title,
      weeklyVolumes: points.map((p) => p.value),
    };
  });

  // 4. Run spike detection
  const spikeResults = detectSpikes(themeEntities, rollingWeeks, threshold);
  const spikes = spikeResults.filter((r) => r.isSpike);

  await job.updateProgress(50);

  if (spikes.length === 0) {
    console.log(`[SpikeDetection] No spikes detected for project ${projectId}`);
    return { spikesDetected: 0 };
  }

  console.log(`[SpikeDetection] Detected ${spikes.length} spikes for project ${projectId}`);

  // 5. Create spike alerts with sample items
  for (const spike of spikes) {
    // Get sample feedback items for this theme
    const sampleItems = await db.themeFeedbackItem.findMany({
      where: {
        themeId: spike.entityId,
        feedbackItem: {
          ingestedAt: { gte: currentWeekStart },
        },
      },
      take: SAMPLE_ITEMS_COUNT,
      orderBy: { feedbackItem: { ingestedAt: "desc" } },
      select: {
        feedbackItem: {
          select: {
            id: true,
            content: true,
            customerName: true,
            ingestedAt: true,
          },
        },
      },
    });

    const samples = sampleItems.map((si) => ({
      id: si.feedbackItem.id,
      content: si.feedbackItem.content.slice(0, 200),
      customerName: si.feedbackItem.customerName,
      ingestedAt: si.feedbackItem.ingestedAt,
    }));

    // Check if an active alert already exists for this entity
    const existingAlert = await db.spikeAlert.findFirst({
      where: {
        projectId,
        entityType: spike.entityType,
        entityId: spike.entityId,
        status: { in: ["PENDING", "DELIVERED"] },
      },
    });

    if (existingAlert) {
      // Update the existing alert with fresh data
      await db.spikeAlert.update({
        where: { id: existingAlert.id },
        data: {
          spikeFactor: spike.spikeFactor === Infinity ? 999 : spike.spikeFactor,
          currentVolume: spike.currentVolume,
          rollingAverage: spike.rollingAverage,
          sampleItems: samples as unknown as Prisma.InputJsonValue,
        },
      });
    } else {
      await db.spikeAlert.create({
        data: {
          projectId,
          entityType: spike.entityType,
          entityId: spike.entityId,
          entityTitle: spike.entityTitle,
          spikeFactor: spike.spikeFactor === Infinity ? 999 : spike.spikeFactor,
          currentVolume: spike.currentVolume,
          rollingAverage: spike.rollingAverage,
          sampleItems: samples as unknown as Prisma.InputJsonValue,
          status: "PENDING",
        },
      });
    }

    // Deliver via configured channels
    await deliverAlerts(projectId, spike);
  }

  await job.updateProgress(100);
  return { spikesDetected: spikes.length };
}

// ── Alert delivery ─────────────────────────────────────────────────────

async function deliverAlerts(
  projectId: string,
  spike: {
    entityTitle: string;
    currentVolume: number;
    rollingAverage: number;
    spikeFactor: number;
  },
) {
  // Load project settings for alert config
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { settings: true, name: true },
  });
  if (!project) return;

  const settings = project.settings as Record<string, unknown>;
  const slackWebhookUrl = settings.slackWebhookUrl as string | undefined;

  if (slackWebhookUrl) {
    try {
      const factor =
        spike.spikeFactor === Infinity ? "N/A (from zero)" : `${spike.spikeFactor.toFixed(1)}x`;
      await fetch(slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Spike Alert: "${spike.entityTitle}" in ${project.name}\nVolume: ${spike.currentVolume} (${factor} the rolling average of ${spike.rollingAverage.toFixed(1)})`,
        }),
      });

      // Mark alert as delivered via slack
      await db.spikeAlert.updateMany({
        where: {
          projectId,
          entityTitle: spike.entityTitle,
          status: "PENDING",
        },
        data: {
          status: "DELIVERED",
          deliveredVia: ["slack"],
        },
      });
    } catch (err) {
      console.error(`[SpikeDetection] Slack delivery failed:`, err);
    }
  }
}
