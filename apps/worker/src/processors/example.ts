import type { Job } from "bullmq";

export interface DocumentProcessingData {
  documentId: string;
  productId: string;
  storagePath: string;
}

export async function processDocument(job: Job<DocumentProcessingData>) {
  const { documentId, storagePath } = job.data;

  await job.updateProgress(10);
  console.log(`[Worker] Processing document ${documentId} from ${storagePath}`);

  // Step 1: Download from storage
  await job.updateProgress(30);

  // Step 2: Extract text
  await job.updateProgress(60);

  // Step 3: Generate embeddings / insights
  await job.updateProgress(90);

  await job.updateProgress(100);
  console.log(`[Worker] Document ${documentId} processed successfully`);

  return { documentId, status: "completed" };
}

export interface InsightGenerationData {
  productId: string;
  source: string;
  content: string;
}

export async function generateInsight(job: Job<InsightGenerationData>) {
  const { productId, source, content } = job.data;

  console.log(`[Worker] Generating insight for product ${productId} from ${source}`);

  await job.updateProgress(50);

  // Placeholder for AI-powered insight generation
  const insight = {
    productId,
    source,
    summary: `Insight generated from ${source}: ${content.slice(0, 100)}`,
  };

  await job.updateProgress(100);
  console.log(`[Worker] Insight generated for product ${productId}`);

  return insight;
}
