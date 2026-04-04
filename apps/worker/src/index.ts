import { Worker } from "bullmq";

import {
  type AssumptionSurfacingData,
  processAssumptionSurfacing,
} from "./processors/assumption-surfacing.js";
import {
  type CompetitiveExtractionData,
  processCompetitiveExtraction,
} from "./processors/competitive-extraction.js";
import {
  type ContradictionDetectionData,
  processContradictionDetection,
} from "./processors/contradiction-detection.js";
import { type DocumentProcessingData, processDocument } from "./processors/example.js";
import {
  type FeedbackSyncData,
  type FeedbackWebhookData,
  processFeedbackSync,
  processFeedbackWebhook,
} from "./processors/feedback-ingestion.js";
import {
  type InsightExtractionData,
  processInsightExtraction,
} from "./processors/insight-extraction.js";
import { type JTBDExtractionData, processJTBDExtraction } from "./processors/jtbd-extraction.js";
import { type PRDGenerationData, processPRDGeneration } from "./processors/prd-generation.js";
import {
  type SentimentAnalysisData,
  processSentimentAnalysis,
} from "./processors/sentiment-analysis.js";
import { type SpikeDetectionData, processSpikeDetection } from "./processors/spike-detection.js";
import {
  type TrendAggregationData,
  processTrendAggregation,
} from "./processors/trend-aggregation.js";
import { connection } from "./queues/index.js";

console.log("[Worker] Starting background job processors...");

const documentWorker = new Worker<DocumentProcessingData>("document-processing", processDocument, {
  connection,
  concurrency: 5,
});

const insightWorker = new Worker<InsightExtractionData>(
  "insight-generation",
  processInsightExtraction,
  {
    connection,
    concurrency: 2,
  },
);

const feedbackSyncWorker = new Worker<FeedbackSyncData>(
  "feedback-ingestion",
  async (job) => {
    if (job.name === "webhook") {
      return processFeedbackWebhook(job as unknown as import("bullmq").Job<FeedbackWebhookData>);
    }
    return processFeedbackSync(job);
  },
  {
    connection,
    concurrency: 3,
  },
);

const sentimentWorker = new Worker<SentimentAnalysisData>(
  "sentiment-analysis",
  processSentimentAnalysis,
  {
    connection,
    concurrency: 2,
  },
);

const trendWorker = new Worker<TrendAggregationData>("trend-aggregation", processTrendAggregation, {
  connection,
  concurrency: 1,
});

const spikeWorker = new Worker<SpikeDetectionData>("spike-detection", processSpikeDetection, {
  connection,
  concurrency: 1,
});

const contradictionWorker = new Worker<ContradictionDetectionData>(
  "contradiction-detection",
  processContradictionDetection,
  {
    connection,
    concurrency: 1,
  },
);

const assumptionWorker = new Worker<AssumptionSurfacingData>(
  "assumption-surfacing",
  processAssumptionSurfacing,
  {
    connection,
    concurrency: 1,
  },
);

const competitiveWorker = new Worker<CompetitiveExtractionData>(
  "competitive-extraction",
  processCompetitiveExtraction,
  {
    connection,
    concurrency: 2,
  },
);

const jtbdWorker = new Worker<JTBDExtractionData>("jtbd-extraction", processJTBDExtraction, {
  connection,
  concurrency: 1,
});

const prdWorker = new Worker<PRDGenerationData>("prd-generation", processPRDGeneration, {
  connection,
  concurrency: 1,
});

function handleWorkerEvents(worker: Worker, name: string) {
  worker.on("completed", (job) => {
    console.log(`[${name}] Job ${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[${name}] Job ${job?.id} failed:`, err.message);
  });
  worker.on("error", (err) => {
    console.error(`[${name}] Worker error:`, err);
  });
}

handleWorkerEvents(documentWorker, "DocumentWorker");
handleWorkerEvents(insightWorker, "InsightWorker");
handleWorkerEvents(feedbackSyncWorker, "FeedbackSyncWorker");
handleWorkerEvents(sentimentWorker, "SentimentWorker");
handleWorkerEvents(trendWorker, "TrendWorker");
handleWorkerEvents(spikeWorker, "SpikeWorker");
handleWorkerEvents(contradictionWorker, "ContradictionWorker");
handleWorkerEvents(assumptionWorker, "AssumptionWorker");
handleWorkerEvents(competitiveWorker, "CompetitiveWorker");
handleWorkerEvents(jtbdWorker, "JTBDWorker");
handleWorkerEvents(prdWorker, "PRDWorker");

async function shutdown() {
  console.log("[Worker] Shutting down...");
  await documentWorker.close();
  await insightWorker.close();
  await feedbackSyncWorker.close();
  await sentimentWorker.close();
  await trendWorker.close();
  await spikeWorker.close();
  await contradictionWorker.close();
  await assumptionWorker.close();
  await competitiveWorker.close();
  await jtbdWorker.close();
  await prdWorker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[Worker] All processors running. Waiting for jobs...");
