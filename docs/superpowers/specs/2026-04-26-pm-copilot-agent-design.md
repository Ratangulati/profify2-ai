# PM Copilot Agent — Design Spec

**Date:** 2026-04-26
**Status:** Draft (awaiting user review)
**Scope:** The "AI brain" of PM-YC — a full agent with project memory, tiered trust, multi-model support, and streaming responses

---

## Overview

The Copilot is a full agent with project memory and tiered trust. It runs in a Plan → Act → Observe loop, takes multi-step autonomous actions, and remembers facts about the project across all threads. PMs bring their own API keys (OpenAI, Anthropic, Google, Ollama) and choose which model powers each conversation.

**Core capabilities:**

- Streams responses token-by-token via Server-Sent Events
- Calls read tools automatically; calls low-risk write tools automatically; pauses for PM approval before high-risk write tools
- Maintains project-level memory of learned facts, preferences, and decisions
- Supports multiple LLM providers via per-workspace BYOK (bring your own key)
- Resumable across HTTP requests (survives PM walking away during approvals)

**Non-goals (v1):**

- Cross-project memory or workspace-wide preference learning
- Cost tracking dashboard (data captured, no UI)
- Voice or multimodal input
- Background agents that run without an open thread

---

## Section 1: Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────┐
│  PM types: "Why are users churning? Draft a fix spec."     │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
            ┌─────────────────────────────────┐
            │  CONTEXT ASSEMBLY (fast tier)   │
            │  - Project summary (cached)     │
            │  - Project memory facts (top 10)│
            │  - Last 20 thread messages      │
            │  - Active spec context (if any) │
            │  Total: ~1500 tokens            │
            └──────────────┬──────────────────┘
                           │
                           ▼
            ┌─────────────────────────────────┐
            │  AGENT LOOP (max 8 rounds)      │
            │                                 │
            │  PLAN → emit `plan` event       │
            │   ↓                             │
            │  ACT → tool call(s)             │
            │   ├─ Tier 1 read   (auto)       │
            │   ├─ Tier 2 write  (auto+notify)│
            │   └─ Tier 3 write  (PROPOSE,    │
            │       wait for approval)        │
            │   ↓                             │
            │  OBSERVE → tool results         │
            │   ↓                             │
            │  STREAM `content_delta` tokens  │
            │   or loop back to PLAN          │
            └──────────────┬──────────────────┘
                           │
                           ▼
            ┌─────────────────────────────────┐
            │  PERSIST                        │
            │  - Message + tool traces        │
            │  - Citations                    │
            │  - Update project memory        │
            │  - Pending actions for approval │
            └─────────────────────────────────┘
```

### Three layers

**Database** — adds 2 tables: `ProjectMemory`, `PendingAction`. Adds 1 table: `WorkspaceCredential` for BYOK keys.

**API (Express)** — `/copilot/chat` becomes a streaming agent endpoint. New endpoints for action approval, memory CRUD, and credential management.

**Frontend** — extends existing copilot components with action approval cards, plan checklists, tool traces, and a memory drawer.

---

## Section 2: The Tool Surface

Three tiers with risk-based access control.

### Tier 1 — Read tools (auto-execute)

| Tool                   | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| `search_feedback`      | Full-text + segment-filtered search across feedback items |
| `search_insights`      | Search insights by topic, type, severity                  |
| `search_specs`         | Find specs by title, content, status                      |
| `get_decisions`        | Look up past decisions by feature area or keyword         |
| `get_opportunity`      | Load opportunity with all linked evidence                 |
| `get_competitor_intel` | Pull competitor mentions for a feature area               |
| `get_trends`           | Volume trends for a theme/insight over time period        |
| `get_persona`          | Load persona with goals + frustrations                    |

### Tier 2 — Low-risk write tools (auto-execute, notify in stream)

| Tool                     | Why low-risk                                           |
| ------------------------ | ------------------------------------------------------ |
| `create_spec_draft`      | Creates as `DRAFT`; PM hasn't committed                |
| `append_to_spec_section` | Adds content; prior version preserved in `SpecVersion` |
| `save_assumption`        | Flags for review; no other side effects                |
| `add_evidence_link`      | Reversible one-click                                   |
| `propose_opportunity`    | Adds to backlog as `IDENTIFIED`; PM can dismiss        |
| `update_project_memory`  | Updates the agent's own memory                         |

### Tier 3 — High-risk write tools (PROPOSED, awaits approval)

| Tool                        | Why approval-required                                             |
| --------------------------- | ----------------------------------------------------------------- |
| `change_opportunity_status` | Moves to `PRIORITIZED`, `IN_PROGRESS`, `KILLED` — affects roadmap |
| `update_opportunity_score`  | Changes priority order seen by team                               |
| `submit_spec_for_review`    | `DRAFT → REVIEW`; notifies stakeholders                           |
| `approve_decision`          | Audit trail implications                                          |
| `delete_*`                  | Anything destructive                                              |
| `send_notification`         | Anything that pings teammates                                     |

### Tool registry

`apps/api/src/copilot/tools/index.ts` exports a single `ToolRegistry` — a map of `toolName → { handler, tier, schema }`. Adding a tool means adding an entry; the agent loop and SSE streaming pick it up automatically.

Each tool's `schema` is a Zod schema for input validation. The same schema is converted to JSON Schema for LLM function calling via `zod-to-json-schema`.

---

## Section 3: Project Memory

### Database

```prisma
model ProjectMemory {
  id              String           @id @default(cuid())
  projectId       String           @map("project_id")
  category        MemoryCategory
  content         String
  source          MemorySource
  confidence      Float            @default(1.0)
  pinned          Boolean          @default(false)
  lastUsedAt      DateTime?        @map("last_used_at")
  lastConfirmedAt DateTime         @default(now()) @map("last_confirmed_at")
  createdAt       DateTime         @default(now()) @map("created_at")
  updatedAt       DateTime         @updatedAt @map("updated_at")

  project         Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([projectId, category])
  @@map("project_memory")
}

model PendingAction {
  id            String        @id @default(cuid())
  runId         String        @map("run_id")
  threadId      String        @map("thread_id")
  messageId     String?       @map("message_id")
  tool          String
  input         Json
  preview       String
  status        ActionStatus  @default(PENDING)
  decidedAt     DateTime?     @map("decided_at")
  decidedReason String?       @map("decided_reason")
  expiresAt     DateTime      @map("expires_at")
  createdAt     DateTime      @default(now()) @map("created_at")

  thread        CopilotThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@index([runId])
  @@index([threadId])
  @@index([status, expiresAt])
  @@map("pending_actions")
}

enum ActionStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
  FAILED
}

enum MemoryCategory {
  PREFERENCE     // "Team uses RICE not ICE"
  CONTEXT        // "Product is for SMB e-commerce"
  DECISION       // "Decided to defer dark mode in Feb 2026"
  CONSTRAINT     // "No releases on Fridays"
  STAKEHOLDER    // "CEO cares most about activation rate"
}

enum MemorySource {
  EXPLICIT       // PM told it directly
  LEARNED        // Agent inferred from behavior
  IMPORTED       // Auto-extracted from a Decision/Spec
}
```

### Population paths

1. **Explicit** — PM writes "remember that we don't ship on Fridays". Agent calls `update_project_memory` (Tier 2). Saved with `source=EXPLICIT, confidence=1.0`.

2. **Learned** — Agent observes a pattern (e.g., PM rejected three score-change actions in a row for low-effort items). Writes a memory: `source=LEARNED, confidence=0.6`.

3. **Imported** — Background worker job listens for `Decision.created` and `Spec.statusChanged → APPROVED`. Extracts a one-sentence fact via the LLM, writes with `source=IMPORTED, confidence=0.8`.

### Retrieval

For each user message, retrieve top 10 memory facts ranked by:

```
relevance = textSimilarity(query, content) × confidence × recency
recency = exp(-daysSinceLastUsed / 30)
```

Inject into context as a `memoryFacts` block (~500 tokens budget). Update `lastUsedAt` for each fact returned.

### Confidence decay

A daily worker job (`memory-decay.ts`) runs:

- For each memory with `source=LEARNED`: if `now - lastConfirmedAt > 60 days`, multiply `confidence × 0.9`.
- If `confidence < 0.2`: delete.
- `EXPLICIT` and pinned memories (`pinned=true`) never decay regardless of source.

### Memory drawer (UI)

A panel inside the Copilot, accessible from the panel header. Lists memory facts grouped by category. PM can:

- Edit any fact (corrects what the agent learned)
- Delete (forget this)
- Pin (boost `confidence=1.0`, immune to decay)

---

## Section 4: Streaming Wire Format

`POST /workspaces/:wid/projects/:pid/copilot/chat` returns `text/event-stream`. Frontend reads with `fetch()` + `ReadableStream` (POST-with-body so `EventSource` doesn't apply).

### Event types

```
event: thread_created
data: {"threadId": "thr_abc"}

event: plan
data: {"steps": ["Find churn signals", "Draft remediation spec"]}

event: tool_start
data: {"tool": "search_feedback", "input": {"query": "churn"}, "tier": 1}

event: tool_result
data: {"tool": "search_feedback", "summary": "Found 47 items", "durationMs": 320}

event: content_delta
data: {"text": "Based on 23 feedback items, the top reason is"}

event: citation
data: {"type": "insight", "id": "ins_abc", "title": "Onboarding drop-off", "quote": "..."}

event: action_proposed
data: {
  "actionId": "act_xyz",
  "tool": "change_opportunity_status",
  "input": {"opportunityId": "opp_123", "status": "KILLED"},
  "preview": "Kill opportunity 'Dark Mode v2' — backed by 4 insights showing low demand"
}

event: action_applied
data: {"actionId": "act_xyz", "tool": "create_spec_draft", "result": {"specId": "spc_456"}}

event: action_skipped
data: {"actionId": "act_xyz", "reason": "rejected by user"}

event: action_failed
data: {"actionId": "act_xyz", "error": "Workspace permission denied"}

event: memory_updated
data: {"memoryId": "mem_789", "category": "PREFERENCE", "content": "..."}

event: model_used
data: {"model": "claude-sonnet-4-6", "provider": "ANTHROPIC"}

event: done
data: {"messageId": "msg_xyz", "tokensUsed": 4523, "toolRoundsUsed": 3}

event: error
data: {"message": "...", "recoverable": true}
```

### Approval flow

1. Stream pauses at `action_proposed`. Backend writes a `PendingAction` row with a `runId` (stable identifier for the agent run, generated server-side at the start of `/chat`) and emits `done` to close the current SSE connection cleanly.
2. The `action_proposed` event payload includes the `runId`, allowing the frontend to resume the same run later.
3. Frontend renders an inline Accept/Reject card (`ActionProposal.tsx`).
4. Frontend POSTs to `/copilot/actions/:actionId/decide` with `{decision, reason?}`. The response is itself a new SSE stream that resumes the same agent run by `runId`, executes (or skips) the tool, emits `action_applied` (or `action_skipped`), and continues the agent loop until next pause or completion.

The agent state needed to resume a run (conversation, scratchpad, round counter) is stored in a Redis key `copilot:run:{runId}` with a 10-minute TTL. If the run state has expired by the time the PM decides, the API returns 410 Gone and the frontend prompts the PM to start a new message.

`PendingAction` rows expire after 5 minutes; expired actions get `status=EXPIRED` and the agent run is considered dead. PM sees them on next thread load with an "expired" notice.

### Round budget

- Max **8 tool rounds per message**, advertised in system prompt.
- Hard wall-clock cap of **30 seconds** between user message and final `done` event (not counting time waiting on approval).
- Reaching either cap → emit `done` with partial response and notice "I hit my exploration budget. Want me to continue?"
- PM types "yes" → spawns continuation thread that resumes from where it left off.

---

## Section 5: Multi-Model Support (BYOK)

### Database

```prisma
model WorkspaceCredential {
  id            String              @id @default(cuid())
  workspaceId   String              @map("workspace_id")
  provider      CredentialProvider
  keyEncrypted  String              @map("key_encrypted")
  keyPrefix     String              @map("key_prefix")
  label         String?
  createdById   String              @map("created_by_id")
  createdAt     DateTime            @default(now()) @map("created_at")
  lastUsedAt    DateTime?           @map("last_used_at")

  workspace     Workspace           @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, provider])
  @@index([workspaceId])
  @@map("workspace_credentials")
}

enum CredentialProvider {
  OPENAI
  ANTHROPIC
  GOOGLE
  OLLAMA
}
```

`keyEncrypted` uses AES-256-GCM with the existing helper in `packages/integrations/src/encryption.ts`. Decryption only at request time, in-memory, never logged.

### Supported models

| Provider  | Models                                                     |
| --------- | ---------------------------------------------------------- |
| OpenAI    | `gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini`                   |
| Anthropic | `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5` |
| Google    | `gemini-2.5-pro`, `gemini-2.5-flash`                       |
| Ollama    | Any locally-pulled model                                   |

### Model selection (3 levels)

```
Per-message model        ← highest priority (CopilotInput selector)
   ↑ falls back to
Project default model    ← Project.settings.defaultModel
   ↑ falls back to
Workspace default model  ← Workspace.settings.defaultModel
   ↑ falls back to
"claude-sonnet-4-6"      ← system fallback
```

Each `CopilotMessage` records `modelUsed` for audit.

### Provider routing

```typescript
async function resolveProvider(workspaceId: string, requestedModel: string) {
  const provider = MODEL_TO_PROVIDER[requestedModel]; // e.g., "gemini-2.5-pro" → GOOGLE
  const cred = await db.workspaceCredential.findUnique({
    where: { workspaceId_provider: { workspaceId, provider } },
  });
  if (!cred) throw new NoCredentialError(provider);
  const apiKey = decrypt(cred.keyEncrypted);
  return createProvider({ provider, model: requestedModel, apiKey });
}
```

The agent loop is provider-agnostic — it only talks to the `LLMProvider` interface.

### Tool calling compatibility

| Provider  | Tool calling                                         |
| --------- | ---------------------------------------------------- |
| OpenAI    | Native (`tools` parameter)                           |
| Anthropic | Native (`tools` parameter)                           |
| Google    | Native (function calling)                            |
| Ollama    | Most models unreliable → fall back to chat-only mode |

If a chosen model doesn't support tools, the Copilot falls back to chat-only for that thread. UI shows a notice: "This model doesn't support tools — switch to Claude or GPT-4 for full agent mode."

### UI

**Settings → Models tab** (`apps/web/src/app/workspace/settings/models/page.tsx`)

- List of configured providers with masked keys (`sk-proj-1234···`)
- "Add Key" modal: provider dropdown, key input, optional label
- "Test" button — fires a 10-token completion to verify
- Set workspace default model
- Delete key (confirms; checks no in-flight threads)

**CopilotInput model picker**

- Dropdown left of the send button
- Shows only models for which a key exists
- Switching mid-thread is allowed; new messages use the new model
- Last choice remembered in `localStorage`

**MessageBubble model badge**

- Small label: `Sonnet 4.6` or `gpt-4o`
- Click to expand: tokens used, latency, model

---

## Section 6: API Endpoints

All under `apps/api/src/routes/copilot.ts`. Auth: `authenticate → enforceWorkspace → requireRole`.

### POST `/workspaces/:wid/projects/:pid/copilot/chat`

**Auth:** `requireRole("project", "write")`
**Request:**

```json
{
  "message": "Why are users churning?",
  "mentions": [{ "type": "theme", "id": "thm_abc", "title": "Onboarding" }],
  "activeContext": { "specId": "spc_123", "specTitle": "Onboarding Redesign" },
  "threadId": null,
  "model": "claude-sonnet-4-6"
}
```

**Response:** `Content-Type: text/event-stream` — SSE events as defined in Section 4.

### POST `/workspaces/:wid/projects/:pid/copilot/actions/:actionId/decide`

**Auth:** `requireRole("project", "write")`
**Request:** `{"decision": "approve" | "reject", "reason"?: "..."}`
**Response:** Reopens the SSE stream for the same agent run; continues from the paused state.

### GET `/workspaces/:wid/projects/:pid/copilot/threads`

**Auth:** `requireRole("project", "read")`
**Response:** `{"threads": [{"id", "title", "messageCount", "updatedAt"}]}`

### GET `/workspaces/:wid/projects/:pid/copilot/threads/:tid/messages`

**Auth:** `requireRole("project", "read")`
**Query:** `?limit=50&before=msg_xyz`
**Response:** `{"messages": [...], "hasMore": true}`

### PATCH `/workspaces/:wid/projects/:pid/copilot/messages/:mid/feedback`

**Auth:** `requireRole("project", "write")`
**Request:** `{"feedback": "POSITIVE" | "NEGATIVE" | null}`

### POST `/workspaces/:wid/projects/:pid/copilot/mentions/search`

**Auth:** `requireRole("project", "read")`
**Request:** `{"query": "onb", "types": ["spec", "insight", "theme", "decision"]}`
**Response:** `{"results": [{"type", "id", "title"}]}` — max 8 results.

### Memory endpoints

- `GET /workspaces/:wid/projects/:pid/copilot/memory` — list facts, paginated
- `PATCH /workspaces/:wid/projects/:pid/copilot/memory/:id` — edit content / pin / unpin
- `DELETE /workspaces/:wid/projects/:pid/copilot/memory/:id` — forget

### Credential endpoints

- `GET /workspaces/:wid/credentials` — list (returns `keyPrefix` + `label` + `provider`, never the key)
- `POST /workspaces/:wid/credentials` — `{provider, key, label?}` — encrypts and stores
- `POST /workspaces/:wid/credentials/:id/test` — fires a 10-token completion against the provider
- `DELETE /workspaces/:wid/credentials/:id` — checks no pending threads, deletes

---

## Section 7: File Layout

### Backend

```
apps/api/src/
  routes/
    copilot.ts                    [REWRITE — currently a skeleton]
    credentials.ts                [NEW — workspace credential CRUD]

  copilot/
    agent.ts                      [NEW — Plan/Act/Observe loop]
    context.ts                    [NEW — assembleContext({fast|deep})]
    memory.ts                     [NEW — read/write/decay project memory]
    streaming.ts                  [NEW — SSE event emitter]
    actions.ts                    [NEW — pending action storage + resume logic]
    provider-resolver.ts          [NEW — model name → LLMProvider]
    tools/
      index.ts                    [NEW — registry with tier metadata]
      read.ts                     [NEW — Tier 1 read tools]
      write-low.ts                [NEW — Tier 2 auto-apply write tools]
      write-high.ts               [NEW — Tier 3 approval-required write tools]
```

### AI package

```
packages/ai/src/
  copilot/
    plan.ts                       [NEW — generates plan from query + context]
    agent-prompt.ts               [NEW — system prompt builder, includes memory]
    tool-schemas.ts               [NEW — Zod schemas → JSON Schema for function calling]
  providers/
    google.ts                     [NEW — Gemini provider]
    streaming.ts                  [EXTEND — add streamWithTools()]
```

### Database

```
packages/db/prisma/schema.prisma  [EXTEND]
  model ProjectMemory             [NEW]
  model PendingAction             [NEW]
  model WorkspaceCredential       [NEW]
  enum MemoryCategory             [NEW]
  enum MemorySource               [NEW]
  enum ActionStatus               [NEW]
  enum CredentialProvider         [NEW]
```

### Worker

```
apps/worker/src/processors/
  memory-decay.ts                 [NEW — daily; decays LEARNED memory confidence]
  memory-import.ts                [NEW — on Decision/Spec changes; extracts facts]
```

### Frontend

```
apps/web/src/components/copilot/
  CopilotPanel.tsx                [REWRITE — wire to streaming endpoint]
  CopilotInput.tsx                [EXTEND — add model picker]
  MessageBubble.tsx               [EXTEND — render plan, tool traces, citations, model badge]
  CitationChip.tsx                [KEEP]
  CommandChips.tsx                [KEEP]
  MentionPopover.tsx              [KEEP]
  ActionProposal.tsx              [NEW — Accept/Reject card]
  ToolTrace.tsx                   [NEW — collapsible trace display]
  PlanChecklist.tsx               [NEW — agent's plan with completion state]
  MemoryDrawer.tsx                [NEW — view/edit project memory]
  ModelPicker.tsx                 [NEW — model selector]
  hooks/
    useCopilotStream.ts           [NEW — SSE + AbortController + event parsing]
    useActionApproval.ts          [NEW — POST approve/reject]

apps/web/src/app/workspace/settings/models/
  page.tsx                        [NEW — credential management UI]
```

### Shared

```
packages/shared/src/copilot/
  events.ts                       [NEW — TypeScript types for SSE events]
  tools.ts                        [NEW — tool name + I/O types shared FE/BE]
  models.ts                       [NEW — supported model list + provider map]
```

---

## Section 8: Error Handling & Edge Cases

### LLM failures

| Failure                          | Behavior                                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM API timeout (30s)            | Emit `error` event with `recoverable: true`. Frontend shows retry button. User message persisted; on retry, agent restarts from beginning of last message. |
| Malformed tool call              | Skip it, append "I tried to do X but the call was malformed" to context, continue loop. Counts toward round budget.                                        |
| Hallucinated tool name           | Tool registry returns "tool not found"; agent gets that as observation, course-corrects.                                                                   |
| Provider down (e.g., OpenAI 503) | If user has `ANTHROPIC` credentials, offer one-click failover. Otherwise, fail with clear message.                                                         |

### Tool failures

| Failure                                       | Behavior                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| Tool throws                                   | Emit `tool_result` with `error` field; agent decides next step. Non-fatal.              |
| Tool times out (10s per tool)                 | Same as throw.                                                                          |
| Tool returns 0 results                        | Treated as success with empty result; agent decides whether to refine query or give up. |
| Tier 3 action validation fails after approval | Emit `action_failed`; agent re-plans.                                                   |

### Stream lifecycle

| Failure                             | Behavior                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend disconnects mid-stream     | Backend detects via `req.on('close')`, aborts agent loop, persists partial message with `interrupted: true`. Pending actions auto-expire after 5 min. |
| Frontend reconnects                 | Loads latest messages from DB. If last has `interrupted: true`, shows "Continue from here?" button.                                                   |
| User clicks Stop                    | Frontend aborts via `AbortController`; backend sees disconnect; same as above.                                                                        |
| Browser closed during approval wait | `PendingAction` expires after 5 min → `status=EXPIRED`; agent loop dead. Next thread load shows "this action expired" notice.                         |

### Approval edge cases

| Case                           | Behavior                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| PM rejects                     | Agent observes "User rejected: <reason>". Continues loop with alternative approach or ends. |
| PM approves but DB write fails | `action_failed` emitted; agent informed; re-plans.                                          |
| Same action proposed twice     | Second proposal skipped (idempotency by hash of `tool + input`).                            |
| PM walks away during approval  | After 5 min, `PendingAction` expires; loop dead; new thread starts fresh.                   |

### Context overflow

| Case                               | Behavior                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Project too large for fast tier    | Memory + decisions + history capped at 4000 tokens; older memory facts dropped first by `(confidence × recency)`. |
| Tool result too big                | Tool wraps result with summary: first 50 items + `truncated: true, totalCount: N`. Agent paginates if needed.     |
| Conversation history > 20 messages | Older messages summarized into a single "Earlier you discussed X" turn.                                           |

### Rate limiting & quotas

| Case                        | Behavior                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Workspace AI quota exceeded | 429 before stream starts. Plan-level enforcement (free: 50 messages/month, paid: unlimited). |
| Per-user spam               | 10 messages/minute limit. 429 with `retry-after`.                                            |
| Agent infinite loop         | Hard cap: 8 tool rounds + 30s wall-clock. Whichever first ends the loop.                     |

### Security

- All tool inputs validated with Zod against the tool schema before execution.
- Tier 3 actions re-validate workspace + project authorization at execution time, not just at proposal time.
- `update_project_memory` content treated as plain text only; no executable content.
- Tool responses sanitized — no SQL strings, no file paths leak to LLM context.
- API keys decrypted only at request time, in-memory, never logged or returned to client (except `keyPrefix` for UI identification).

---

## Section 9: Out of Scope (v1)

- Cross-project memory or workspace-wide preference learning
- Cost tracking dashboard (data captured, no UI)
- Voice or multimodal input
- Background agents that run without an open thread
- Streaming `streamWithTools()` for Ollama (chat-only fallback only)
- Image/PDF upload analysis (already in copilot input but separate spec covers it)
- Real-time collaboration (multiple PMs in the same thread)
- Custom tool creation by end users
