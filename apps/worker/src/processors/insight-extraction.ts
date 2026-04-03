import {
  OpenAIProvider,
  extractInsights,
  checkDuplicate,
  calculateInsightScores,
  type FeedbackBatchItem,
  type ExtractedPainPoint,
  type ExtractedDesire,
  type InsightForDedup,
} from "@pm-yc/ai";
import { db, type Prisma } from "@pm-yc/db";
import type { Job } from "bullmq";

import { env } from "../env.js";

// ── Job data types ─────────────────────────────────────────────────────

export interface InsightExtractionData {
  projectId: string;
  /** Optional: only process specific feedback item IDs */
  feedbackItemIds?: string[];
}

const UNPROCESSED_BATCH_LIMIT = 200;
const SIMILARITY_THRESHOLD = 0.85;

// ── Main processor ─────────────────────────────────────────────────────

export async function processInsightExtraction(job: Job<InsightExtractionData>) {
  const { projectId, feedbackItemIds } = job.data;

  const provider = new OpenAIProvider(env.OPENAI_API_KEY);

  // 1. Fetch unprocessed feedback items
  const whereClause: Prisma.FeedbackItemWhereInput = {
    projectId,
    ...(feedbackItemIds ? { id: { in: feedbackItemIds } } : { processedForInsights: false }),
  };

  const feedbackItems = await db.feedbackItem.findMany({
    where: whereClause,
    take: UNPROCESSED_BATCH_LIMIT,
    orderBy: { ingestedAt: "desc" },
    select: {
      id: true,
      content: true,
      customerName: true,
      segmentTags: true,
      createdAt: true,
    },
  });

  if (feedbackItems.length === 0) {
    console.log(`[InsightExtraction] No unprocessed feedback for project ${projectId}`);
    return { extracted: 0, merged: 0, created: 0 };
  }

  await job.updateProgress(10);
  console.log(
    `[InsightExtraction] Processing ${feedbackItems.length} feedback items for project ${projectId}`,
  );

  // 2. Map to extraction batch format
  const batchItems: FeedbackBatchItem[] = feedbackItems.map((item) => ({
    id: item.id,
    content: item.content,
    customerName: item.customerName ?? undefined,
    segmentTags: item.segmentTags,
  }));

  // 3. Run LLM extraction
  const { painPoints, desires } = await extractInsights(provider, batchItems);
  await job.updateProgress(50);

  console.log(
    `[InsightExtraction] Extracted ${painPoints.length} pain points, ${desires.length} desires`,
  );

  // 4. Load existing insights for dedup
  const existingInsights = await db.insight.findMany({
    where: { projectId },
    select: {
      id: true,
      title: true,
      description: true,
      embedding: true,
      frequencyCount: true,
    },
  });

  const existingForDedup: InsightForDedup[] = existingInsights.map((ins) => ({
    id: ins.id,
    title: ins.title,
    description: ins.description,
    embedding: ins.embedding,
    frequencyCount: ins.frequencyCount,
  }));

  // 5. Process pain points — dedup and persist
  let mergedCount = 0;
  let createdCount = 0;

  for (const pp of painPoints) {
    const result = await processPainPoint(provider, pp, existingForDedup, projectId);
    if (result.merged) {
      mergedCount++;
    } else {
      createdCount++;
      // Add the newly created insight to existing list for subsequent dedup checks
      existingForDedup.push({
        id: result.insightId,
        title: pp.title,
        description: pp.description,
        embedding: result.embedding,
        frequencyCount: pp.verbatim_quotes.length,
      });
    }
  }

  await job.updateProgress(70);

  // 6. Process desires — dedup and persist
  for (const desire of desires) {
    const result = await processDesire(provider, desire, existingForDedup, projectId);
    if (result.merged) {
      mergedCount++;
    } else {
      createdCount++;
      existingForDedup.push({
        id: result.insightId,
        title: desire.title,
        description: desire.description,
        embedding: result.embedding,
        frequencyCount: desire.verbatim_quotes.length,
      });
    }
  }

  await job.updateProgress(85);

  // 7. Mark feedback items as processed
  await db.feedbackItem.updateMany({
    where: { id: { in: feedbackItems.map((fi) => fi.id) } },
    data: { processedForInsights: true },
  });

  // 8. Recalculate scores for all affected insights
  const affectedInsightIds = new Set<string>();
  for (const pp of painPoints) {
    // We track by querying evidence — simpler approach
  }

  // Recalc all project insights that were touched
  await recalculateProjectInsightScores(projectId);

  await job.updateProgress(100);
  console.log(
    `[InsightExtraction] Done: ${createdCount} created, ${mergedCount} merged for project ${projectId}`,
  );

  return {
    extracted: painPoints.length + desires.length,
    merged: mergedCount,
    created: createdCount,
  };
}

// ── Pain point processing ──────────────────────────────────────────────

async function processPainPoint(
  provider: OpenAIProvider,
  pp: ExtractedPainPoint,
  existingInsights: InsightForDedup[],
  projectId: string,
): Promise<{ insightId: string; merged: boolean; embedding: number[] }> {
  // Check for duplicates via embedding similarity
  const dedup = await checkDuplicate(
    provider,
    pp.title,
    pp.description,
    existingInsights,
    SIMILARITY_THRESHOLD,
  );

  if (dedup.mergeTargetId) {
    // Merge: increment frequency, add new quotes
    await mergeIntoExistingInsight(dedup.mergeTargetId, pp.verbatim_quotes);
    return { insightId: dedup.mergeTargetId, merged: true, embedding: dedup.embedding };
  }

  // Create new insight
  const insight = await db.insight.create({
    data: {
      projectId,
      title: pp.title,
      description: pp.description,
      type: "PAIN_POINT",
      severityScore: pp.severity,
      frequencyCount: pp.verbatim_quotes.length,
      affectedWorkflow: pp.affected_workflow,
      embedding: dedup.embedding,
      metadata: {} as Prisma.InputJsonValue,
    },
  });

  // Create evidence records
  await createEvidenceRecords(insight.id, pp.verbatim_quotes);

  return { insightId: insight.id, merged: false, embedding: dedup.embedding };
}

// ── Desire processing ──────────────────────────────────────────────────

async function processDesire(
  provider: OpenAIProvider,
  desire: ExtractedDesire,
  existingInsights: InsightForDedup[],
  projectId: string,
): Promise<{ insightId: string; merged: boolean; embedding: number[] }> {
  const dedup = await checkDuplicate(
    provider,
    desire.title,
    desire.description,
    existingInsights,
    SIMILARITY_THRESHOLD,
  );

  if (dedup.mergeTargetId) {
    await mergeIntoExistingInsight(dedup.mergeTargetId, desire.verbatim_quotes);
    return { insightId: dedup.mergeTargetId, merged: true, embedding: dedup.embedding };
  }

  const insight = await db.insight.create({
    data: {
      projectId,
      title: desire.title,
      description: desire.description,
      type: "DESIRE",
      severityScore: 0,
      frequencyCount: desire.verbatim_quotes.length,
      inferredJtbd: desire.inferred_jtbd,
      embedding: dedup.embedding,
      metadata: {} as Prisma.InputJsonValue,
    },
  });

  await createEvidenceRecords(insight.id, desire.verbatim_quotes);

  return { insightId: insight.id, merged: false, embedding: dedup.embedding };
}

// ── Shared helpers ─────────────────────────────────────────────────────

async function mergeIntoExistingInsight(
  insightId: string,
  quotes: Array<{ text: string; feedback_id: string }>,
) {
  // Add new evidence, skipping duplicates via unique constraint
  for (const quote of quotes) {
    await db.insightEvidence.upsert({
      where: {
        insightId_feedbackItemId: {
          insightId,
          feedbackItemId: quote.feedback_id,
        },
      },
      create: {
        insightId,
        feedbackItemId: quote.feedback_id,
        quote: quote.text,
      },
      update: {
        quote: quote.text,
      },
    });
  }

  // Update frequency count
  const evidenceCount = await db.insightEvidence.count({ where: { insightId } });
  await db.insight.update({
    where: { id: insightId },
    data: { frequencyCount: evidenceCount },
  });
}

async function createEvidenceRecords(
  insightId: string,
  quotes: Array<{ text: string; feedback_id: string }>,
) {
  for (const quote of quotes) {
    try {
      await db.insightEvidence.create({
        data: {
          insightId,
          feedbackItemId: quote.feedback_id,
          quote: quote.text,
        },
      });
    } catch {
      // Skip if feedback_id doesn't exist or duplicate
    }
  }
}

/**
 * Recalculate scores (trend, segment distribution) for all insights in a project.
 */
async function recalculateProjectInsightScores(projectId: string) {
  const insights = await db.insight.findMany({
    where: { projectId },
    select: { id: true, type: true },
  });

  for (const insight of insights) {
    const evidence = await db.insightEvidence.findMany({
      where: { insightId: insight.id },
      include: {
        feedbackItem: {
          select: { createdAt: true, segmentTags: true },
        },
      },
    });

    const evidenceItems = evidence.map((e) => ({
      feedbackItemCreatedAt: e.feedbackItem.createdAt,
      segmentTags: e.feedbackItem.segmentTags,
    }));

    const scores = calculateInsightScoresFromEvidence(evidenceItems);

    await db.insight.update({
      where: { id: insight.id },
      data: {
        frequencyCount: scores.frequency,
        trend: scores.trend,
        segmentDistribution: scores.segmentDistribution as Prisma.InputJsonValue,
      },
    });
  }
}

function calculateInsightScoresFromEvidence(
  evidence: Array<{ feedbackItemCreatedAt: Date; segmentTags: string[] }>,
) {
  const now = new Date();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const recentCutoff = new Date(now.getTime() - thirtyDaysMs);
  const previousCutoff = new Date(now.getTime() - 2 * thirtyDaysMs);

  let recentCount = 0;
  let previousCount = 0;
  const segmentDistribution: Record<string, number> = {};

  for (const item of evidence) {
    const ts = item.feedbackItemCreatedAt.getTime();
    if (ts >= recentCutoff.getTime()) recentCount++;
    else if (ts >= previousCutoff.getTime()) previousCount++;

    for (const tag of item.segmentTags) {
      segmentDistribution[tag] = (segmentDistribution[tag] ?? 0) + 1;
    }
  }

  let trend: "INCREASING" | "STABLE" | "DECREASING" = "STABLE";
  if (recentCount + previousCount >= 3) {
    if (previousCount === 0) {
      trend = recentCount > 0 ? "INCREASING" : "STABLE";
    } else {
      const ratio = recentCount / previousCount;
      if (ratio >= 1.5) trend = "INCREASING";
      else if (ratio <= 0.5) trend = "DECREASING";
    }
  }

  return {
    frequency: evidence.length,
    trend,
    segmentDistribution,
  };
}
