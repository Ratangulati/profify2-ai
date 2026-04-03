import { createProvider, surfaceAssumptions, type SpecSection } from "@pm-yc/ai";
import { db } from "@pm-yc/db";
import type { Job } from "bullmq";

import { env } from "../env.js";

// ── Job data types ─────────────────────────────────────────────────────

export interface AssumptionSurfacingData {
  projectId: string;
  specId: string;
}

// ── Main processor ─────────────────────────────────────────────────────

export async function processAssumptionSurfacing(job: Job<AssumptionSurfacingData>) {
  const { projectId, specId } = job.data;

  console.log(`[AssumptionSurfacing] Analyzing spec ${specId} in project ${projectId}`);

  // 1. Load the spec content
  const spec = await db.spec.findUnique({
    where: { id: specId },
    select: {
      id: true,
      title: true,
      content: true,
      projectId: true,
    },
  });

  if (!spec || spec.projectId !== projectId) {
    console.log(`[AssumptionSurfacing] Spec not found or project mismatch`);
    return { assumptionsFound: 0 };
  }

  // 2. Parse spec content into sections
  const sections = extractSections(spec.content as Record<string, unknown>);

  if (sections.length === 0) {
    console.log(`[AssumptionSurfacing] No sections found in spec`);
    return { assumptionsFound: 0 };
  }

  await job.updateProgress(20);

  // 3. Run LLM assumption surfacing
  const provider = createProvider({
    type: "openai",
    apiKey: env.OPENAI_API_KEY,
  });

  const result = await surfaceAssumptions(provider, {
    id: spec.id,
    title: spec.title,
    sections,
  });

  await job.updateProgress(70);

  // 4. Persist assumptions
  let created = 0;
  for (const a of result.assumptions) {
    await db.assumption.create({
      data: {
        projectId,
        specId,
        assumption: a.assumption,
        category: a.category,
        quoteText: a.quoteText,
        sectionRef: a.sectionRef,
        riskLevel: a.riskLevel,
        validationStatus: "UNVALIDATED",
        suggestion: a.suggestion,
      },
    });
    created++;
  }

  await job.updateProgress(100);
  console.log(`[AssumptionSurfacing] Found ${created} assumptions in spec ${specId}`);
  return { assumptionsFound: created, sectionsScanned: result.sectionsScanned };
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Extract sections from a spec's JSON content.
 * Supports flat objects where keys are section names and values are text,
 * and arrays of {title, content} objects.
 */
function extractSections(content: Record<string, unknown>): SpecSection[] {
  const sections: SpecSection[] = [];

  // Handle array-of-sections format: [{title, content}]
  if (Array.isArray(content)) {
    for (const item of content) {
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        const ref = String(obj.title ?? obj.heading ?? obj.name ?? "untitled");
        const text = String(obj.content ?? obj.body ?? obj.text ?? "");
        if (text) sections.push({ sectionRef: ref, content: text });
      }
    }
    return sections;
  }

  // Handle flat object format: { sectionName: text }
  for (const [key, value] of Object.entries(content)) {
    if (typeof value === "string" && value.trim()) {
      sections.push({ sectionRef: key, content: value });
    } else if (typeof value === "object" && value !== null) {
      // Nested section: try to extract text
      const obj = value as Record<string, unknown>;
      const text = String(obj.content ?? obj.body ?? obj.text ?? "");
      if (text) sections.push({ sectionRef: key, content: text });
    }
  }

  return sections;
}
