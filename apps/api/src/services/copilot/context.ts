// apps/api/src/services/copilot/context.ts
import { db } from "@pm-yc/db";

// ── Types ──────────────────────────────────────────────────────────────

export interface ActiveContext {
  specId?: string;
  specTitle?: string;
  sectionContent?: string;
}

export interface Mention {
  type: "spec" | "insight" | "theme" | "decision";
  id: string;
  title: string;
}

export interface AssembledContext {
  systemPrompt: string;
  conversationMessages: Array<{ role: "user" | "assistant"; content: string }>;
}

// ── System prompt ─────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are a senior product management assistant with deep knowledge of this product and its users. You have access to all customer feedback, product specs, user research, analytics data, and past decisions for this project.

Your capabilities:
- Answer questions about user needs, citing specific evidence
- Help write and refine specs, user stories, and documents
- Analyze trends in feedback
- Compare opportunities and recommend priorities
- Prepare for user interviews by suggesting questions
- Generate competitive analysis
- Draft stakeholder communications
- Explain past decisions and their rationale

Rules:
- Always cite specific evidence when making claims about user needs
- Distinguish between evidence-based claims and your own reasoning
- If you don't have relevant data, say so — don't fabricate evidence
- Be concise but thorough
- Proactively suggest related insights the PM might not have considered

When citing evidence, use this format: [Type: Title](id) — e.g., [Insight: Onboarding drop-off](ins_abc)`;

// ── Project context ───────────────────────────────────────────────────

async function loadProjectContext(projectId: string): Promise<string> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      name: true,
      description: true,
      personas: {
        take: 5,
        select: { name: true, goals: true },
      },
      scoringConfig: {
        select: {
          strategicBets: {
            where: { active: true },
            take: 5,
            select: { statement: true },
          },
        },
      },
    },
  });

  const sections: string[] = [`PROJECT: ${project.name}`];

  if (project.description) {
    sections.push(`DESCRIPTION: ${project.description}`);
  }

  if (project.scoringConfig?.strategicBets.length) {
    const bets = project.scoringConfig.strategicBets.map((b) => `- ${b.statement}`).join("\n");
    sections.push(`STRATEGIC BETS:\n${bets}`);
  }

  if (project.personas.length > 0) {
    const personaText = project.personas
      .map((p) => {
        const goals = Array.isArray(p.goals) ? (p.goals as string[]).join(", ") : "";
        return `- ${p.name}${goals ? ` (goals: ${goals})` : ""}`;
      })
      .join("\n");
    sections.push(`ACTIVE PERSONAS:\n${personaText}`);
  }

  return sections.join("\n\n");
}

// ── Conversation history ──────────────────────────────────────────────

async function loadConversationHistory(
  threadId: string,
  limit: number = 20,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const messages = await db.copilotMessage.findMany({
    where: { threadId, role: { in: ["USER", "ASSISTANT"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { role: true, content: true },
  });

  return messages.reverse().map((m) => ({
    role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));
}

// ── Active context ────────────────────────────────────────────────────

function formatActiveContext(active: ActiveContext | null): string {
  if (!active?.specId) return "";

  const parts: string[] = [`CURRENTLY OPEN: Spec "${active.specTitle ?? active.specId}"`];
  if (active.sectionContent) {
    const trimmed = active.sectionContent.slice(0, 2000);
    parts.push(`SECTION CONTENT:\n${trimmed}`);
  }
  return parts.join("\n");
}

// ── Retrieved context (evidence) ──────────────────────────────────────

async function retrieveEvidence(
  projectId: string,
  query: string,
  mentions: Mention[],
): Promise<string> {
  const sections: string[] = [];

  // Load any @-mentioned entities directly
  for (const mention of mentions) {
    const text = await loadMentionedEntity(mention);
    if (text) sections.push(text);
  }

  // Text search across key entity types
  const lowerQuery = query.toLowerCase();

  const [insights, specs, decisions, feedback, themes] = await Promise.all([
    db.insight.findMany({
      where: {
        projectId,
        OR: [
          { title: { contains: lowerQuery, mode: "insensitive" } },
          { description: { contains: lowerQuery, mode: "insensitive" } },
        ],
      },
      orderBy: { severityScore: "desc" },
      take: 10,
      include: {
        insightEvidence: { take: 2, select: { quote: true } },
      },
    }),
    db.spec.findMany({
      where: {
        projectId,
        OR: [{ title: { contains: lowerQuery, mode: "insensitive" } }],
      },
      take: 5,
      select: { id: true, title: true, type: true, status: true },
    }),
    db.decision.findMany({
      where: {
        projectId,
        OR: [
          { title: { contains: lowerQuery, mode: "insensitive" } },
          { rationale: { contains: lowerQuery, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: { id: true, title: true, rationale: true, status: true },
    }),
    db.feedbackItem.findMany({
      where: {
        projectId,
        content: { contains: lowerQuery, mode: "insensitive" },
      },
      take: 10,
      select: { id: true, content: true, sentiment: true, customerName: true, segmentTags: true },
    }),
    db.theme.findMany({
      where: {
        projectId,
        OR: [
          { title: { contains: lowerQuery, mode: "insensitive" } },
          { description: { contains: lowerQuery, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: { id: true, title: true, feedbackCount: true, description: true },
    }),
  ]);

  if (insights.length > 0) {
    const text = insights
      .map((i) => {
        const quotes = i.insightEvidence.map((e) => `"${e.quote}"`).join("; ");
        return `- [Insight: ${i.title}](${i.id}) — severity ${i.severityScore.toFixed(1)}, type ${i.type}${quotes ? `, quotes: ${quotes}` : ""}`;
      })
      .join("\n");
    sections.push(`RELEVANT INSIGHTS:\n${text}`);
  }

  if (specs.length > 0) {
    const text = specs
      .map((s) => `- [Spec: ${s.title}](${s.id}) — ${s.type}, ${s.status}`)
      .join("\n");
    sections.push(`RELEVANT SPECS:\n${text}`);
  }

  if (decisions.length > 0) {
    const text = decisions
      .map(
        (d) =>
          `- [Decision: ${d.title}](${d.id}) — ${d.status}, rationale: ${d.rationale.slice(0, 150)}`,
      )
      .join("\n");
    sections.push(`RELEVANT DECISIONS:\n${text}`);
  }

  if (feedback.length > 0) {
    const text = feedback
      .map(
        (f) =>
          `- [Feedback](${f.id}) from ${f.customerName ?? "anonymous"} (${f.sentiment}): "${f.content.slice(0, 200)}"`,
      )
      .join("\n");
    sections.push(`RELEVANT FEEDBACK:\n${text}`);
  }

  if (themes.length > 0) {
    const text = themes
      .map(
        (t) =>
          `- [Theme: ${t.title}](${t.id}) — ${t.feedbackCount} items${t.description ? `, ${t.description.slice(0, 100)}` : ""}`,
      )
      .join("\n");
    sections.push(`RELEVANT THEMES:\n${text}`);
  }

  return sections.join("\n\n");
}

async function loadMentionedEntity(mention: Mention): Promise<string | null> {
  switch (mention.type) {
    case "spec": {
      const spec = await db.spec.findUnique({
        where: { id: mention.id },
        select: { id: true, title: true, type: true, status: true, content: true },
      });
      if (!spec) return null;
      const content =
        typeof spec.content === "string" ? spec.content : JSON.stringify(spec.content);
      return `MENTIONED SPEC: [${spec.title}](${spec.id})\nType: ${spec.type}, Status: ${spec.status}\nContent preview: ${content.slice(0, 1000)}`;
    }
    case "insight": {
      const insight = await db.insight.findUnique({
        where: { id: mention.id },
        include: { insightEvidence: { take: 3, select: { quote: true } } },
      });
      if (!insight) return null;
      const quotes = insight.insightEvidence.map((e) => `"${e.quote}"`).join("; ");
      return `MENTIONED INSIGHT: [${insight.title}](${insight.id})\nType: ${insight.type}, Severity: ${insight.severityScore}, Frequency: ${insight.frequencyCount}\n${quotes ? `Quotes: ${quotes}` : ""}`;
    }
    case "theme": {
      const theme = await db.theme.findUnique({
        where: { id: mention.id },
        select: { id: true, title: true, description: true, feedbackCount: true },
      });
      if (!theme) return null;
      return `MENTIONED THEME: [${theme.title}](${theme.id})\nFeedback count: ${theme.feedbackCount}\n${theme.description ?? ""}`;
    }
    case "decision": {
      const decision = await db.decision.findUnique({
        where: { id: mention.id },
        select: { id: true, title: true, rationale: true, outcome: true, status: true },
      });
      if (!decision) return null;
      return `MENTIONED DECISION: [${decision.title}](${decision.id})\nStatus: ${decision.status}\nRationale: ${decision.rationale}\nOutcome: ${decision.outcome ?? "pending"}`;
    }
    default:
      return null;
  }
}

// ── Main assembly ─────────────────────────────────────────────────────

export async function assembleContext(opts: {
  projectId: string;
  threadId: string | null;
  message: string;
  mentions: Mention[];
  activeContext: ActiveContext | null;
  commandPromptSuffix?: string;
}): Promise<AssembledContext> {
  // Load all context layers in parallel
  const [projectCtx, history, evidence] = await Promise.all([
    loadProjectContext(opts.projectId),
    opts.threadId ? loadConversationHistory(opts.threadId) : Promise.resolve([]),
    retrieveEvidence(opts.projectId, opts.message, opts.mentions),
  ]);

  const activeCtx = formatActiveContext(opts.activeContext);

  // Build system prompt with all context
  const contextSections = [projectCtx, activeCtx, evidence].filter(Boolean);
  const contextBlock =
    contextSections.length > 0
      ? `\n\n--- PROJECT KNOWLEDGE ---\n${contextSections.join("\n\n")}\n--- END KNOWLEDGE ---`
      : "";

  const commandSuffix = opts.commandPromptSuffix ? `\n\n${opts.commandPromptSuffix}` : "";

  const systemPrompt = BASE_SYSTEM_PROMPT + contextBlock + commandSuffix;

  return {
    systemPrompt,
    conversationMessages: history,
  };
}
