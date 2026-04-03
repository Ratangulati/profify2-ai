import { OpenAIProvider, analyzeSentimentBatch, type FeedbackForSentiment } from "@pm-yc/ai";
import { db } from "@pm-yc/db";
import type { Job } from "bullmq";

import { env } from "../env.js";

// ── Job data types ─────────────────────────────────────────────────────

export interface SentimentAnalysisData {
  projectId: string;
  /** Optional: only process specific feedback item IDs */
  feedbackItemIds?: string[];
}

const BATCH_LIMIT = 500;

// ── Main processor ─────────────────────────────────────────────────────

export async function processSentimentAnalysis(job: Job<SentimentAnalysisData>) {
  const { projectId, feedbackItemIds } = job.data;

  const provider = new OpenAIProvider(env.OPENAI_API_KEY);

  // Fetch unprocessed feedback items
  const items = await db.feedbackItem.findMany({
    where: {
      projectId,
      ...(feedbackItemIds ? { id: { in: feedbackItemIds } } : { sentimentProcessed: false }),
    },
    take: BATCH_LIMIT,
    orderBy: { ingestedAt: "desc" },
    select: { id: true, content: true },
  });

  if (items.length === 0) {
    console.log(`[SentimentAnalysis] No unprocessed items for project ${projectId}`);
    return { processed: 0 };
  }

  await job.updateProgress(10);
  console.log(`[SentimentAnalysis] Scoring ${items.length} items for project ${projectId}`);

  // Run LLM sentiment analysis
  const batchItems: FeedbackForSentiment[] = items.map((i) => ({
    id: i.id,
    content: i.content,
  }));

  const results = await analyzeSentimentBatch(provider, batchItems);
  await job.updateProgress(70);

  // Persist results
  let processed = 0;
  for (const item of items) {
    const result = results.get(item.id);
    if (result) {
      await db.feedbackItem.update({
        where: { id: item.id },
        data: {
          sentiment: result.label,
          sentimentScore: result.score,
          sentimentJustification: result.justification,
          sentimentProcessed: true,
        },
      });
      processed++;
    } else {
      // Mark as processed even if LLM didn't return result (avoid infinite retry)
      await db.feedbackItem.update({
        where: { id: item.id },
        data: { sentimentProcessed: true },
      });
    }
  }

  await job.updateProgress(100);
  console.log(
    `[SentimentAnalysis] Scored ${processed}/${items.length} items for project ${projectId}`,
  );

  return { processed };
}
