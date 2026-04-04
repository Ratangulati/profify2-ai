# PM Copilot Design Spec

## Overview

An always-available AI assistant embedded in the workspace right panel with full context of the project's data. The copilot streams responses, cites specific evidence, shows transparent tool traces, and persists conversation history per project.

**Goal:** Give PMs a conversational interface to query all project knowledge — feedback, specs, decisions, analytics — with evidence-backed, streaming responses.

---

## 1. Architecture & Data Flow

Three layers:

### Database

New `CopilotThread` and `CopilotMessage` tables for persistent chat history per project. Messages store role, content, tool traces, citations, and feedback.

### API (Express)

New `POST /copilot/chat` streaming endpoint. Pipeline per request:

1. Receive user message + active context (what's open in the editor) + mentioned entity IDs
2. Persist user message to DB
3. **Command detection** — check if message matches a pre-built command pattern. If matched, short-circuit intent classification and set up targeted evidence retrieval.
4. **Context assembly (RAG)** — gather: project metadata + personas, conversation history (last 20 messages), active panel context, and retrieved evidence (insights, specs, decisions, feedback, themes) via text search
5. **Function-calling loop** — LLM sees assembled context + 5 available tools. If it decides to call tools, execute them, append results, re-prompt. Max 3 tool rounds.
6. **Stream response** via SSE (`text/event-stream`). Events: `tool_start`, `tool_result`, `content_delta`, `citation`, `done`
7. Persist assistant message (with tool traces + citations) to DB

### Frontend

Replace existing `ChatView` in AgentPanel with `CopilotPanel`. Rename tab from "Chat" to "Copilot". Add @mention autocomplete, command quick-action chips, streaming message rendering, collapsible tool traces, clickable citation links, and thumbs up/down feedback. `Cmd+J` focuses the copilot input.

---

## 2. Database Schema

### CopilotThread

| Field     | Type          | Notes                             |
| --------- | ------------- | --------------------------------- |
| id        | String (cuid) | Primary key                       |
| projectId | String        | FK to Project                     |
| title     | String?       | Auto-generated from first message |
| createdAt | DateTime      |                                   |
| updatedAt | DateTime      |                                   |

Index: `projectId` for thread listing.

### CopilotMessage

| Field         | Type                           | Notes                                                              |
| ------------- | ------------------------------ | ------------------------------------------------------------------ |
| id            | String (cuid)                  | Primary key                                                        |
| threadId      | String                         | FK to CopilotThread                                                |
| role          | Enum (USER, ASSISTANT, SYSTEM) | Message sender                                                     |
| content       | String                         | Message body text                                                  |
| mentions      | Json?                          | Array of `{type, id, title}` for @-referenced entities             |
| toolTrace     | Json?                          | Array of `{tool, input, result, durationMs}`                       |
| citations     | Json?                          | Array of `{type, id, title, quote?}`                               |
| feedback      | Enum (POSITIVE, NEGATIVE)?     | Thumbs up/down                                                     |
| activeContext | Json?                          | Snapshot of editor state: `{specId?, specTitle?, sectionContent?}` |
| commandType   | String?                        | Pre-built command that triggered this message                      |
| createdAt     | DateTime                       |                                                                    |

Index: `threadId + createdAt` for efficient history loading.

### CopilotMessageRole Enum

```
USER
ASSISTANT
SYSTEM
```

### CopilotFeedback Enum

```
POSITIVE
NEGATIVE
```

---

## 3. Streaming LLM Provider Extension

New `streamComplete()` method on the existing `LLMProvider` interface:

```typescript
interface StreamEvent {
  type: "content_delta" | "done";
  content?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface LLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  streamComplete(request: CompletionRequest): AsyncIterable<StreamEvent>;
  embed?(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
```

**OpenAI implementation:** Uses `client.chat.completions.create({ stream: true })`, yields `content_delta` per chunk, `done` with usage at end.

**Anthropic implementation:** Uses Anthropic streaming API, same yield pattern.

### SSE Wire Format (API to Frontend)

```
event: thread_created
data: {"threadId":"thr_abc"}

event: tool_start
data: {"tool":"search_insights","input":{"query":"onboarding"}}

event: tool_result
data: {"tool":"search_insights","results":3,"durationMs":120}

event: content_delta
data: {"text":"Based on 12 feedback items"}

event: citation
data: {"type":"insight","id":"ins_abc","title":"Onboarding drop-off","quote":"Users get stuck..."}

event: done
data: {"messageId":"msg_xyz"}
```

Frontend reads with `fetch()` + `ReadableStream` (not `EventSource`, since we need POST with a body).

---

## 4. Context Assembly & Function Calling

### Context Assembly (4 layers, every request)

1. **Project context** (~500 tokens) — project name, description, strategic bets, active personas (names + goals). Fetched once per thread, cached.

2. **Conversation history** (~4000 tokens) — last 20 messages from the thread. If thread is longer, older messages summarized as "Earlier in this conversation, you discussed X, Y, Z".

3. **Active context** (~1000 tokens) — frontend sends `activeContext: {specId?, specTitle?, sectionContent?}`. If a spec is open, load its title and current section text.

4. **Retrieved context** (~3000 tokens) — text search across insights, specs, decisions, feedback, themes using the user's query (reusing existing `assembleEvidence()` pattern). @-mentioned entities loaded directly by ID and prepended to evidence.

### Function Calling (5 tools, max 3 rounds)

| Tool              | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `search_insights` | Text search across insights, returns top 10 with quotes |
| `search_feedback` | Search raw feedback items by content/segment            |
| `get_decisions`   | Look up decisions by feature area or keyword            |
| `lookup_spec`     | Load a spec's content by ID or title                    |
| `get_analytics`   | Get opportunity scores and theme trends                 |

Loop: LLM responds -> if tool calls, execute, append results as tool messages, re-prompt -> repeat until text response or 3 rounds hit. Each tool execution emits `tool_start`/`tool_result` SSE events.

### Pre-Built Commands

Pattern-matched before the LLM call. Optimize context assembly and add command-specific system prompt suffix. They do NOT bypass the LLM.

| Pattern                                   | Behavior                                                          |
| ----------------------------------------- | ----------------------------------------------------------------- |
| "What did users say about X?"             | Pre-searches insights+feedback for X, skips intent classification |
| "Have we considered this before?"         | Searches decisions+specs, frames as historical lookup             |
| "Summarize last month's feedback"         | Loads recent feedback with date filter, asks LLM to summarize     |
| "Prep me for an interview with [persona]" | Loads persona + knowledge gaps, generates questions               |
| "Why are users churning?"                 | Loads PAIN_POINT insights + churn-related feedback                |
| "Write a stakeholder update"              | Loads recent decisions, shipped opportunities, key metrics        |
| "Draft a competitive brief for [area]"    | Loads competitor mentions + feature comparisons                   |

### System Prompt

```
You are a senior product management assistant with deep knowledge of this product and its users. You have access to all customer feedback, product specs, user research, analytics data, and past decisions for this project.

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

When citing evidence, use this format: [Type: Title](id) — e.g., [Insight: Onboarding drop-off](ins_abc)
```

---

## 5. API Endpoints

All under `apps/api/src/routes/copilot.ts`. Auth: `authenticate -> enforceWorkspace -> requireRole`.

### POST `/workspaces/:wid/projects/:pid/copilot/chat`

**Auth:** `requireRole("project", "write")`

**Request:**

```json
{
  "message": "What did users say about onboarding?",
  "mentions": [{ "type": "theme", "id": "thm_abc", "title": "Onboarding" }],
  "activeContext": { "specId": "spc_123", "specTitle": "Onboarding Redesign" },
  "threadId": null
}
```

**Response:** `Content-Type: text/event-stream` — SSE events as defined in Section 3. If `threadId` is null, creates a new thread and sends `thread_created` event first.

### GET `/workspaces/:wid/projects/:pid/copilot/threads`

**Auth:** `requireRole("project", "read")`

**Response:**

```json
{
  "threads": [
    { "id": "thr_abc", "title": "Onboarding discussion", "messageCount": 12, "updatedAt": "..." }
  ]
}
```

### GET `/workspaces/:wid/projects/:pid/copilot/threads/:tid/messages`

**Auth:** `requireRole("project", "read")`

**Query:** `?limit=50&before=msg_xyz` (cursor pagination)

**Response:**

```json
{
  "messages": [{"id": "msg_1", "role": "USER", "content": "...", "citations": [...], "toolTrace": [...], "createdAt": "..."}],
  "hasMore": true
}
```

### PATCH `/workspaces/:wid/projects/:pid/copilot/messages/:mid/feedback`

**Auth:** `requireRole("project", "write")`

**Request:** `{"feedback": "POSITIVE" | "NEGATIVE" | null}`

### POST `/workspaces/:wid/projects/:pid/copilot/mentions/search`

**Auth:** `requireRole("project", "read")`

**Request:** `{"query": "onb", "types": ["spec", "insight", "theme", "decision"]}`

**Response:**

```json
{
  "results": [{ "type": "spec", "id": "spc_abc", "title": "Onboarding Redesign" }]
}
```

Max 8 results. Fast DB text search, no LLM.

---

## 6. Frontend Components

All under `apps/web/src/components/copilot/`. Replace existing `ChatView` in AgentPanel.

### CopilotPanel.tsx

Top-level container. Manages thread state, loads message history on mount, handles SSE streaming, holds AbortController for cancellation. React state only, no external store.

### CopilotInput.tsx

Input area at bottom:

- Auto-resizing textarea
- `@` trigger opens MentionPopover — searches entities by title via `/copilot/mentions/search`, inserts mention token
- File upload button (screenshot/doc). Max 5MB. Images sent as base64 data URL in the message payload under an `attachments` array. The API extracts a text description via the LLM's vision capability and includes it in the context as "Attached image: [LLM-generated description]". Non-image files (PDF, text) have their text content extracted and appended to the message context directly.
- Enter to send, Shift+Enter for newline
- `Cmd+J` global shortcut focuses input and switches to Copilot tab

### CommandChips.tsx

Row of quick-action buttons above input. Shown when thread is empty or after response completes. Clicking populates input with command text. Labels: "User feedback", "Past decisions", "Feedback summary", "Interview prep", "Churn analysis", "Stakeholder update", "Competitive brief".

### MessageBubble.tsx

Renders a single message. For assistant messages:

- Markdown rendering (reuse prose styles from editor)
- Collapsible tool trace — "Searched 47 insights, looked up 2 decisions..."
- Inline citations as clickable chips: `[Insight: Onboarding drop-off]`
- Actions: Copy, Insert into spec, thumbs up/down
- Streaming: content appears token-by-token, tool trace populates as tools run

### CitationChip.tsx

Inline citation reference. Entity type icon + truncated title. Click could navigate to entity in left panel.

### MentionPopover.tsx

Dropdown triggered by `@` in the input. Searches entities as user types. Shows type icon + title. Selecting inserts `@[Title](type:id)` token into the input. Debounced search (200ms).

---

## 7. Error Handling

- **LLM failure:** Stream sends `event: error` with `{"message": "..."}`, frontend shows inline error with retry button. User message is still persisted.
- **Tool failure:** Individual tool failures are non-fatal. Tool trace shows the error, LLM continues with available context.
- **Stream disconnect:** Frontend detects broken stream, shows "Connection lost" with retry. On retry, loads latest messages from DB to avoid duplication.
- **Rate limiting:** Same global rate limit as other API endpoints. 429 response before stream starts.
- **Auth failure:** 401/403 before stream starts, standard error JSON response.
