# MCP Server Design — PM-YC Product Intelligence

**Date:** 2026-04-03
**Status:** Approved
**Scope:** Full MCP-compliant server exposing platform intelligence to AI coding agents

---

## Overview

A standalone MCP (Model Context Protocol) server that gives AI coding agents (Claude Code, Cursor, etc.) access to PM-YC's product intelligence: specs, feedback, opportunities, decisions, and edge cases. Agents call structured tools to get context before coding, validate implementations against specs, and search across all project knowledge.

**Architecture:** Hybrid data access. Direct Prisma DB for all reads (8 of 8 tools). HTTP only for external integrations (Linear/Jira ticket updates in `report_task_completion`).

---

## File Structure

```
apps/mcp-server/src/
  index.ts              # Entry point — stdio or SSE based on --sse flag
  server.ts             # McpServer creation, tool + resource registration
  env.ts                # Zod-validated environment config
  tools/
    index.ts            # Registers all tools with the server
    context.ts          # get_context_for_feature
    feedback.ts         # query_user_feedback
    opportunities.ts    # get_opportunity_details
    validation.ts       # validate_against_spec
    decisions.ts        # get_decision_history
    tasks.ts            # report_task_completion
    edge-cases.ts       # get_edge_cases
    search.ts           # search_all_knowledge
  resources/
    index.ts            # Registers all resources
    project.ts          # roadmap, personas, themes
    spec.ts             # spec documents
  data/
    specs.ts            # Shared spec loading queries
    evidence.ts         # Shared evidence assembly queries
    search.ts           # Cross-entity text search
  middleware/
    auth.ts             # API key validation, workspace scoping
    rate-limit.ts       # Sliding window in-memory rate limiter
    cache.ts            # In-memory TTL cache
```

---

## Transport

Two entry modes from a single `src/index.ts`:

- **stdio** (default): `pm-yc-mcp` or `pnpm dev`. API key from `PM_YC_API_KEY` env var. Uses `StdioServerTransport` from the MCP SDK.
- **SSE** (`--sse` flag): `pm-yc-mcp --sse` or `pnpm dev:sse`. Runs an Express server on `PORT` (default 3100). API key from `Authorization: Bearer pmyc_...` header. Uses `SSEServerTransport` from the MCP SDK.

SSE endpoints:

- `POST /mcp` — accepts MCP JSON-RPC messages
- `GET /mcp/sse` — establishes SSE stream for server-to-client messages
- `GET /health` — unauthenticated `{ status: "ok", version }` response

---

## Authentication

Every tool/resource call is authenticated via a `withAuth()` async function (not Express middleware — MCP tools are plain async functions).

**Flow:**

1. Read API key from context (env var for stdio, connection metadata for SSE)
2. `hashApiKey()` via `@pm-yc/auth` → lookup in `api_keys` table
3. Check key expiration
4. Verify `project_id` param belongs to `apiKey.workspaceId` (via Project table)
5. Check `apiKey.scopes` against tool's required scope. Scopes support `*` (all) and `resource:*` (all actions on resource).
6. Return `{ workspaceId, scopes }` or throw MCP error code `-32001`

**Scope requirements per tool:**

| Tool                      | Required Scope              |
| ------------------------- | --------------------------- |
| `get_context_for_feature` | `project:read`, `spec:read` |
| `query_user_feedback`     | `feedback_item:read`        |
| `get_opportunity_details` | `opportunity:read`          |
| `validate_against_spec`   | `spec:read`                 |
| `get_decision_history`    | `decision:read`             |
| `report_task_completion`  | `ticket:update`             |
| `get_edge_cases`          | `spec:read`                 |
| `search_all_knowledge`    | `project:read`              |

---

## Rate Limiting

In-memory sliding window counter:

- **Key:** API key hash
- **Window:** 60 seconds
- **Limit:** Configurable via `RATE_LIMIT_RPM` env var, default 100
- **On exceed:** MCP error code `-32029`, message includes retry-after seconds
- **Cleanup:** Expired entries pruned every 60s via `setInterval`

In-memory is sufficient — each MCP server instance handles one connection (stdio) or a small number (SSE).

---

## Cache

In-memory TTL cache (`Map<string, { data, expiresAt }>`):

- **Default TTL:** 5 minutes (configurable via `CACHE_TTL_SECONDS`)
- **Key format:** `tool:param1:param2` (deterministic from tool name + serialized input)
- **Cached tools:** `get_context_for_feature`, `get_opportunity_details`, `get_decision_history`, `get_edge_cases`
- **Not cached:** `query_user_feedback`, `validate_against_spec`, `report_task_completion`, `search_all_knowledge` (all query-dependent or write operations)
- **Invalidation:** `invalidate(prefix)` clears matching keys. `report_task_completion` busts ticket-related caches.
- **Cleanup:** Expired entries pruned every 5 min

Resources (roadmap, personas, themes, spec) are also cached with the same 5 min TTL.

---

## Tools

### 1. `get_context_for_feature`

**Purpose:** Agent starting work on a feature gets ALL context in one call.

**Input:**

```typescript
{
  project_id: string,
  feature_name?: string,  // text search on spec titles
  spec_id?: string         // direct lookup — takes precedence over feature_name
  // At least one of feature_name or spec_id required. If both, spec_id wins.
}
```

**Output:**

```typescript
{
  spec: { id, title, status, sections[], version },
  user_needs: { pain_points[], desires[], quotes[] },
  constraints: string[],       // from spec assumptions + non-goals
  data_model: string | null,   // from spec "data model" section if present
  past_decisions: { id, title, rationale, outcome, status }[],
  success_metrics: string[],   // from spec "success metrics" section
  edge_cases: { description, expected_behavior, source }[]
}
```

**Data source:** Direct DB. Loads Spec (latest SpecVersion content), SpecEvidence with linked Insights (including insightEvidence quotes), Assumptions, Decisions for the project filtered by feature area. Extracts constraints/metrics/data-model from spec section content by section ID.

### 2. `query_user_feedback`

**Purpose:** Agent asks "what did users say about X?" and gets relevant feedback.

**Input:**

```typescript
{
  project_id: string,
  query: string,
  filters?: {
    segment?: string,
    source?: string,
    date_range?: { from: string, to: string }  // ISO dates
  },
  limit?: number  // default 20, max 50
}
```

**Output:**

```typescript
{
  results: {
    id: string,
    content: string,
    customer_name: string | null,
    segment_tags: string[],
    sentiment: string,
    sentiment_score: number | null,
    source: string | null,
    created_at: string
  }[],
  total_matches: number
}
```

**Data source:** Direct DB. Text search on `feedbackItem.content` using Prisma `contains` (case-insensitive). Applies segment (`hasSome`), source, and date range filters. Ordered by `createdAt` desc. Not cached (query-dependent).

### 3. `get_opportunity_details`

**Purpose:** Full opportunity with evidence chain, all scores, and linked specs.

**Input:**

```typescript
{
  project_id: string,
  opportunity_id: string
}
```

**Output:**

```typescript
{
  opportunity: { id, title, description, status },
  scores: {
    composite: { score, frequency, severity, alignment, effort_inverse, confidence },
    rice: { score, reach, impact, confidence, effort },
    ice: { score, impact, confidence, ease },
    segment_weighted_freq: number | null
  },
  evidence_chain: {
    insights: { id, title, type, severity, quotes[] }[],
    feedback_count: number
  },
  linked_specs: { id, title, status }[],
  themes: { id, title, feedback_count }[]
}
```

**Data source:** Direct DB. Opportunity with linkedInsights (including insightEvidence for quotes), OpportunityTheme → Theme, Specs linked via SpecEvidence referencing the opportunity's insights.

### 4. `validate_against_spec`

**Purpose:** Before committing, agent checks if implementation matches spec.

**Input:**

```typescript
{
  project_id: string,
  spec_id: string,
  implementation_description: string  // max 5000 chars
}
```

**Output:**

```typescript
{
  matches: boolean,
  coverage_score: number,        // 0-1
  gaps: string[],                // spec requirements not addressed
  suggestions: string[],         // improvements to align with spec
  matched_requirements: string[] // spec requirements that ARE covered
}
```

**Data source:** Direct DB to load spec content + LLM call. Uses `createProvider()` from `@pm-yc/ai`, temperature 0.3, max 4000 tokens. Prompt sends each spec section and asks the LLM to evaluate coverage. JSON response with fallback to text parsing. 30-second timeout via AbortController.

### 5. `get_decision_history`

**Purpose:** "Why was this decided?" — agent gets historical context with evidence.

**Input:**

```typescript
{
  project_id: string,
  feature_area?: string,  // text search on decision titles
  query?: string,         // text search on title + rationale
  limit?: number          // default 10, max 30
}
```

**Output:**

```typescript
{
  decisions: {
    id: string,
    title: string,
    rationale: string,
    outcome: string | null,
    status: string,
    evidence: { type: string, reference: string, summary: string }[],
    decided_at: string | null,
    created_at: string
  }[]
}
```

**Data source:** Direct DB. Decision with DecisionEvidence. Text search on `title` and `rationale` using `contains` (case-insensitive). Filtered to project. Ordered by `decidedAt` desc, then `createdAt` desc.

### 6. `report_task_completion`

**Purpose:** Agent reports task status, auto-updates ticket in Linear/Jira.

**Input:**

```typescript
{
  project_id: string,
  ticket_id: string,
  status: "completed" | "blocked",
  notes?: string
}
```

**Output:**

```typescript
{
  success: boolean,
  ticket_title: string,
  updated_status: string,
  external_url: string | null,  // Linear/Jira URL if synced
  synced_external: boolean       // whether external update succeeded
}
```

**Data source:** Direct DB to update local `Ticket.status` and append to `Ticket.metadata.notes`. If `ticket.externalId` and `ticket.provider` exist, makes HTTP call to the external API via `@pm-yc/integrations` to update status. Returns `synced_external: false` with no error if external sync fails (non-blocking).

### 7. `get_edge_cases`

**Purpose:** Enumerated edge cases with expected behaviors for a feature.

**Input:**

```typescript
{
  project_id: string,
  spec_id?: string,
  feature_area?: string   // text search if no spec_id
  // At least one required
}
```

**Output:**

```typescript
{
  edge_cases: {
    description: string,
    expected_behavior: string,
    severity: "low" | "medium" | "high",
    source: "spec" | "feedback" | "inferred"
  }[]
}
```

**Data source:** Direct DB to load spec + assumptions + linked feedback pain points. LLM call to enumerate edge cases from the combined context. Temperature 0.3, JSON output. Assumptions with `riskLevel: HIGH` are explicitly included as high-severity edge cases. Cached by spec_id (5 min TTL).

### 8. `search_all_knowledge`

**Purpose:** Cross-reference all platform data and return relevant results.

**Input:**

```typescript
{
  project_id: string,
  query: string,
  limit?: number  // default 20, max 50
}
```

**Output:**

```typescript
{
  results: {
    type: "insight" | "spec" | "decision" | "feedback" | "theme" | "opportunity",
    id: string,
    title: string,
    snippet: string,       // relevant excerpt, max 200 chars
    relevance_score: number // 0-1, based on match position/quality
  }[]
}
```

**Data source:** Direct DB. Parallel queries across 6 tables (Insight, Spec, Decision, FeedbackItem, Theme, Opportunity) using `contains` text search on title/content fields. Results merged, deduplicated, and sorted by a simple relevance heuristic (title match > content match, shorter match distance = higher score). Capped at `limit`.

---

## Resources

### `project://{project_id}/roadmap`

Returns prioritized opportunities:

```typescript
{
  opportunities: {
    (id, title, status, composite_score, rice_score, effort_estimate, linked_insight_count);
  }
  [];
}
```

Query: `Opportunity` where `projectId`, ordered by `compositeScore` desc, take 30.

### `project://{project_id}/personas`

Returns user personas:

```typescript
{
  personas: {
    id, name, description, goals[], frustrations[],
    behaviors, demographics
  }[]
}
```

Query: `Persona` where `projectId`.

### `project://{project_id}/themes`

Returns active theme clusters:

```typescript
{
  themes: {
    id, title, description, feedback_count, color,
    top_insights: { id, title, severity }[]
  }[]
}
```

Query: `Theme` where `projectId`, include insights (take 5, order by severity desc), ordered by `feedbackCount` desc.

### `spec://{spec_id}`

Returns full spec document:

```typescript
{
  id, title, type, status,
  content: { sections[] },
  version: number,
  evidence_count: number,
  assumption_count: number,
  created_at, updated_at
}
```

Query: `Spec` with latest `SpecVersion`, count of `SpecEvidence` and `Assumption`.

All resources validate workspace ownership before returning data.

---

## Error Handling

All errors are MCP-protocol-compliant JSON-RPC error responses.

| Category        | MCP Error Code | Examples                                                                     |
| --------------- | -------------- | ---------------------------------------------------------------------------- |
| Auth/permission | `-32001`       | Invalid API key, expired key, scope insufficient, project not in workspace   |
| Validation      | `-32602`       | Missing required field, invalid date range, spec not found, ticket not found |
| Internal        | `-32603`       | DB connection failure, LLM timeout, integration API error                    |

**Handler pattern:**

```
try/catch wrapping each tool handler:
  - ZodError → -32602 with field-level messages
  - Prisma NotFoundError → -32602 with "{resource} not found"
  - Auth errors → -32001 with specific message
  - LLM timeout (30s AbortController) → -32603 with "LLM request timed out"
  - All else → -32603 with sanitized message (no stack traces)
```

---

## LLM Integration

Two tools require LLM calls: `validate_against_spec` and `get_edge_cases`.

- Provider: `createProvider()` from `@pm-yc/ai`, configured by `LLM_PROVIDER` env var
- Temperature: 0.3 for structured output
- Timeout: 30 seconds via `AbortController`
- Output format: JSON with fallback text parsing (same pattern as `parsePRDResponse` in the existing PRD generator)
- If no LLM key is configured and an LLM-dependent tool is called: error `-32603` with "LLM provider not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY."

---

## Environment Variables

| Variable            | Required     | Default  | Description                     |
| ------------------- | ------------ | -------- | ------------------------------- |
| `DATABASE_URL`      | Yes          | —        | Postgres connection string      |
| `PM_YC_API_KEY`     | stdio only   | —        | API key for stdio mode          |
| `LLM_PROVIDER`      | No           | `openai` | `openai` or `anthropic`         |
| `OPENAI_API_KEY`    | If openai    | —        | For LLM-dependent tools         |
| `ANTHROPIC_API_KEY` | If anthropic | —        | For LLM-dependent tools         |
| `PORT`              | No           | `3100`   | SSE server port                 |
| `RATE_LIMIT_RPM`    | No           | `100`    | Requests per minute per API key |
| `CACHE_TTL_SECONDS` | No           | `300`    | Default cache TTL               |

Validated at startup with Zod. Missing `DATABASE_URL` is a fatal error. Missing LLM keys are warned but not fatal (only tools that need them will error).

---

## Dependencies (additions to package.json)

```json
{
  "@pm-yc/db": "workspace:*",
  "@pm-yc/auth": "workspace:*",
  "express": "^4.21.0",
  "@types/express": "^5.0.0" // devDependencies
}
```

`@pm-yc/ai`, `@pm-yc/shared`, `@modelcontextprotocol/sdk`, and `zod` are already present.

---

## Package.json Scripts

```json
{
  "dev": "tsx watch src/index.ts",
  "dev:sse": "tsx watch src/index.ts --sse",
  "build": "tsup src/index.ts --format esm",
  "start": "node dist/index.js",
  "start:sse": "node dist/index.js --sse",
  "type-check": "tsc --noEmit",
  "lint": "eslint src/"
}
```
