// apps/api/src/services/copilot/tools.ts
import { db } from "@pm-yc/db";

// ── Tool definitions (passed to the LLM as system context) ────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export const COPILOT_TOOLS: ToolDefinition[] = [
  {
    name: "search_insights",
    description:
      "Search across all insights by keyword. Returns top matches with severity scores and supporting quotes.",
    parameters: {
      query: { type: "string", description: "Search query", required: true },
      type: {
        type: "string",
        description: "Filter by type: PAIN_POINT, DESIRE, OBSERVATION, TREND, OPPORTUNITY",
      },
    },
  },
  {
    name: "search_feedback",
    description:
      "Search raw feedback items by content. Returns verbatim customer quotes with sentiment and segment tags.",
    parameters: {
      query: { type: "string", description: "Search query", required: true },
      segment: { type: "string", description: "Filter by user segment tag" },
    },
  },
  {
    name: "get_decisions",
    description:
      "Look up past product decisions by keyword or feature area. Returns decisions with rationale and outcomes.",
    parameters: {
      query: { type: "string", description: "Search keyword or feature area", required: true },
    },
  },
  {
    name: "lookup_spec",
    description:
      "Load a spec document by title search. Returns spec content, status, and version info.",
    parameters: {
      title: { type: "string", description: "Spec title or partial match", required: true },
    },
  },
  {
    name: "get_analytics",
    description:
      "Get opportunity scores and theme trends. Returns top opportunities ranked by composite score and themes with feedback counts.",
    parameters: {
      focus: {
        type: "string",
        description: "Optional: 'opportunities' or 'themes' to narrow results",
      },
    },
  },
];

// ── Tool execution ────────────────────────────────────────────────────

export interface ToolCall {
  name: string;
  input: Record<string, string>;
}

export interface ToolResult {
  tool: string;
  input: Record<string, string>;
  result: unknown;
  durationMs: number;
}

export async function executeTool(projectId: string, call: ToolCall): Promise<ToolResult> {
  const start = Date.now();
  let result: unknown;

  switch (call.name) {
    case "search_insights":
      result = await searchInsights(projectId, call.input.query!, call.input.type);
      break;
    case "search_feedback":
      result = await searchFeedback(projectId, call.input.query!, call.input.segment);
      break;
    case "get_decisions":
      result = await getDecisions(projectId, call.input.query!);
      break;
    case "lookup_spec":
      result = await lookupSpec(projectId, call.input.title!);
      break;
    case "get_analytics":
      result = await getAnalytics(projectId, call.input.focus);
      break;
    default:
      result = { error: `Unknown tool: ${call.name}` };
  }

  return {
    tool: call.name,
    input: call.input,
    result,
    durationMs: Date.now() - start,
  };
}

// ── Tool implementations ──────────────────────────────────────────────

async function searchInsights(projectId: string, query: string, type?: string) {
  const where: Record<string, unknown> = {
    projectId,
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
    ],
  };
  if (type) where.type = type;

  const insights = await db.insight.findMany({
    where,
    orderBy: { severityScore: "desc" },
    take: 10,
    include: { insightEvidence: { take: 3, select: { quote: true } } },
  });

  return insights.map((i) => ({
    id: i.id,
    title: i.title,
    type: i.type,
    severity: i.severityScore,
    frequency: i.frequencyCount,
    trend: i.trend,
    quotes: i.insightEvidence.map((e) => e.quote),
  }));
}

async function searchFeedback(projectId: string, query: string, segment?: string) {
  const where: Record<string, unknown> = {
    projectId,
    content: { contains: query, mode: "insensitive" },
  };
  if (segment) where.segmentTags = { has: segment };

  const items = await db.feedbackItem.findMany({
    where,
    take: 15,
    orderBy: { ingestedAt: "desc" },
    select: {
      id: true,
      content: true,
      sentiment: true,
      customerName: true,
      segmentTags: true,
      sourceRef: true,
      ingestedAt: true,
    },
  });

  return items.map((f) => ({
    id: f.id,
    content: f.content.slice(0, 300),
    sentiment: f.sentiment,
    customer: f.customerName,
    segments: f.segmentTags,
    source: f.sourceRef,
    date: f.ingestedAt?.toISOString() ?? null,
  }));
}

async function getDecisions(projectId: string, query: string) {
  const decisions = await db.decision.findMany({
    where: {
      projectId,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { rationale: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      rationale: true,
      outcome: true,
      status: true,
      decidedAt: true,
    },
  });

  return decisions.map((d) => ({
    id: d.id,
    title: d.title,
    rationale: d.rationale,
    outcome: d.outcome,
    status: d.status,
    decidedAt: d.decidedAt?.toISOString() ?? null,
  }));
}

async function lookupSpec(projectId: string, title: string) {
  const spec = await db.spec.findFirst({
    where: {
      projectId,
      title: { contains: title, mode: "insensitive" },
    },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        select: { content: true, version: true },
      },
    },
  });

  if (!spec) return { error: `No spec found matching "${title}"` };

  const latestVersion = spec.versions[0];
  const content = latestVersion?.content ?? spec.content;
  const contentStr = typeof content === "string" ? content : JSON.stringify(content);

  return {
    id: spec.id,
    title: spec.title,
    type: spec.type,
    status: spec.status,
    version: latestVersion?.version ?? 1,
    content: contentStr.slice(0, 3000),
  };
}

async function getAnalytics(projectId: string, focus?: string) {
  const result: Record<string, unknown> = {};

  if (!focus || focus === "opportunities") {
    const opportunities = await db.opportunity.findMany({
      where: { projectId },
      orderBy: { compositeScore: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        status: true,
        compositeScore: true,
        riceScore: true,
        effortEstimate: true,
      },
    });
    result.topOpportunities = opportunities;
  }

  if (!focus || focus === "themes") {
    const themes = await db.theme.findMany({
      where: { projectId },
      orderBy: { feedbackCount: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        feedbackCount: true,
        description: true,
      },
    });
    result.topThemes = themes;
  }

  return result;
}

// ── Format tools for system prompt ────────────────────────────────────

export function formatToolsForPrompt(): string {
  const toolDescriptions = COPILOT_TOOLS.map((t) => {
    const params = Object.entries(t.parameters)
      .map(
        ([name, p]) => `  - ${name} (${p.type}${p.required ? ", required" : ""}): ${p.description}`,
      )
      .join("\n");
    return `${t.name}: ${t.description}\nParameters:\n${params}`;
  }).join("\n\n");

  return `You have access to these tools. To use a tool, respond with EXACTLY this format on its own line:
TOOL_CALL: {"name": "tool_name", "input": {"param": "value"}}

Only use one tool call per response. After receiving tool results, continue your answer.

Available tools:
${toolDescriptions}`;
}

/** Parse a TOOL_CALL from the LLM response text */
export function parseToolCall(text: string): ToolCall | null {
  const match = text.match(/TOOL_CALL:\s*(\{[\s\S]*?\})\s*$/m);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]!) as { name: string; input: Record<string, string> };
    const validNames = new Set(COPILOT_TOOLS.map((t) => t.name));
    if (!validNames.has(parsed.name)) return null;
    return { name: parsed.name, input: parsed.input ?? {} };
  } catch {
    return null;
  }
}
