import { db } from "@pm-yc/db";

/**
 * Load a spec with its latest version, evidence, and assumptions.
 */
export async function loadSpecWithContext(specId: string) {
  return db.spec.findUniqueOrThrow({
    where: { id: specId },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
      },
      evidence: {
        include: {
          insight: {
            select: {
              id: true,
              title: true,
              type: true,
              severityScore: true,
              description: true,
            },
          },
          feedbackItem: {
            select: {
              id: true,
              content: true,
              customerName: true,
              segmentTags: true,
            },
          },
        },
      },
      assumptions: {
        select: {
          id: true,
          assumption: true,
          category: true,
          riskLevel: true,
          sectionRef: true,
          validationStatus: true,
          suggestion: true,
        },
      },
    },
  });
}

/**
 * Find a spec by title search within a project.
 */
export async function findSpecByTitle(projectId: string, featureName: string) {
  return db.spec.findFirst({
    where: {
      projectId,
      title: { contains: featureName, mode: "insensitive" },
    },
    select: { id: true },
  });
}

/**
 * Load a spec with just the essentials (for resource listing).
 */
export async function loadSpecSummary(specId: string) {
  return db.spec.findUniqueOrThrow({
    where: { id: specId },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        select: { version: true, content: true },
      },
      _count: {
        select: { evidence: true, assumptions: true },
      },
    },
  });
}
