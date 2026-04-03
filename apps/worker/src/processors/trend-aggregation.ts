import { getWeekStart, aggregateWeekly, type FeedbackForAggregation } from "@pm-yc/ai";
import { db, type Prisma } from "@pm-yc/db";
import type { Job } from "bullmq";

// ── Job data types ─────────────────────────────────────────────────────

export interface TrendAggregationData {
  projectId: string;
  /** Number of weeks to aggregate (default 12) */
  weeks?: number;
}

// ── Main processor ─────────────────────────────────────────────────────

export async function processTrendAggregation(job: Job<TrendAggregationData>) {
  const { projectId, weeks = 12 } = job.data;

  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - weeks * 7);

  console.log(`[TrendAggregation] Aggregating ${weeks} weeks of data for project ${projectId}`);

  // 1. Aggregate project-level trends
  await aggregateProjectTrends(projectId, cutoffDate);
  await job.updateProgress(30);

  // 2. Aggregate per-theme trends
  await aggregateThemeTrends(projectId, cutoffDate);
  await job.updateProgress(70);

  // 3. Aggregate per-insight trends
  await aggregateInsightTrends(projectId, cutoffDate);
  await job.updateProgress(100);

  console.log(`[TrendAggregation] Done for project ${projectId}`);
  return { success: true };
}

// ── Project-level aggregation ──────────────────────────────────────────

async function aggregateProjectTrends(projectId: string, since: Date) {
  const feedbackItems = await db.feedbackItem.findMany({
    where: { projectId, ingestedAt: { gte: since } },
    select: {
      id: true,
      ingestedAt: true,
      sentimentScore: true,
      dataSource: { select: { type: true } },
    },
    orderBy: { ingestedAt: "asc" },
  });

  const items: FeedbackForAggregation[] = feedbackItems.map((fi) => ({
    id: fi.id,
    ingestedAt: fi.ingestedAt,
    sentimentScore: fi.sentimentScore,
    dataSourceType: fi.dataSource?.type ?? null,
  }));

  const weeklyData = aggregateWeekly(items);

  for (const week of weeklyData) {
    await upsertTrendPoint(projectId, "project", projectId, week.period, "volume", week.volume);
    await upsertTrendPoint(
      projectId,
      "project",
      projectId,
      week.period,
      "avg_sentiment",
      week.avgSentiment,
    );
    await upsertTrendPoint(
      projectId,
      "project",
      projectId,
      week.period,
      "source_distribution",
      0,
      week.sourceDistribution as unknown as Prisma.InputJsonValue,
    );
  }
}

// ── Theme-level aggregation ────────────────────────────────────────────

async function aggregateThemeTrends(projectId: string, since: Date) {
  const themes = await db.theme.findMany({
    where: { projectId },
    select: { id: true },
  });

  for (const theme of themes) {
    const themeItems = await db.themeFeedbackItem.findMany({
      where: {
        themeId: theme.id,
        feedbackItem: { ingestedAt: { gte: since } },
      },
      select: {
        feedbackItem: {
          select: {
            id: true,
            ingestedAt: true,
            sentimentScore: true,
            dataSource: { select: { type: true } },
          },
        },
      },
    });

    const items: FeedbackForAggregation[] = themeItems.map((ti) => ({
      id: ti.feedbackItem.id,
      ingestedAt: ti.feedbackItem.ingestedAt,
      sentimentScore: ti.feedbackItem.sentimentScore,
      dataSourceType: ti.feedbackItem.dataSource?.type ?? null,
    }));

    const weeklyData = aggregateWeekly(items);

    for (const week of weeklyData) {
      await upsertTrendPoint(projectId, "theme", theme.id, week.period, "volume", week.volume);
      await upsertTrendPoint(
        projectId,
        "theme",
        theme.id,
        week.period,
        "avg_sentiment",
        week.avgSentiment,
      );
      await upsertTrendPoint(
        projectId,
        "theme",
        theme.id,
        week.period,
        "source_distribution",
        0,
        week.sourceDistribution as unknown as Prisma.InputJsonValue,
      );
    }
  }
}

// ── Insight-level aggregation ──────────────────────────────────────────

async function aggregateInsightTrends(projectId: string, since: Date) {
  const insights = await db.insight.findMany({
    where: { projectId },
    select: { id: true },
  });

  for (const insight of insights) {
    const evidence = await db.insightEvidence.findMany({
      where: {
        insightId: insight.id,
        feedbackItem: { ingestedAt: { gte: since } },
      },
      select: {
        feedbackItem: {
          select: {
            id: true,
            ingestedAt: true,
            sentimentScore: true,
            dataSource: { select: { type: true } },
          },
        },
      },
    });

    const items: FeedbackForAggregation[] = evidence.map((e) => ({
      id: e.feedbackItem.id,
      ingestedAt: e.feedbackItem.ingestedAt,
      sentimentScore: e.feedbackItem.sentimentScore,
      dataSourceType: e.feedbackItem.dataSource?.type ?? null,
    }));

    const weeklyData = aggregateWeekly(items);

    for (const week of weeklyData) {
      await upsertTrendPoint(projectId, "insight", insight.id, week.period, "volume", week.volume);
      await upsertTrendPoint(
        projectId,
        "insight",
        insight.id,
        week.period,
        "avg_sentiment",
        week.avgSentiment,
      );
    }
  }
}

// ── Shared helper ──────────────────────────────────────────────────────

async function upsertTrendPoint(
  projectId: string,
  entityType: string,
  entityId: string,
  period: Date,
  metric: string,
  value: number,
  metadata?: Prisma.InputJsonValue,
) {
  await db.trendDataPoint.upsert({
    where: {
      projectId_entityType_entityId_period_metric: {
        projectId,
        entityType,
        entityId,
        period,
        metric,
      },
    },
    create: {
      projectId,
      entityType,
      entityId,
      period,
      metric,
      value,
      metadata: metadata ?? {},
    },
    update: {
      value,
      metadata: metadata ?? {},
    },
  });
}
