import {
  createProvider,
  detectCompetitorMentions,
  extractCompetitiveInsights,
  type CompetitorConfig,
} from "@pm-yc/ai";
import { db, type Prisma } from "@pm-yc/db";
import type { Job } from "bullmq";

import { env } from "../env.js";

// ── Job data types ─────────────────────────────────────────────────────

export interface CompetitiveExtractionData {
  projectId: string;
  feedbackItemIds?: string[];
}

const BATCH_SIZE = 50;

// ── Main processor ─────────────────────────────────────────────────────

export async function processCompetitiveExtraction(job: Job<CompetitiveExtractionData>) {
  const { projectId, feedbackItemIds } = job.data;

  console.log(`[CompetitiveExtraction] Processing project ${projectId}`);

  // 1. Load project competitors
  const competitors = await db.competitor.findMany({
    where: { projectId },
    select: { id: true, name: true, aliases: true },
  });

  if (competitors.length === 0) {
    console.log(`[CompetitiveExtraction] No competitors configured, skipping`);
    return { mentionsFound: 0 };
  }

  const competitorConfigs: CompetitorConfig[] = competitors.map((c) => ({
    id: c.id,
    name: c.name,
    aliases: c.aliases,
  }));

  // 2. Load feedback items (either specific IDs or recent unprocessed)
  const feedbackItems = await db.feedbackItem.findMany({
    where: {
      projectId,
      ...(feedbackItemIds ? { id: { in: feedbackItemIds } } : {}),
    },
    select: { id: true, content: true },
    take: BATCH_SIZE,
    orderBy: { ingestedAt: "desc" },
  });

  if (feedbackItems.length === 0) {
    return { mentionsFound: 0 };
  }

  await job.updateProgress(20);

  // 3. Detect competitor mentions
  const provider = createProvider({
    type: "openai",
    apiKey: env.OPENAI_API_KEY,
  });

  const detections = await detectCompetitorMentions(
    provider,
    feedbackItems.map((f) => ({ id: f.id, content: f.content })),
    competitorConfigs,
  );

  await job.updateProgress(50);

  // 4. For items with detections, run extraction
  const itemsWithMentions = detections
    .map((d) => {
      const item = feedbackItems.find((f) => f.id === d.feedbackId);
      return item ? { id: item.id, content: item.content } : null;
    })
    .filter((i): i is { id: string; content: string } => i !== null);

  const extractions = await extractCompetitiveInsights(provider, itemsWithMentions);

  await job.updateProgress(80);

  // 5. Persist mentions
  let mentionsCreated = 0;
  for (const detection of detections) {
    for (const det of detection.detections) {
      // Find matching extraction data
      const extractionData = extractions
        .find((e) => e.feedbackId === detection.feedbackId)
        ?.extractions.find(
          (ext) => ext.competitorName.toLowerCase() === det.competitorName.toLowerCase(),
        );

      try {
        await db.competitorMention.upsert({
          where: {
            competitorId_feedbackItemId: {
              competitorId: det.competitorId,
              feedbackItemId: detection.feedbackId,
            },
          },
          create: {
            projectId,
            competitorId: det.competitorId,
            feedbackItemId: detection.feedbackId,
            comparisonType: extractionData
              ? (extractionData.comparisonType.toUpperCase() as
                  | "FAVORABLE"
                  | "UNFAVORABLE"
                  | "NEUTRAL")
              : "NEUTRAL",
            featureArea: extractionData?.featureArea ?? null,
            specificAdvantage: extractionData?.specificAdvantage ?? null,
            verbatimQuote: extractionData?.verbatimQuote ?? det.matchedTerm,
            switchingSignal: extractionData?.switchingSignal ?? false,
            detectionMethod: det.method,
          },
          update: {
            comparisonType: extractionData
              ? (extractionData.comparisonType.toUpperCase() as
                  | "FAVORABLE"
                  | "UNFAVORABLE"
                  | "NEUTRAL")
              : "NEUTRAL",
            featureArea: extractionData?.featureArea ?? null,
            specificAdvantage: extractionData?.specificAdvantage ?? null,
            verbatimQuote: extractionData?.verbatimQuote ?? det.matchedTerm,
            switchingSignal: extractionData?.switchingSignal ?? false,
          },
        });
        mentionsCreated++;
      } catch (err) {
        console.error(`[CompetitiveExtraction] Failed to persist mention:`, err);
      }
    }
  }

  await job.updateProgress(100);
  console.log(
    `[CompetitiveExtraction] Created ${mentionsCreated} mentions in project ${projectId}`,
  );
  return { mentionsFound: mentionsCreated, feedbackProcessed: feedbackItems.length };
}
