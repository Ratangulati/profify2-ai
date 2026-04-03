import { createProvider, extractJTBDs } from "@pm-yc/ai";
import { db } from "@pm-yc/db";
import type { Job } from "bullmq";

import { env } from "../env.js";

// ── Job data types ─────────────────────────────────────────────────────

export interface JTBDExtractionData {
  projectId: string;
  themeId?: string;
  minFeedbackCount?: number;
}

const MIN_ITEMS_FOR_JTBD = 10;

// ── Main processor ─────────────────────────────────────────────────────

export async function processJTBDExtraction(job: Job<JTBDExtractionData>) {
  const { projectId, themeId, minFeedbackCount = MIN_ITEMS_FOR_JTBD } = job.data;

  console.log(`[JTBDExtraction] Processing project ${projectId}`);

  // 1. Load eligible themes (>N feedback items)
  const themes = await db.theme.findMany({
    where: {
      projectId,
      ...(themeId ? { id: themeId } : {}),
      feedbackCount: { gte: minFeedbackCount },
    },
    select: { id: true, title: true },
  });

  if (themes.length === 0) {
    console.log(`[JTBDExtraction] No themes with >= ${minFeedbackCount} items`);
    return { jobsExtracted: 0 };
  }

  const provider = createProvider({
    type: "openai",
    apiKey: env.OPENAI_API_KEY,
  });

  let totalJobs = 0;

  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i];

    // 2. Load feedback items for this theme
    const themeFeedback = await db.themeFeedbackItem.findMany({
      where: { themeId: theme.id },
      take: 50,
      orderBy: { feedbackItem: { ingestedAt: "desc" } },
      select: {
        feedbackItem: {
          select: {
            id: true,
            content: true,
            sentimentScore: true,
          },
        },
      },
    });

    const items = themeFeedback.map((tf) => ({
      id: tf.feedbackItem.id,
      content: tf.feedbackItem.content,
      sentimentScore: tf.feedbackItem.sentimentScore,
    }));

    if (items.length < minFeedbackCount) continue;

    // 3. Extract JTBDs
    const result = await extractJTBDs(provider, theme.title, items);

    // 4. Persist
    for (const jtbd of result.jobs) {
      await db.jTBD.create({
        data: {
          projectId,
          themeId: theme.id,
          statement: jtbd.statement,
          jobType: jtbd.jobType,
          importance: jtbd.importance,
          satisfaction: jtbd.satisfaction,
          opportunityScore: jtbd.opportunityScore,
          evidence: jtbd.evidenceIds,
        },
      });
      totalJobs++;
    }

    await job.updateProgress(Math.round(((i + 1) / themes.length) * 100));
  }

  console.log(`[JTBDExtraction] Extracted ${totalJobs} JTBDs from ${themes.length} themes`);
  return { jobsExtracted: totalJobs, themesProcessed: themes.length };
}
