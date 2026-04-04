import {
  createProvider,
  generatePRD,
  extractCitations,
  type EvidencePackage,
  type EvidencePainPoint,
  type EvidenceDesire,
  type EvidenceCompetitor,
  type EvidenceJTBD,
  type EvidenceTheme,
} from "@pm-yc/ai";
import { db } from "@pm-yc/db";
import type { Job } from "bullmq";

import { env } from "../env.js";

// ── Job Data ─────────────────────────────────────────────────────────

export interface PRDGenerationData {
  projectId: string;
  opportunityId: string;
  /** Optional: specific insight IDs to include (if generating from insights rather than opportunity) */
  insightIds?: string[];
}

// ── Evidence Assembly ────────────────────────────────────────────────

async function assembleEvidencePackage(
  projectId: string,
  opportunityId: string,
  extraInsightIds: string[] = [],
): Promise<EvidencePackage> {
  // Load opportunity with linked insights and themes
  const opportunity = await db.opportunity.findUniqueOrThrow({
    where: { id: opportunityId },
    include: {
      linkedInsights: {
        include: {
          insight: {
            include: {
              insightEvidence: {
                include: {
                  feedbackItem: {
                    select: {
                      id: true,
                      content: true,
                      segmentTags: true,
                      customerName: true,
                    },
                  },
                },
                take: 5,
              },
              theme: { select: { id: true, title: true, feedbackCount: true } },
            },
          },
        },
      },
      linkedThemes: {
        include: {
          theme: { select: { id: true, title: true, feedbackCount: true } },
        },
      },
    },
  });

  // Additional insights if provided
  const additionalInsights =
    extraInsightIds.length > 0
      ? await db.insight.findMany({
          where: { id: { in: extraInsightIds }, projectId },
          include: {
            insightEvidence: {
              include: {
                feedbackItem: {
                  select: { id: true, content: true, segmentTags: true, customerName: true },
                },
              },
              take: 5,
            },
            theme: { select: { id: true, title: true, feedbackCount: true } },
          },
        })
      : [];

  // Combine all insights
  const allInsights = [
    ...opportunity.linkedInsights.map((li) => li.insight),
    ...additionalInsights,
  ];

  // Deduplicate by ID
  const insightMap = new Map(allInsights.map((i) => [i.id, i]));
  const uniqueInsights = Array.from(insightMap.values());

  // Categorize insights
  const painPoints: EvidencePainPoint[] = [];
  const desires: EvidenceDesire[] = [];

  for (const insight of uniqueInsights) {
    const quotes = insight.insightEvidence.map((e) => e.quote).filter(Boolean);

    if (insight.type === "PAIN_POINT") {
      painPoints.push({
        id: insight.id,
        title: insight.title,
        description: insight.description,
        severity: insight.severityScore,
        frequency: insight.frequencyCount,
        quotes,
      });
    } else if (insight.type === "DESIRE") {
      desires.push({
        id: insight.id,
        title: insight.title,
        description: insight.description,
        frequency: insight.frequencyCount,
        quotes,
      });
    } else {
      // Observations, trends, opportunities → treat as pain points with lower severity
      painPoints.push({
        id: insight.id,
        title: insight.title,
        description: insight.description,
        severity: insight.severityScore,
        frequency: insight.frequencyCount,
        quotes,
      });
    }
  }

  // Collect themes
  const themeMap = new Map<string, EvidenceTheme>();
  for (const lt of opportunity.linkedThemes) {
    themeMap.set(lt.theme.id, {
      id: lt.theme.id,
      title: lt.theme.title,
      feedbackCount: lt.theme.feedbackCount,
    });
  }
  for (const insight of uniqueInsights) {
    if (insight.theme && !themeMap.has(insight.theme.id)) {
      themeMap.set(insight.theme.id, {
        id: insight.theme.id,
        title: insight.theme.title,
        feedbackCount: insight.theme.feedbackCount,
      });
    }
  }

  // Load competitive intelligence
  const competitorMentions = await db.competitorMention.findMany({
    where: { projectId },
    include: {
      competitor: { select: { name: true } },
      feedbackItem: { select: { content: true } },
    },
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  const competitors: EvidenceCompetitor[] = competitorMentions.map((cm) => ({
    competitorName: cm.competitor.name,
    featureArea: cm.featureArea,
    comparison: cm.comparisonType,
    quote: cm.verbatimQuote,
  }));

  // Load JTBDs
  const jtbds = await db.jTBD.findMany({
    where: { projectId },
    orderBy: { opportunityScore: "desc" },
    take: 10,
  });

  const jtbdEvidence: EvidenceJTBD[] = jtbds.map((j) => ({
    id: j.id,
    statement: j.statement,
    jobType: j.jobType,
    importance: j.importance,
    satisfaction: j.satisfaction,
  }));

  // Load existing specs for context
  const existingSpecs = await db.spec.findMany({
    where: { projectId, status: { not: "ARCHIVED" } },
    select: { id: true, title: true, type: true },
    take: 10,
    orderBy: { updatedAt: "desc" },
  });

  // Compute segment distribution across all evidence
  const segmentDistribution: Record<string, number> = {};
  for (const insight of uniqueInsights) {
    for (const ev of insight.insightEvidence) {
      for (const tag of ev.feedbackItem.segmentTags) {
        segmentDistribution[tag] = (segmentDistribution[tag] ?? 0) + 1;
      }
    }
  }

  return {
    opportunityTitle: opportunity.title,
    opportunityDescription: opportunity.description,
    painPoints,
    desires,
    themes: Array.from(themeMap.values()),
    competitors,
    jtbds: jtbdEvidence,
    analytics: [], // TODO: integrate analytics data source when available
    existingSpecs,
    segmentDistribution,
  };
}

// ── Main Processor ───────────────────────────────────────────────────

export async function processPRDGeneration(job: Job<PRDGenerationData>) {
  const { projectId, opportunityId, insightIds } = job.data;

  console.log(`[PRDGeneration] Generating PRD for opportunity ${opportunityId}`);

  // 1. Assemble evidence
  await job.updateProgress(10);
  const evidencePackage = await assembleEvidencePackage(projectId, opportunityId, insightIds);

  console.log(
    `[PRDGeneration] Evidence: ${evidencePackage.painPoints.length} pain points, ` +
      `${evidencePackage.desires.length} desires, ${evidencePackage.competitors.length} competitive mentions`,
  );

  await job.updateProgress(25);

  // 2. Generate PRD via LLM
  const provider = createProvider({
    type: "openai",
    apiKey: env.OPENAI_API_KEY,
  });

  const prd = await generatePRD(provider, evidencePackage);
  await job.updateProgress(60);

  // 3. Create Spec record
  const specContent = {
    sections: prd.sections.map((s) => ({
      id: s.id,
      title: s.title,
      content: s.content,
      evidenceStrength: s.evidenceStrength,
    })),
  };

  const spec = await db.spec.create({
    data: {
      projectId,
      title: prd.title,
      type: "PRD",
      status: "DRAFT",
      content: specContent,
      metadata: {
        generatedFrom: opportunityId,
        ...prd.metadata,
      },
    },
  });

  await job.updateProgress(70);

  // 4. Create initial SpecVersion
  await db.specVersion.create({
    data: {
      specId: spec.id,
      version: 1,
      content: specContent,
      changeNote: "AI-generated initial draft",
    },
  });

  await job.updateProgress(80);

  // 5. Auto-link citations as SpecEvidence records
  let citationsCreated = 0;
  for (const section of prd.sections) {
    for (const citation of section.citations) {
      const evidenceTypeMap: Record<string, string> = {
        insight: "INSIGHT",
        feedback_item: "FEEDBACK_ITEM",
        analytics: "ANALYTICS",
        competitive: "COMPETITIVE",
        jtbd: "JTBD",
      };

      const data: Record<string, unknown> = {
        specId: spec.id,
        sectionRef: section.id,
        citationRef: citation.citationRef,
        position: citation.position,
        versionNum: 1,
        evidenceType: evidenceTypeMap[citation.evidenceType] ?? "INSIGHT",
        note: citation.quote,
      };

      // Link to the appropriate record type
      if (citation.evidenceType === "insight") {
        // Verify the insight exists before linking
        const exists = await db.insight.findUnique({
          where: { id: citation.evidenceId },
          select: { id: true },
        });
        if (exists) data.insightId = citation.evidenceId;
      }

      await db.specEvidence.create({ data: data as never });
      citationsCreated++;
    }
  }

  await job.updateProgress(100);

  console.log(
    `[PRDGeneration] Created spec ${spec.id} with ${prd.sections.length} sections and ${citationsCreated} citations`,
  );

  return {
    specId: spec.id,
    title: prd.title,
    sectionCount: prd.sections.length,
    citationCount: citationsCreated,
    assumptionCount: prd.metadata.assumptionCount,
  };
}
