import { db } from "@pm-yc/db";

interface SearchResult {
  type: "insight" | "spec" | "decision" | "feedback" | "theme" | "opportunity";
  id: string;
  title: string;
  snippet: string;
  relevance_score: number;
}

/**
 * Search across all entity types within a project.
 * Returns merged, sorted results.
 */
export async function searchAllEntities(
  projectId: string,
  query: string,
  limit: number = 20,
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const results: SearchResult[] = [];

  // Run all queries in parallel
  const [insights, specs, decisions, feedback, themes, opportunities] = await Promise.all([
    db.insight.findMany({
      where: {
        projectId,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit,
      select: { id: true, title: true, description: true },
    }),
    db.spec.findMany({
      where: {
        projectId,
        OR: [{ title: { contains: q, mode: "insensitive" } }],
      },
      take: limit,
      select: { id: true, title: true, type: true },
    }),
    db.decision.findMany({
      where: {
        projectId,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { rationale: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit,
      select: { id: true, title: true, rationale: true },
    }),
    db.feedbackItem.findMany({
      where: {
        projectId,
        content: { contains: q, mode: "insensitive" },
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: { id: true, content: true, customerName: true },
    }),
    db.theme.findMany({
      where: {
        projectId,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit,
      select: { id: true, title: true, description: true },
    }),
    db.opportunity.findMany({
      where: {
        projectId,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit,
      select: { id: true, title: true, description: true },
    }),
  ]);

  const lowerQ = q.toLowerCase();

  for (const i of insights) {
    results.push({
      type: "insight",
      id: i.id,
      title: i.title,
      snippet: truncate(i.description, 200),
      relevance_score: scoreMatch(i.title, i.description, lowerQ),
    });
  }

  for (const s of specs) {
    results.push({
      type: "spec",
      id: s.id,
      title: s.title,
      snippet: `Type: ${s.type}`,
      relevance_score: scoreMatch(s.title, "", lowerQ),
    });
  }

  for (const d of decisions) {
    results.push({
      type: "decision",
      id: d.id,
      title: d.title,
      snippet: truncate(d.rationale, 200),
      relevance_score: scoreMatch(d.title, d.rationale, lowerQ),
    });
  }

  for (const f of feedback) {
    results.push({
      type: "feedback",
      id: f.id,
      title: f.customerName ?? "Feedback",
      snippet: truncate(f.content, 200),
      relevance_score: scoreMatch("", f.content, lowerQ),
    });
  }

  for (const t of themes) {
    results.push({
      type: "theme",
      id: t.id,
      title: t.title,
      snippet: truncate(t.description ?? "", 200),
      relevance_score: scoreMatch(t.title, t.description ?? "", lowerQ),
    });
  }

  for (const o of opportunities) {
    results.push({
      type: "opportunity",
      id: o.id,
      title: o.title,
      snippet: truncate(o.description ?? "", 200),
      relevance_score: scoreMatch(o.title, o.description ?? "", lowerQ),
    });
  }

  results.sort((a, b) => b.relevance_score - a.relevance_score);
  return results.slice(0, limit);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

function scoreMatch(title: string, body: string, query: string): number {
  const lowerTitle = title.toLowerCase();
  const lowerBody = body.toLowerCase();

  if (lowerTitle === query) return 1.0;
  if (lowerTitle.includes(query)) return 0.8;
  if (lowerBody.includes(query)) return 0.5;
  return 0.3;
}
