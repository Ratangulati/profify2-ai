import { createProvider, detectContradictions } from "@pm-yc/ai";
import { db } from "@pm-yc/db";
import type { Job } from "bullmq";

import { env } from "../env.js";

// ── Job data types ─────────────────────────────────────────────────────

export interface ContradictionDetectionData {
  projectId: string;
}

// ── Main processor ─────────────────────────────────────────────────────

export async function processContradictionDetection(job: Job<ContradictionDetectionData>) {
  const { projectId } = job.data;

  console.log(`[ContradictionDetection] Scanning project ${projectId}`);

  // 1. Load all insights for the project
  const insights = await db.insight.findMany({
    where: { projectId },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
    },
  });

  if (insights.length < 2) {
    console.log(`[ContradictionDetection] Fewer than 2 insights, skipping`);
    return { contradictionsFound: 0 };
  }

  await job.updateProgress(20);

  // 2. Run LLM contradiction detection
  const provider = createProvider({
    type: "openai",
    apiKey: env.OPENAI_API_KEY,
  });

  const insightsForScan = insights.map((i) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    type: i.type,
  }));

  const result = await detectContradictions(provider, insightsForScan);

  await job.updateProgress(70);

  // 3. Persist new contradictions (skip already-existing pairs)
  let created = 0;
  for (const c of result.contradictions) {
    // Validate both insight IDs exist in this project
    const validA = insights.some((i) => i.id === c.insightAId);
    const validB = insights.some((i) => i.id === c.insightBId);
    if (!validA || !validB) continue;

    // Normalize ordering for unique constraint
    const [aId, bId] = [c.insightAId, c.insightBId].sort();

    const existing = await db.contradiction.findUnique({
      where: { insightAId_insightBId: { insightAId: aId, insightBId: bId } },
    });

    if (!existing) {
      await db.contradiction.create({
        data: {
          projectId,
          insightAId: aId,
          insightBId: bId,
          description: c.description,
          explanation: c.explanation,
          recommendedResolution: c.recommendedResolution,
          status: "OPEN",
        },
      });
      created++;
    }
  }

  await job.updateProgress(100);
  console.log(
    `[ContradictionDetection] Found ${created} new contradictions in project ${projectId}`,
  );
  return { contradictionsFound: created, pairsScanned: result.pairsScanned };
}
