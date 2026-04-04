# PM Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a streaming AI copilot with full project context, function calling, @mentions, citations, and persistent chat history.

**Architecture:** New Prisma models (CopilotThread, CopilotMessage) + streaming LLM provider extension + Express SSE endpoint with RAG context assembly and function-calling loop + React frontend replacing existing ChatView with streaming message rendering, tool traces, and citation chips.

**Tech Stack:** Prisma (PostgreSQL), Express SSE, OpenAI/Anthropic streaming APIs, React, Tailwind CSS, Lucide icons

---

## File Structure

### Database

- Modify: `packages/db/prisma/schema.prisma` — add CopilotThread, CopilotMessage models + enums

### AI Package (streaming)

- Modify: `packages/ai/src/types.ts` — add StreamEvent type and streamComplete to LLMProvider
- Modify: `packages/ai/src/providers/openai.ts` — add streamComplete method
- Modify: `packages/ai/src/providers/anthropic.ts` — add streamComplete method
- Modify: `packages/ai/src/index.ts` — export new types

### API (copilot route)

- Create: `apps/api/src/routes/copilot.ts` — all copilot endpoints (chat SSE, threads, messages, feedback, mention search)
- Create: `apps/api/src/services/copilot/context.ts` — context assembly (project, history, active, retrieved)
- Create: `apps/api/src/services/copilot/commands.ts` — pre-built command detection and routing
- Create: `apps/api/src/services/copilot/tools.ts` — function-calling tool definitions and execution
- Create: `apps/api/src/services/copilot/stream.ts` — SSE streaming orchestrator (context + LLM + tool loop + persistence)
- Modify: `apps/api/src/routes/index.ts` — register copilot router

### Frontend (copilot UI)

- Create: `apps/web/src/components/copilot/CopilotPanel.tsx` — top-level container, thread management, streaming
- Create: `apps/web/src/components/copilot/CopilotInput.tsx` — input with @mentions, file upload
- Create: `apps/web/src/components/copilot/CommandChips.tsx` — pre-built command quick actions
- Create: `apps/web/src/components/copilot/MessageBubble.tsx` — message rendering with tool traces, citations, feedback
- Create: `apps/web/src/components/copilot/CitationChip.tsx` — inline clickable citation
- Create: `apps/web/src/components/copilot/MentionPopover.tsx` — @mention autocomplete dropdown
- Modify: `apps/web/src/components/workspace/AgentPanel.tsx` — replace ChatView with CopilotPanel, rename tab

---

### Task 1: Database Schema — CopilotThread and CopilotMessage

**Files:**

- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add enums and models to the Prisma schema**

Open `packages/db/prisma/schema.prisma` and append before the closing enums section (after the `StrategicBet` model around line 535). Add after the last model and before the enums:

```prisma
// ── Copilot ───────────────────────────────────────────────────────────

model CopilotThread {
  id        String   @id @default(cuid())
  title     String?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  projectId String  @map("project_id")
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  messages CopilotMessage[]

  @@index([projectId])
  @@map("copilot_threads")
}

model CopilotMessage {
  id            String              @id @default(cuid())
  role          CopilotMessageRole
  content       String
  mentions      Json?
  toolTrace     Json?               @map("tool_trace")
  citations     Json?
  feedback      CopilotFeedback?
  activeContext Json?               @map("active_context")
  commandType   String?             @map("command_type")
  createdAt     DateTime            @default(now()) @map("created_at")

  threadId String         @map("thread_id")
  thread   CopilotThread  @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@index([threadId, createdAt])
  @@map("copilot_messages")
}
```

Then add the enums at the bottom of the file after the existing enums:

```prisma
enum CopilotMessageRole {
  USER
  ASSISTANT
  SYSTEM
}

enum CopilotFeedback {
  POSITIVE
  NEGATIVE
}
```

Also add the `copilotThreads` relation to the `Project` model. Find the `Project` model and add this line in the relations list (after `featureOutcomes`):

```prisma
  copilotThreads     CopilotThread[]
```

- [ ] **Step 2: Generate Prisma client**

```bash
cd packages/db && npx prisma generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 3: Create migration**

```bash
cd packages/db && npx prisma migrate dev --name add_copilot_thread_and_message
```

Expected: Migration created and applied.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/
git commit -m "feat(db): add CopilotThread and CopilotMessage models"
```

---

### Task 2: Streaming LLM Provider Extension

**Files:**

- Modify: `packages/ai/src/types.ts`
- Modify: `packages/ai/src/providers/openai.ts`
- Modify: `packages/ai/src/providers/anthropic.ts`
- Modify: `packages/ai/src/index.ts`

- [ ] **Step 1: Add StreamEvent type and streamComplete to LLMProvider interface**

In `packages/ai/src/types.ts`, add the `StreamEvent` type after `EmbeddingResponse` and update `LLMProvider`:

```typescript
export interface StreamEvent {
  type: "content_delta" | "done";
  content?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

Update the `LLMProvider` interface to add `streamComplete`:

```typescript
export interface LLMProvider {
  readonly name: string;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  streamComplete(request: CompletionRequest): AsyncIterable<StreamEvent>;
  embed?(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
```

- [ ] **Step 2: Add streamComplete to OpenAI provider**

In `packages/ai/src/providers/openai.ts`, add this method to the `OpenAIProvider` class after the `complete` method:

```typescript
  async *streamComplete(request: CompletionRequest): AsyncIterable<StreamEvent> {
    const stream = await this.client.chat.completions.create({
      model: request.model ?? this.defaultModel,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      stream: true,
    });

    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield { type: "content_delta", content: delta };
      }

      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
      }
    }

    yield {
      type: "done",
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }
```

Also add `StreamEvent` to the type imports at the top of the file:

```typescript
import type {
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  LLMProvider,
  StreamEvent,
} from "../types";
```

- [ ] **Step 3: Add streamComplete to Anthropic provider**

In `packages/ai/src/providers/anthropic.ts`, add this method to the `AnthropicProvider` class after the `complete` method:

```typescript
  async *streamComplete(request: CompletionRequest): AsyncIterable<StreamEvent> {
    const systemMessage = request.messages.find((m) => m.role === "system");
    const nonSystemMessages = request.messages.filter((m) => m.role !== "system");

    const stream = this.client.messages.stream({
      model: request.model ?? this.defaultModel,
      max_tokens: request.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "content_delta", content: event.delta.text };
      }
    }

    const finalMessage = await stream.finalMessage();
    yield {
      type: "done",
      usage: {
        promptTokens: finalMessage.usage.input_tokens,
        completionTokens: finalMessage.usage.output_tokens,
        totalTokens:
          finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
      },
    };
  }
```

Also add `StreamEvent` to the type imports:

```typescript
import type { CompletionRequest, CompletionResponse, LLMProvider, StreamEvent } from "../types";
```

- [ ] **Step 4: Export StreamEvent from the AI package barrel**

In `packages/ai/src/index.ts`, add `StreamEvent` to the existing type export from `./types`:

Find the line:

```typescript
export type {
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from "./types";
```

Replace with:

```typescript
export type {
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  StreamEvent,
} from "./types";
```

- [ ] **Step 5: Type check**

```bash
cd packages/ai && npx tsc --noEmit
```

Expected: passes with no errors (or only pre-existing errors unrelated to our changes).

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/
git commit -m "feat(ai): add streaming support to LLM providers"
```

---

### Task 3: Copilot Backend — Context Assembly

**Files:**

- Create: `apps/api/src/services/copilot/context.ts`

- [ ] **Step 1: Create the context assembly module**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/copilot/context.ts
git commit -m "feat(api): add copilot context assembly with RAG pipeline"
```

---

### Task 4: Copilot Backend — Pre-Built Commands

**Files:**

- Create: `apps/api/src/services/copilot/commands.ts`

- [ ] **Step 1: Create the command detection module**

```typescript
// apps/api/src/services/copilot/commands.ts

export interface DetectedCommand {
  type: string;
  label: string;
  promptSuffix: string;
  extractedParam?: string;
}

interface CommandPattern {
  type: string;
  label: string;
  pattern: RegExp;
  paramGroup?: number;
  promptSuffix: string;
}

const COMMAND_PATTERNS: CommandPattern[] = [
  {
    type: "user_feedback",
    label: "User feedback",
    pattern: /what\s+did\s+users?\s+say\s+about\s+(.+?)[\s?.!]*$/i,
    paramGroup: 1,
    promptSuffix: `Focus on direct user quotes and feedback. Group by sentiment. Cite specific feedback items and insights. Format as: main themes, supporting quotes, sentiment breakdown.`,
  },
  {
    type: "past_decisions",
    label: "Past decisions",
    pattern:
      /have\s+we\s+considered\s+this\s+before|have\s+we\s+already\s+(decided|discussed|looked\s+at)/i,
    promptSuffix: `Search the decision log and past specs for related work. For each match, explain: what was decided, when, the rationale, and the outcome. If nothing was found, say so clearly.`,
  },
  {
    type: "feedback_summary",
    label: "Feedback summary",
    pattern: /summarize\s+(last\s+month'?s?|recent|this\s+month'?s?)\s+feedback/i,
    promptSuffix: `Provide a structured summary: top themes (with counts), sentiment trends, emerging issues, and notable individual feedback items. Use a clear structure with headers.`,
  },
  {
    type: "interview_prep",
    label: "Interview prep",
    pattern: /prep\s+me\s+for\s+an?\s+interview\s+with\s+(.+?)[\s?.!]*$/i,
    paramGroup: 1,
    promptSuffix: `Generate interview questions organized by: (1) knowledge gaps we have about this persona, (2) validation of existing assumptions, (3) discovery of unmet needs. For each question, explain what insight it's designed to uncover.`,
  },
  {
    type: "churn_analysis",
    label: "Churn analysis",
    pattern: /why\s+are\s+users?\s+(churning|leaving|cancell?ing)/i,
    promptSuffix: `Cross-reference pain points with churn-related feedback. Organize by: (1) top churn drivers ranked by severity and frequency, (2) supporting evidence for each, (3) segments most affected, (4) recommended actions.`,
  },
  {
    type: "stakeholder_update",
    label: "Stakeholder update",
    pattern: /write\s+a?\s*stakeholder\s+update|draft\s+a?\s*(weekly|monthly)?\s*update/i,
    promptSuffix: `Draft a concise stakeholder update email. Include: (1) key decisions made, (2) opportunities shipped or in progress, (3) important user feedback trends, (4) risks or blockers. Keep it under 300 words. Professional tone.`,
  },
  {
    type: "competitive_brief",
    label: "Competitive brief",
    pattern: /(?:draft\s+a?\s*)?competitive\s+brief\s+(?:for|on|about)\s+(.+?)[\s?.!]*$/i,
    paramGroup: 1,
    promptSuffix: `Generate a competitive analysis brief. Include: (1) how users compare us, (2) areas where we're favorable vs unfavorable, (3) switching signals, (4) feature gaps, (5) recommended response. Cite specific competitor mentions from feedback.`,
  },
];

export function detectCommand(message: string): DetectedCommand | null {
  for (const cmd of COMMAND_PATTERNS) {
    const match = message.match(cmd.pattern);
    if (match) {
      return {
        type: cmd.type,
        label: cmd.label,
        promptSuffix: cmd.promptSuffix,
        extractedParam: cmd.paramGroup ? match[cmd.paramGroup]?.trim() : undefined,
      };
    }
  }
  return null;
}

/** List of commands for the frontend quick-action chips */
export const QUICK_COMMANDS = COMMAND_PATTERNS.map((c) => ({
  type: c.type,
  label: c.label,
}));
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/copilot/commands.ts
git commit -m "feat(api): add copilot pre-built command detection"
```

---

### Task 5: Copilot Backend — Function-Calling Tools

**Files:**

- Create: `apps/api/src/services/copilot/tools.ts`

- [ ] **Step 1: Create the tools module**

```typescript
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
    orderBy: { receivedAt: "desc" },
    select: {
      id: true,
      content: true,
      sentiment: true,
      customerName: true,
      segmentTags: true,
      source: true,
      receivedAt: true,
    },
  });

  return items.map((f) => ({
    id: f.id,
    content: f.content.slice(0, 300),
    sentiment: f.sentiment,
    customer: f.customerName,
    segments: f.segmentTags,
    source: f.source,
    date: f.receivedAt?.toISOString() ?? null,
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/copilot/tools.ts
git commit -m "feat(api): add copilot function-calling tools"
```

---

### Task 6: Copilot Backend — SSE Stream Orchestrator

**Files:**

- Create: `apps/api/src/services/copilot/stream.ts`

- [ ] **Step 1: Create the streaming orchestrator**

```typescript
// apps/api/src/services/copilot/stream.ts
import { createProvider } from "@pm-yc/ai";
import type { ChatMessage } from "@pm-yc/ai";
import { db } from "@pm-yc/db";
import type { Response } from "express";

import { env } from "../../env.js";
import { assembleContext, type ActiveContext, type Mention } from "./context.js";
import { detectCommand } from "./commands.js";
import { executeTool, formatToolsForPrompt, parseToolCall, type ToolResult } from "./tools.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface ChatRequest {
  message: string;
  mentions: Mention[];
  activeContext: ActiveContext | null;
  threadId: string | null;
  projectId: string;
}

interface Citation {
  type: string;
  id: string;
  title: string;
  quote?: string;
}

// ── SSE helpers ───────────────────────────────────────────────────────

function sendSSE(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── Main streaming handler ────────────────────────────────────────────

export async function streamCopilotResponse(req: ChatRequest, res: Response) {
  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const { message, mentions, activeContext, projectId } = req;
  let { threadId } = req;

  try {
    // 1. Create or resolve thread
    if (!threadId) {
      const thread = await db.copilotThread.create({
        data: {
          projectId,
          title: message.slice(0, 100),
        },
      });
      threadId = thread.id;
      sendSSE(res, "thread_created", { threadId });
    }

    // 2. Detect pre-built command
    const command = detectCommand(message);

    // 3. Persist user message
    await db.copilotMessage.create({
      data: {
        threadId,
        role: "USER",
        content: message,
        mentions: mentions.length > 0 ? mentions : undefined,
        activeContext: activeContext ?? undefined,
        commandType: command?.type ?? undefined,
      },
    });

    // 4. Assemble context
    const context = await assembleContext({
      projectId,
      threadId,
      message,
      mentions,
      activeContext,
      commandPromptSuffix: command?.promptSuffix,
    });

    // 5. Build LLM messages
    const toolPrompt = formatToolsForPrompt();
    const systemContent = context.systemPrompt + "\n\n" + toolPrompt;

    const llmMessages: ChatMessage[] = [
      { role: "system", content: systemContent },
      ...context.conversationMessages,
      { role: "user", content: message },
    ];

    // 6. Create LLM provider
    const provider = createProvider({ type: "openai", apiKey: env.OPENAI_API_KEY });

    // 7. Function-calling loop (max 3 rounds)
    const toolTraces: ToolResult[] = [];
    let fullContent = "";
    const MAX_TOOL_ROUNDS = 3;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      // Collect full response for tool call detection
      let roundContent = "";

      for await (const event of provider.streamComplete({
        messages: llmMessages,
        temperature: 0.4,
        maxTokens: 4000,
      })) {
        if (event.type === "content_delta" && event.content) {
          roundContent += event.content;
          // Only stream content deltas on the final round (or if no tool call detected yet)
          // We buffer the full response first to check for tool calls
        }
      }

      // Check for tool call in the response
      const toolCall = parseToolCall(roundContent);

      if (toolCall && round < MAX_TOOL_ROUNDS) {
        // Tool call detected — execute it
        sendSSE(res, "tool_start", { tool: toolCall.name, input: toolCall.input });

        const toolResult = await executeTool(projectId, toolCall);
        toolTraces.push(toolResult);

        sendSSE(res, "tool_result", {
          tool: toolResult.tool,
          results: Array.isArray(toolResult.result) ? (toolResult.result as unknown[]).length : 1,
          durationMs: toolResult.durationMs,
        });

        // Strip the TOOL_CALL line from content and add to conversation
        const contentBeforeToolCall = roundContent.replace(/TOOL_CALL:.*$/m, "").trim();
        if (contentBeforeToolCall) {
          llmMessages.push({ role: "assistant", content: contentBeforeToolCall });
        }

        // Add tool result as user message for next round
        llmMessages.push({
          role: "user",
          content: `Tool result for ${toolCall.name}:\n${JSON.stringify(toolResult.result, null, 2)}`,
        });

        continue; // Next round
      }

      // No tool call — this is the final response. Stream it.
      // Since we already collected the full content, send it in chunks to simulate streaming
      const CHUNK_SIZE = 20;
      for (let i = 0; i < roundContent.length; i += CHUNK_SIZE) {
        const chunk = roundContent.slice(i, i + CHUNK_SIZE);
        sendSSE(res, "content_delta", { text: chunk });
      }
      fullContent = roundContent;
      break;
    }

    // 8. Extract citations from the response
    const citations = extractCitations(fullContent);
    for (const citation of citations) {
      sendSSE(res, "citation", citation);
    }

    // 9. Persist assistant message
    const assistantMsg = await db.copilotMessage.create({
      data: {
        threadId,
        role: "ASSISTANT",
        content: fullContent,
        toolTrace: toolTraces.length > 0 ? toolTraces : undefined,
        citations: citations.length > 0 ? citations : undefined,
      },
    });

    sendSSE(res, "done", { messageId: assistantMsg.id });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
    sendSSE(res, "error", { message: errorMessage });
  } finally {
    res.end();
  }
}

// ── Citation extraction ───────────────────────────────────────────────

function extractCitations(content: string): Citation[] {
  const citations: Citation[] = [];
  // Match pattern: [Type: Title](id)
  const regex = /\[(Insight|Spec|Decision|Theme|Feedback):\s*([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    citations.push({
      type: match[1]!.toLowerCase(),
      id: match[3]!,
      title: match[2]!.trim(),
    });
  }

  // Deduplicate by id
  const seen = new Set<string>();
  return citations.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/copilot/stream.ts
git commit -m "feat(api): add copilot SSE streaming orchestrator with tool loop"
```

---

### Task 7: Copilot Backend — Express Routes

**Files:**

- Create: `apps/api/src/routes/copilot.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Create the copilot route**

```typescript
// apps/api/src/routes/copilot.ts
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { enforceWorkspace, requireRole } from "../middleware/workspace.js";
import { streamCopilotResponse } from "../services/copilot/stream.js";
import { db } from "@pm-yc/db";

const router = Router();

// ── Schemas ───────────────────────────────────────────────────────────

const chatSchema = z.object({
  message: z.string().min(1).max(5000),
  mentions: z
    .array(
      z.object({
        type: z.enum(["spec", "insight", "theme", "decision"]),
        id: z.string(),
        title: z.string(),
      }),
    )
    .default([]),
  activeContext: z
    .object({
      specId: z.string().optional(),
      specTitle: z.string().optional(),
      sectionContent: z.string().max(5000).optional(),
    })
    .nullable()
    .default(null),
  threadId: z.string().nullable().default(null),
});

const feedbackSchema = z.object({
  feedback: z.enum(["POSITIVE", "NEGATIVE"]).nullable(),
});

const mentionSearchSchema = z.object({
  query: z.string().min(1).max(200),
  types: z
    .array(z.enum(["spec", "insight", "theme", "decision"]))
    .default(["spec", "insight", "theme", "decision"]),
});

// ── POST /copilot/chat (SSE streaming) ────────────────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/copilot/chat",
  authenticate,
  enforceWorkspace,
  requireRole("project", "write"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const parsed = chatSchema.parse(req.body);

      await streamCopilotResponse(
        {
          message: parsed.message,
          mentions: parsed.mentions,
          activeContext: parsed.activeContext,
          threadId: parsed.threadId,
          projectId,
        },
        res,
      );
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Copilot chat failed";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /copilot/threads ──────────────────────────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/copilot/threads",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;

      const threads = await db.copilotThread.findMany({
        where: { projectId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
      });

      res.json({
        success: true,
        data: {
          threads: threads.map((t) => ({
            id: t.id,
            title: t.title,
            messageCount: t._count.messages,
            updatedAt: t.updatedAt.toISOString(),
          })),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list threads";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── GET /copilot/threads/:threadId/messages ───────────────────────────

router.get(
  "/workspaces/:workspaceId/projects/:projectId/copilot/threads/:threadId/messages",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const threadId = req.params.threadId as string;
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const before = req.query.before as string | undefined;

      const where: Record<string, unknown> = { threadId };
      if (before) {
        where.createdAt = { lt: new Date(before) };
      }

      const messages = await db.copilotMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        select: {
          id: true,
          role: true,
          content: true,
          mentions: true,
          toolTrace: true,
          citations: true,
          feedback: true,
          commandType: true,
          createdAt: true,
        },
      });

      const hasMore = messages.length > limit;
      const results = messages.slice(0, limit).reverse();

      res.json({
        success: true,
        data: {
          messages: results.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            mentions: m.mentions,
            toolTrace: m.toolTrace,
            citations: m.citations,
            feedback: m.feedback,
            commandType: m.commandType,
            createdAt: m.createdAt.toISOString(),
          })),
          hasMore,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load messages";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── PATCH /copilot/messages/:messageId/feedback ───────────────────────

router.patch(
  "/workspaces/:workspaceId/projects/:projectId/copilot/messages/:messageId/feedback",
  authenticate,
  enforceWorkspace,
  requireRole("project", "write"),
  async (req: Request, res: Response) => {
    try {
      const messageId = req.params.messageId as string;
      const { feedback } = feedbackSchema.parse(req.body);

      await db.copilotMessage.update({
        where: { id: messageId },
        data: { feedback },
      });

      res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to update feedback";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

// ── POST /copilot/mentions/search ─────────────────────────────────────

router.post(
  "/workspaces/:workspaceId/projects/:projectId/copilot/mentions/search",
  authenticate,
  enforceWorkspace,
  requireRole("project", "read"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const { query, types } = mentionSearchSchema.parse(req.body);

      const results: Array<{ type: string; id: string; title: string }> = [];

      const searches = types.map(async (type) => {
        switch (type) {
          case "spec": {
            const specs = await db.spec.findMany({
              where: { projectId, title: { contains: query, mode: "insensitive" } },
              take: 3,
              select: { id: true, title: true },
            });
            for (const s of specs) results.push({ type: "spec", id: s.id, title: s.title });
            break;
          }
          case "insight": {
            const insights = await db.insight.findMany({
              where: { projectId, title: { contains: query, mode: "insensitive" } },
              take: 3,
              select: { id: true, title: true },
            });
            for (const i of insights) results.push({ type: "insight", id: i.id, title: i.title });
            break;
          }
          case "theme": {
            const themes = await db.theme.findMany({
              where: { projectId, title: { contains: query, mode: "insensitive" } },
              take: 3,
              select: { id: true, title: true },
            });
            for (const t of themes) results.push({ type: "theme", id: t.id, title: t.title });
            break;
          }
          case "decision": {
            const decisions = await db.decision.findMany({
              where: { projectId, title: { contains: query, mode: "insensitive" } },
              take: 3,
              select: { id: true, title: true },
            });
            for (const d of decisions) results.push({ type: "decision", id: d.id, title: d.title });
            break;
          }
        }
      });

      await Promise.all(searches);

      res.json({
        success: true,
        data: { results: results.slice(0, 8) },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", ") },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Search failed";
      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message } });
    }
  },
);

export default router;
```

- [ ] **Step 2: Register copilot router in routes index**

In `apps/api/src/routes/index.ts`, add the import and registration:

Add after the existing imports:

```typescript
import copilotRouter from "./copilot.js";
```

Add after the query router registration (`router.use(queryRouter);`):

```typescript
// Copilot routes
router.use(copilotRouter);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/copilot.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add copilot Express routes with SSE streaming"
```

---

### Task 8: Frontend — CitationChip and CommandChips Components

**Files:**

- Create: `apps/web/src/components/copilot/CitationChip.tsx`
- Create: `apps/web/src/components/copilot/CommandChips.tsx`

- [ ] **Step 1: Create CitationChip component**

```typescript
// apps/web/src/components/copilot/CitationChip.tsx
"use client";

import { FileText, Lightbulb, GitBranch, Layers } from "lucide-react";

interface CitationChipProps {
  type: string;
  id: string;
  title: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  insight: { icon: Lightbulb, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  spec: { icon: FileText, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  decision: { icon: GitBranch, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  theme: { icon: Layers, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  feedback: { icon: FileText, color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300" },
};

export function CitationChip({ type, title }: CitationChipProps) {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.feedback!;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${config.color} cursor-pointer hover:opacity-80`}
    >
      <Icon className="h-2.5 w-2.5" />
      <span className="max-w-[120px] truncate">{title}</span>
    </span>
  );
}
```

- [ ] **Step 2: Create CommandChips component**

```typescript
// apps/web/src/components/copilot/CommandChips.tsx
"use client";

import { ChevronRight } from "lucide-react";

interface CommandChipsProps {
  onSelect: (command: string) => void;
}

const COMMANDS = [
  { label: "User feedback", prompt: "What did users say about " },
  { label: "Past decisions", prompt: "Have we considered this before?" },
  { label: "Feedback summary", prompt: "Summarize last month's feedback" },
  { label: "Interview prep", prompt: "Prep me for an interview with " },
  { label: "Churn analysis", prompt: "Why are users churning?" },
  { label: "Stakeholder update", prompt: "Write a stakeholder update" },
  { label: "Competitive brief", prompt: "Draft a competitive brief for " },
];

export function CommandChips({ onSelect }: CommandChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COMMANDS.map((cmd) => (
        <button
          key={cmd.label}
          onClick={() => onSelect(cmd.prompt)}
          className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="h-2.5 w-2.5" />
          {cmd.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/copilot/
git commit -m "feat(web): add CitationChip and CommandChips components"
```

---

### Task 9: Frontend — MentionPopover Component

**Files:**

- Create: `apps/web/src/components/copilot/MentionPopover.tsx`

- [ ] **Step 1: Create MentionPopover component**

```typescript
// apps/web/src/components/copilot/MentionPopover.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { FileText, Lightbulb, GitBranch, Layers } from "lucide-react";

interface MentionResult {
  type: "spec" | "insight" | "theme" | "decision";
  id: string;
  title: string;
}

interface MentionPopoverProps {
  query: string;
  visible: boolean;
  position: { top: number; left: number };
  apiBaseUrl: string;
  workspaceId: string;
  projectId: string;
  onSelect: (result: MentionResult) => void;
  onClose: () => void;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  spec: FileText,
  insight: Lightbulb,
  theme: Layers,
  decision: GitBranch,
};

const TYPE_LABELS: Record<string, string> = {
  spec: "Spec",
  insight: "Insight",
  theme: "Theme",
  decision: "Decision",
};

export function MentionPopover({
  query,
  visible,
  position,
  apiBaseUrl,
  workspaceId,
  projectId,
  onSelect,
  onClose,
}: MentionPopoverProps) {
  const [results, setResults] = useState<MentionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const search = useCallback(
    async (q: string) => {
      if (q.length < 1) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(
          `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/copilot/mentions/search`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: q }),
          },
        );
        const json = await res.json();
        if (json.success) {
          setResults(json.data.results);
          setSelectedIndex(0);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl, workspaceId, projectId],
  );

  // Debounced search
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, visible, search]);

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        onSelect(results[selectedIndex]);
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, results, selectedIndex, onSelect, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      ref={ref}
      className="absolute z-50 w-64 rounded-lg border border-border bg-popover shadow-lg"
      style={{ top: position.top, left: position.left }}
    >
      {loading && results.length === 0 && (
        <div className="px-3 py-2 text-xs text-muted-foreground">Searching...</div>
      )}

      {!loading && results.length === 0 && query.length > 0 && (
        <div className="px-3 py-2 text-xs text-muted-foreground">No results found</div>
      )}

      {results.map((result, i) => {
        const Icon = TYPE_ICONS[result.type] ?? FileText;
        return (
          <button
            key={`${result.type}-${result.id}`}
            onClick={() => onSelect(result)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
              i === selectedIndex
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">{result.title}</span>
            <span className="text-[10px] text-muted-foreground">
              {TYPE_LABELS[result.type]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/copilot/MentionPopover.tsx
git commit -m "feat(web): add MentionPopover for @mention autocomplete"
```

---

### Task 10: Frontend — MessageBubble Component

**Files:**

- Create: `apps/web/src/components/copilot/MessageBubble.tsx`

- [ ] **Step 1: Create MessageBubble component**

```typescript
// apps/web/src/components/copilot/MessageBubble.tsx
"use client";

import { useState } from "react";
import {
  Bot,
  User,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Search,
} from "lucide-react";

import { CitationChip } from "./CitationChip.js";

// ── Types ──────────────────────────────────────────────────────────────

interface ToolTrace {
  tool: string;
  input: Record<string, string>;
  results?: number;
  durationMs: number;
}

interface Citation {
  type: string;
  id: string;
  title: string;
  quote?: string;
}

export interface CopilotMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  toolTrace?: ToolTrace[] | null;
  citations?: Citation[] | null;
  feedback?: "POSITIVE" | "NEGATIVE" | null;
  createdAt: string;
}

interface MessageBubbleProps {
  message: CopilotMessage;
  isStreaming?: boolean;
  streamingToolTraces?: ToolTrace[];
  onFeedback?: (messageId: string, feedback: "POSITIVE" | "NEGATIVE" | null) => void;
  onInsertToSpec?: (content: string) => void;
}

// ── Tool trace summary ────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  search_insights: "Searched insights",
  search_feedback: "Searched feedback",
  get_decisions: "Looked up decisions",
  lookup_spec: "Loaded spec",
  get_analytics: "Checked analytics",
};

function ToolTraceSection({ traces }: { traces: ToolTrace[] }) {
  const [expanded, setExpanded] = useState(false);

  if (traces.length === 0) return null;

  const summary = traces
    .map((t) => {
      const label = TOOL_LABELS[t.tool] ?? t.tool;
      return t.results !== undefined ? `${label} (${t.results} results)` : label;
    })
    .join(", ");

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
      >
        <Search className="h-2.5 w-2.5" />
        {expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
        <span>{summary}</span>
      </button>

      {expanded && (
        <div className="mt-1 space-y-1 border-l-2 border-border pl-2">
          {traces.map((trace, i) => (
            <div key={i} className="text-[10px] text-muted-foreground">
              <span className="font-medium">{trace.tool}</span>
              <span className="ml-1">({trace.durationMs}ms)</span>
              {trace.input && (
                <span className="ml-1 text-muted-foreground/70">
                  {Object.entries(trace.input)
                    .map(([k, v]) => `${k}="${v}"`)
                    .join(", ")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function MessageBubble({
  message,
  isStreaming,
  streamingToolTraces,
  onFeedback,
  onInsertToSpec,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "USER";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const traces = streamingToolTraces ?? (message.toolTrace as ToolTrace[] | null) ?? [];
  const citations = (message.citations as Citation[] | null) ?? [];

  return (
    <div className={`mb-4 flex gap-2 ${isUser ? "justify-end" : ""}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-3 w-3 text-primary" />
        </div>
      )}

      <div className={`max-w-[85%] ${isUser ? "" : "flex-1"}`}>
        {/* Tool traces (assistant only) */}
        {!isUser && traces.length > 0 && <ToolTraceSection traces={traces} />}

        {/* Message content */}
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          }`}
        >
          <div className="whitespace-pre-wrap leading-relaxed">
            {message.content}
            {isStreaming && (
              <span className="inline-block h-4 w-1 animate-pulse bg-foreground/50" />
            )}
          </div>
        </div>

        {/* Citations */}
        {!isUser && citations.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {citations.map((c) => (
              <CitationChip key={c.id} type={c.type} id={c.id} title={c.title} />
            ))}
          </div>
        )}

        {/* Actions (assistant only, not while streaming) */}
        {!isUser && !isStreaming && message.content && (
          <div className="mt-1.5 flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Copy"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>

            {onInsertToSpec && (
              <button
                onClick={() => onInsertToSpec(message.content)}
                className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Insert into spec"
              >
                <ClipboardPaste className="h-3 w-3" />
              </button>
            )}

            {onFeedback && (
              <>
                <button
                  onClick={() =>
                    onFeedback(
                      message.id,
                      message.feedback === "POSITIVE" ? null : "POSITIVE",
                    )
                  }
                  className={`flex h-6 items-center rounded px-1.5 text-[10px] ${
                    message.feedback === "POSITIVE"
                      ? "text-emerald-600"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  title="Good response"
                >
                  <ThumbsUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() =>
                    onFeedback(
                      message.id,
                      message.feedback === "NEGATIVE" ? null : "NEGATIVE",
                    )
                  }
                  className={`flex h-6 items-center rounded px-1.5 text-[10px] ${
                    message.feedback === "NEGATIVE"
                      ? "text-red-600"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  title="Bad response"
                >
                  <ThumbsDown className="h-3 w-3" />
                </button>
              </>
            )}

            {/* Timestamp */}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="h-3 w-3 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/copilot/MessageBubble.tsx
git commit -m "feat(web): add MessageBubble with tool traces, citations, and feedback"
```

---

### Task 11: Frontend — CopilotInput Component

**Files:**

- Create: `apps/web/src/components/copilot/CopilotInput.tsx`

- [ ] **Step 1: Create CopilotInput component**

```typescript
// apps/web/src/components/copilot/CopilotInput.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Paperclip, Loader2 } from "lucide-react";

import { MentionPopover } from "./MentionPopover.js";

interface Mention {
  type: "spec" | "insight" | "theme" | "decision";
  id: string;
  title: string;
}

interface CopilotInputProps {
  onSend: (message: string, mentions: Mention[]) => void;
  disabled?: boolean;
  loading?: boolean;
  apiBaseUrl: string;
  workspaceId: string;
  projectId: string;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function CopilotInput({
  onSend,
  disabled,
  loading,
  apiBaseUrl,
  workspaceId,
  projectId,
  inputRef: externalRef,
}: CopilotInputProps) {
  const [value, setValue] = useState("");
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionVisible, setMentionVisible] = useState(false);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef ?? internalRef;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value, textareaRef]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || loading) return;
    onSend(trimmed, mentions);
    setValue("");
    setMentions([]);
  }, [value, mentions, disabled, loading, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !mentionVisible) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    // Detect @ trigger
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      // Only trigger if @ is at start or preceded by whitespace, and no spaces in query
      const charBefore = atIndex > 0 ? newValue[atIndex - 1] : " ";
      if ((charBefore === " " || charBefore === "\n" || atIndex === 0) && !textAfterAt.includes(" ")) {
        setMentionQuery(textAfterAt);
        setMentionStartIndex(atIndex);
        setMentionVisible(true);
        // Position popover above the textarea
        setMentionPosition({ top: -200, left: 0 });
        return;
      }
    }

    setMentionVisible(false);
  };

  const handleMentionSelect = useCallback(
    (result: { type: "spec" | "insight" | "theme" | "decision"; id: string; title: string }) => {
      setMentions((prev) => [...prev, result]);

      // Replace @query with @[Title]
      const before = value.slice(0, mentionStartIndex);
      const after = value.slice(mentionStartIndex + 1 + mentionQuery.length);
      setValue(`${before}@[${result.title}] ${after}`);
      setMentionVisible(false);
      textareaRef.current?.focus();
    },
    [value, mentionStartIndex, mentionQuery, textareaRef],
  );

  return (
    <div className="relative border-t border-border p-2">
      {/* Mention chips */}
      {mentions.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1 px-1">
          {mentions.map((m, i) => (
            <span
              key={`${m.id}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
            >
              @{m.title}
              <button
                onClick={() => setMentions((prev) => prev.filter((_, j) => j !== i))}
                className="ml-0.5 hover:text-primary/70"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your project... (@ to mention)"
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          style={{ maxHeight: 120 }}
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || disabled || loading}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Mention popover */}
      <MentionPopover
        query={mentionQuery}
        visible={mentionVisible}
        position={mentionPosition}
        apiBaseUrl={apiBaseUrl}
        workspaceId={workspaceId}
        projectId={projectId}
        onSelect={handleMentionSelect}
        onClose={() => setMentionVisible(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/copilot/CopilotInput.tsx
git commit -m "feat(web): add CopilotInput with @mention support"
```

---

### Task 12: Frontend — CopilotPanel (Main Container)

**Files:**

- Create: `apps/web/src/components/copilot/CopilotPanel.tsx`

- [ ] **Step 1: Create CopilotPanel component**

```typescript
// apps/web/src/components/copilot/CopilotPanel.tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Loader2 } from "lucide-react";

import { CopilotInput } from "./CopilotInput.js";
import { CommandChips } from "./CommandChips.js";
import { MessageBubble, type CopilotMessage } from "./MessageBubble.js";

// ── Types ──────────────────────────────────────────────────────────────

interface CopilotPanelProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
  activeSpecId?: string;
  activeSpecTitle?: string;
}

interface Mention {
  type: "spec" | "insight" | "theme" | "decision";
  id: string;
  title: string;
}

interface ToolTrace {
  tool: string;
  input: Record<string, string>;
  results?: number;
  durationMs: number;
}

// ── Component ─────────────────────────────────────────────────────────

export function CopilotPanel({
  workspaceId,
  projectId,
  apiBaseUrl,
  activeSpecId,
  activeSpecTitle,
}: CopilotPanelProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingTraces, setStreamingTraces] = useState<ToolTrace[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const base = `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}`;

  // ── Load existing threads on mount ──────────────────────────────────

  useEffect(() => {
    async function loadThread() {
      try {
        const res = await fetch(`${base}/copilot/threads`, {
          credentials: "include",
        });
        const json = await res.json();

        if (json.success && json.data.threads.length > 0) {
          const latest = json.data.threads[0];
          setThreadId(latest.id);

          // Load messages
          const msgRes = await fetch(
            `${base}/copilot/threads/${latest.id}/messages?limit=50`,
            { credentials: "include" },
          );
          const msgJson = await msgRes.json();

          if (msgJson.success) {
            setMessages(msgJson.data.messages);
          }
        }
      } catch {
        // Silent fail — no threads yet is fine
      } finally {
        setInitializing(false);
      }
    }

    loadThread();
  }, [base]);

  // ── Auto-scroll ─────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // ── Send message ────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (message: string, mentions: Mention[]) => {
      if (loading) return;

      // Optimistic user message
      const userMsg: CopilotMessage = {
        id: `temp-${Date.now()}`,
        role: "USER",
        content: message,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setStreamingContent("");
      setStreamingTraces([]);

      // Abort previous stream if any
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`${base}/copilot/chat`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            mentions,
            activeContext: activeSpecId
              ? { specId: activeSpecId, specTitle: activeSpecTitle }
              : null,
            threadId,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        // Read SSE stream
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedContent = "";
        let accumulatedTraces: ToolTrace[] = [];
        let messageId = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let currentEvent = "";
          let currentData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7);
            } else if (line.startsWith("data: ")) {
              currentData = line.slice(6);

              try {
                const parsed = JSON.parse(currentData);

                switch (currentEvent) {
                  case "thread_created":
                    setThreadId(parsed.threadId);
                    break;

                  case "tool_start":
                    // Show tool in progress
                    break;

                  case "tool_result":
                    accumulatedTraces = [
                      ...accumulatedTraces,
                      {
                        tool: parsed.tool,
                        input: {},
                        results: parsed.results,
                        durationMs: parsed.durationMs,
                      },
                    ];
                    setStreamingTraces([...accumulatedTraces]);
                    break;

                  case "content_delta":
                    accumulatedContent += parsed.text;
                    setStreamingContent(accumulatedContent);
                    break;

                  case "citation":
                    // Citations are collected; they'll be on the final message
                    break;

                  case "done":
                    messageId = parsed.messageId;
                    break;

                  case "error":
                    throw new Error(parsed.message);
                }
              } catch (e) {
                if (e instanceof Error && e.message !== currentData) throw e;
                // Ignore JSON parse errors on partial data
              }
            }
          }
        }

        // Replace streaming state with final message
        if (messageId && accumulatedContent) {
          // Reload the actual persisted message to get citations
          const msgRes = await fetch(
            `${base}/copilot/threads/${threadId}/messages?limit=1`,
            { credentials: "include" },
          );
          const msgJson = await msgRes.json();
          const finalMsg = msgJson.success ? msgJson.data.messages[msgJson.data.messages.length - 1] : null;

          if (finalMsg) {
            setMessages((prev) => [...prev, finalMsg]);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: messageId,
                role: "ASSISTANT",
                content: accumulatedContent,
                toolTrace: accumulatedTraces,
                createdAt: new Date().toISOString(),
              },
            ]);
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "ASSISTANT",
            content:
              err instanceof Error
                ? `Error: ${err.message}`
                : "Failed to get a response. Please try again.",
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setLoading(false);
        setStreamingContent("");
        setStreamingTraces([]);
      }
    },
    [loading, base, threadId, activeSpecId, activeSpecTitle],
  );

  // ── Feedback handler ────────────────────────────────────────────────

  const handleFeedback = useCallback(
    async (messageId: string, feedback: "POSITIVE" | "NEGATIVE" | null) => {
      try {
        await fetch(`${base}/copilot/messages/${messageId}/feedback`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback }),
        });

        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)),
        );
      } catch {
        // Silent fail
      }
    },
    [base],
  );

  // ── Command chip handler ────────────────────────────────────────────

  const handleCommand = useCallback((prompt: string) => {
    const textarea = inputRef.current;
    if (textarea) {
      // Set value via native setter to trigger React's onChange
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      nativeSetter?.call(textarea, prompt);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
      // Place cursor at end
      textarea.setSelectionRange(prompt.length, prompt.length);
    }
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

  if (initializing) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Bot className="h-8 w-8 opacity-30" />
            <p className="text-xs">Ask anything about your project</p>
            <CommandChips onSelect={handleCommand} />
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onFeedback={msg.role === "ASSISTANT" ? handleFeedback : undefined}
            onInsertToSpec={
              msg.role === "ASSISTANT"
                ? (content) => navigator.clipboard.writeText(content)
                : undefined
            }
          />
        ))}

        {/* Streaming message */}
        {loading && streamingContent && (
          <MessageBubble
            message={{
              id: "streaming",
              role: "ASSISTANT",
              content: streamingContent,
              createdAt: new Date().toISOString(),
            }}
            isStreaming
            streamingToolTraces={streamingTraces}
          />
        )}

        {/* Loading indicator when no content yet */}
        {loading && !streamingContent && (
          <div className="mb-4 flex gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-3 w-3 text-primary" />
            </div>
            <div className="rounded-lg bg-muted px-3 py-2">
              {streamingTraces.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {streamingTraces.map((t) => t.tool).join(", ")}...
                </span>
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Command chips after response completes */}
      {messages.length > 0 && !loading && (
        <div className="px-3 pb-1">
          <CommandChips onSelect={handleCommand} />
        </div>
      )}

      {/* Input */}
      <CopilotInput
        onSend={sendMessage}
        disabled={false}
        loading={loading}
        apiBaseUrl={apiBaseUrl}
        workspaceId={workspaceId}
        projectId={projectId}
        inputRef={inputRef}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/copilot/CopilotPanel.tsx
git commit -m "feat(web): add CopilotPanel with streaming SSE and thread management"
```

---

### Task 13: Frontend — Integrate CopilotPanel into AgentPanel + Cmd+J Shortcut

**Files:**

- Modify: `apps/web/src/components/workspace/AgentPanel.tsx`

- [ ] **Step 1: Replace ChatView with CopilotPanel and rename tab**

In `apps/web/src/components/workspace/AgentPanel.tsx`, make these changes:

1. Add the import at the top (after existing imports):

```typescript
import { CopilotPanel } from "../copilot/CopilotPanel.js";
```

2. Remove the `Sparkles` icon import if present, and add it if needed. Actually we need to change the tab icon. Find the `tabs` array and update it:

Replace:

```typescript
    { id: "chat", label: "Chat", icon: <MessageSquare className="h-3 w-3" /> },
```

With:

```typescript
    { id: "chat", label: "Copilot", icon: <MessageSquare className="h-3 w-3" /> },
```

3. Replace the ChatView usage in the tab content. Find:

```typescript
        {activeTab === "chat" && (
          <ChatView
            workspaceId={workspaceId}
            projectId={projectId}
            apiBaseUrl={apiBaseUrl}
          />
        )}
```

Replace with:

```typescript
        {activeTab === "chat" && (
          <CopilotPanel
            workspaceId={workspaceId}
            projectId={projectId}
            apiBaseUrl={apiBaseUrl}
          />
        )}
```

4. Delete the entire `ChatView` function component (lines ~141-330 in the original file) since it's no longer used.

5. Clean up unused imports: remove `Bot`, `User`, `ChevronRight` if they're no longer used by the remaining components.

- [ ] **Step 2: Add Cmd+J global shortcut**

In `apps/web/src/components/workspace/AgentPanel.tsx`, add an effect inside the `AgentPanel` component (after the existing `useEffect` for `aiOutput`):

```typescript
// Cmd+J to focus copilot
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "j") {
      e.preventDefault();
      setActiveTab("chat");
    }
  };
  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, []);
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/AgentPanel.tsx
git commit -m "feat(web): integrate CopilotPanel into AgentPanel with Cmd+J shortcut"
```

---

### Task 14: Type Check and Final Verification

**Files:**

- None new — validation only

- [ ] **Step 1: Run API type check**

```bash
cd apps/api && pnpm type-check
```

Expected: passes (or only pre-existing errors).

- [ ] **Step 2: Run web type check**

```bash
cd apps/web && pnpm type-check
```

Expected: passes (or only pre-existing errors).

- [ ] **Step 3: Run AI package type check**

```bash
cd packages/ai && npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 4: Fix any type errors found**

If type errors appear in our new files, fix them. Common issues:

- Import path `.js` extensions needed for ESM
- Prisma client types not matching (re-run `npx prisma generate`)
- Express `res` type needing explicit annotation

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete PM Copilot — streaming AI assistant with RAG, function calling, and citations"
```
