# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full MCP-compliant server that exposes PM-YC platform intelligence (specs, feedback, opportunities, decisions) to AI coding agents via 8 tools and 4 resources.

**Architecture:** Hybrid data access — direct Prisma DB for all reads, HTTP only for future external integrations (Linear/Jira). Dual transport: stdio (local agents) and SSE (remote agents). API key authentication scoped to workspaces.

**Tech Stack:** @modelcontextprotocol/sdk, Prisma (@pm-yc/db), @pm-yc/auth, @pm-yc/ai, Express (SSE transport), Zod, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-03-mcp-server-design.md`

---

## File Map

```
apps/mcp-server/src/
  index.ts              # MODIFY — entry point, add --sse flag routing
  server.ts             # MODIFY — register tools + resources
  env.ts                # CREATE — Zod-validated environment config
  middleware/
    auth.ts             # CREATE — API key validation, workspace scoping
    rate-limit.ts       # CREATE — sliding window in-memory rate limiter
    cache.ts            # CREATE — in-memory TTL cache
  data/
    specs.ts            # CREATE — shared spec loading queries
    evidence.ts         # CREATE — shared evidence assembly queries
    search.ts           # CREATE — cross-entity text search
  tools/
    index.ts            # MODIFY — register all 8 tools
    context.ts          # CREATE — get_context_for_feature
    feedback.ts         # CREATE — query_user_feedback
    opportunities.ts    # CREATE — get_opportunity_details
    validation.ts       # CREATE — validate_against_spec
    decisions.ts        # CREATE — get_decision_history
    tasks.ts            # CREATE — report_task_completion
    edge-cases.ts       # CREATE — get_edge_cases
    search.ts           # CREATE — search_all_knowledge
  resources/
    index.ts            # CREATE — register all 4 resources
    project.ts          # CREATE — roadmap, personas, themes resources
    spec.ts             # CREATE — spec document resource
apps/mcp-server/package.json  # MODIFY — add @pm-yc/db, @pm-yc/auth, express
```

---

### Task 1: Update Dependencies and Environment Config

**Files:**

- Modify: `apps/mcp-server/package.json`
- Create: `apps/mcp-server/src/env.ts`

- [ ] **Step 1: Add dependencies to package.json**

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.3.0",
    "@pm-yc/ai": "workspace:*",
    "@pm-yc/auth": "workspace:*",
    "@pm-yc/db": "workspace:*",
    "@pm-yc/shared": "workspace:*",
    "express": "^4.21.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@pm-yc/eslint-config": "workspace:*",
    "@pm-yc/tsconfig": "workspace:*",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.5",
    "tsup": "^8.3.5",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

Also update `scripts` to add SSE dev mode:

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "dev:sse": "tsx watch src/index.ts --sse",
  "build": "tsup src/index.ts --format esm",
  "start": "node dist/index.js",
  "start:sse": "node dist/index.js --sse",
  "type-check": "tsc --noEmit",
  "lint": "eslint src/",
  "clean": "rm -rf dist .turbo"
}
```

- [ ] **Step 2: Create env.ts**

```typescript
// apps/mcp-server/src/env.ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PM_YC_API_KEY: z.string().optional(),
  LLM_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
  OPENAI_API_KEY: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  PORT: z.coerce.number().default(3100),
  RATE_LIMIT_RPM: z.coerce.number().default(100),
  CACHE_TTL_SECONDS: z.coerce.number().default(300),
});

export const env = envSchema.parse(process.env);

export function getLLMApiKey(): string | undefined {
  if (env.LLM_PROVIDER === "anthropic") return env.ANTHROPIC_API_KEY || undefined;
  return env.OPENAI_API_KEY || undefined;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mcp-server/package.json apps/mcp-server/src/env.ts
git commit -m "feat(mcp): add dependencies and environment config"
```

---

### Task 2: Build Middleware — Auth, Rate Limiter, Cache

**Files:**

- Create: `apps/mcp-server/src/middleware/auth.ts`
- Create: `apps/mcp-server/src/middleware/rate-limit.ts`
- Create: `apps/mcp-server/src/middleware/cache.ts`

- [ ] **Step 1: Create auth middleware**

```typescript
// apps/mcp-server/src/middleware/auth.ts
import { hashApiKey } from "@pm-yc/auth";
import { db } from "@pm-yc/db";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

import { env } from "../env.js";

export interface AuthContext {
  workspaceId: string;
  keyId: string;
  scopes: string[];
}

/** Cached API key context for the stdio session (resolved once). */
let cachedAuth: AuthContext | null = null;

/**
 * Resolve API key from stdio env or SSE connection metadata.
 * Returns the raw key string.
 */
export function resolveApiKey(sseApiKey?: string): string {
  const raw = sseApiKey ?? env.PM_YC_API_KEY;
  if (!raw) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "API key required. Set PM_YC_API_KEY env var (stdio) or pass Authorization header (SSE).",
    );
  }
  return raw;
}

/**
 * Authenticate an API key and return workspace context.
 * Caches the result for stdio mode (single key per session).
 */
export async function authenticateApiKey(rawKey: string): Promise<AuthContext> {
  if (cachedAuth) return cachedAuth;

  const keyHash = hashApiKey(rawKey);
  const apiKey = await db.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      workspaceId: true,
      scopes: true,
      expiresAt: true,
    },
  });

  if (!apiKey) {
    throw new McpError(ErrorCode.InvalidRequest, "Invalid API key.");
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    throw new McpError(ErrorCode.InvalidRequest, "API key has expired.");
  }

  // Fire-and-forget last used update
  db.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  const ctx: AuthContext = {
    workspaceId: apiKey.workspaceId,
    keyId: apiKey.id,
    scopes: apiKey.scopes,
  };

  // Cache for stdio (one key per session)
  if (env.PM_YC_API_KEY) {
    cachedAuth = ctx;
  }

  return ctx;
}

/**
 * Check that a scope is allowed by the API key.
 * Supports wildcard: "*" (all), "resource:*" (all actions on resource).
 */
export function checkScope(scopes: string[], required: string): void {
  if (scopes.includes("*")) return;

  const [resource] = required.split(":");
  if (scopes.includes(`${resource}:*`)) return;

  if (!scopes.includes(required)) {
    throw new McpError(ErrorCode.InvalidRequest, `Insufficient scope. Required: "${required}".`);
  }
}

/**
 * Verify that a project belongs to the authenticated workspace.
 */
export async function verifyProjectAccess(workspaceId: string, projectId: string): Promise<void> {
  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId, archived: false },
    select: { id: true },
  });

  if (!project) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Project "${projectId}" not found in this workspace.`,
    );
  }
}

/**
 * Full auth check: resolve key → authenticate → verify project → check scope.
 */
export async function withAuth(
  projectId: string,
  requiredScope: string,
  sseApiKey?: string,
): Promise<AuthContext> {
  const rawKey = resolveApiKey(sseApiKey);
  const ctx = await authenticateApiKey(rawKey);
  await verifyProjectAccess(ctx.workspaceId, projectId);
  checkScope(ctx.scopes, requiredScope);
  return ctx;
}
```

- [ ] **Step 2: Create rate limiter**

```typescript
// apps/mcp-server/src/middleware/rate-limit.ts
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

import { env } from "../env.js";

interface WindowEntry {
  timestamps: number[];
}

const windows = new Map<string, WindowEntry>();
const WINDOW_MS = 60_000;

/**
 * Check rate limit for an API key. Throws McpError if exceeded.
 */
export function checkRateLimit(keyId: string): void {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let entry = windows.get(keyId);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(keyId, entry);
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= env.RATE_LIMIT_RPM) {
    const oldestInWindow = entry.timestamps[0]!;
    const retryAfter = Math.ceil((oldestInWindow + WINDOW_MS - now) / 1000);
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Rate limit exceeded (${env.RATE_LIMIT_RPM}/min). Retry after ${retryAfter}s.`,
    );
  }

  entry.timestamps.push(now);
}

/** Prune expired entries. Call on an interval. */
export function pruneRateLimitEntries(): void {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, entry] of windows) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) windows.delete(key);
  }
}

/** Start periodic cleanup. Returns cleanup function. */
export function startRateLimitCleanup(): () => void {
  const interval = setInterval(pruneRateLimitEntries, WINDOW_MS);
  return () => clearInterval(interval);
}
```

- [ ] **Step 3: Create cache**

```typescript
// apps/mcp-server/src/middleware/cache.ts
import { env } from "../env.js";

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

/**
 * Build a deterministic cache key from tool name and params.
 */
export function cacheKey(tool: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${JSON.stringify(params[k])}`)
    .join("&");
  return `${tool}:${sorted}`;
}

/**
 * Get a cached value. Returns undefined if missing or expired.
 */
export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

/**
 * Set a cached value with optional TTL override (seconds).
 */
export function cacheSet(key: string, data: unknown, ttlSeconds?: number): void {
  const ttl = (ttlSeconds ?? env.CACHE_TTL_SECONDS) * 1000;
  store.set(key, { data, expiresAt: Date.now() + ttl });
}

/**
 * Invalidate all keys matching a prefix.
 */
export function cacheInvalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Prune expired entries. */
export function pruneCacheEntries(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}

/** Start periodic cleanup. Returns cleanup function. */
export function startCacheCleanup(): () => void {
  const interval = setInterval(pruneCacheEntries, env.CACHE_TTL_SECONDS * 1000);
  return () => clearInterval(interval);
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mcp-server/src/middleware/
git commit -m "feat(mcp): add auth, rate-limit, and cache middleware"
```

---

### Task 3: Build Shared Data Layer

**Files:**

- Create: `apps/mcp-server/src/data/specs.ts`
- Create: `apps/mcp-server/src/data/evidence.ts`
- Create: `apps/mcp-server/src/data/search.ts`

- [ ] **Step 1: Create specs data layer**

```typescript
// apps/mcp-server/src/data/specs.ts
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
```

- [ ] **Step 2: Create evidence data layer**

```typescript
// apps/mcp-server/src/data/evidence.ts
import { db } from "@pm-yc/db";

/**
 * Load insights linked to a spec via SpecEvidence, including quotes.
 */
export async function loadSpecInsightsWithQuotes(specId: string) {
  const evidence = await db.specEvidence.findMany({
    where: { specId, insightId: { not: null } },
    include: {
      insight: {
        include: {
          insightEvidence: {
            take: 5,
            select: { quote: true },
          },
        },
      },
    },
  });

  return evidence
    .filter((e) => e.insight !== null)
    .map((e) => ({
      id: e.insight!.id,
      title: e.insight!.title,
      type: e.insight!.type,
      severityScore: e.insight!.severityScore,
      description: e.insight!.description,
      quotes: e.insight!.insightEvidence.map((ie) => ie.quote),
    }));
}

/**
 * Load insights linked to an opportunity, including quotes.
 */
export async function loadOpportunityInsightsWithQuotes(opportunityId: string) {
  const links = await db.opportunityInsight.findMany({
    where: { opportunityId },
    include: {
      insight: {
        include: {
          insightEvidence: {
            take: 5,
            select: { quote: true },
          },
        },
      },
    },
  });

  return links.map((l) => ({
    id: l.insight.id,
    title: l.insight.title,
    type: l.insight.type,
    severityScore: l.insight.severityScore,
    quotes: l.insight.insightEvidence.map((ie) => ie.quote),
  }));
}

/**
 * Count feedback items linked to an opportunity's insights.
 */
export async function countOpportunityFeedback(opportunityId: string): Promise<number> {
  const links = await db.opportunityInsight.findMany({
    where: { opportunityId },
    select: { insightId: true },
  });

  if (links.length === 0) return 0;

  const insightIds = links.map((l) => l.insightId);
  return db.insightEvidence.count({
    where: { insightId: { in: insightIds } },
  });
}

/**
 * Load decisions related to a project, optionally filtered by text.
 */
export async function loadDecisions(
  projectId: string,
  opts?: { query?: string; featureArea?: string; limit?: number },
) {
  const limit = Math.min(opts?.limit ?? 10, 30);
  const where: Record<string, unknown> = { projectId };

  if (opts?.query) {
    where.OR = [
      { title: { contains: opts.query, mode: "insensitive" } },
      { rationale: { contains: opts.query, mode: "insensitive" } },
    ];
  } else if (opts?.featureArea) {
    where.title = { contains: opts.featureArea, mode: "insensitive" };
  }

  return db.decision.findMany({
    where,
    orderBy: [{ decidedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      decisionEvidence: {
        include: {
          insight: {
            select: { id: true, title: true, type: true },
          },
        },
      },
    },
  });
}
```

- [ ] **Step 3: Create cross-entity search**

```typescript
// apps/mcp-server/src/data/search.ts
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

  // Sort by relevance descending, cap at limit
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

  // Title exact match = 1.0, title contains = 0.8, body contains = 0.5
  if (lowerTitle === query) return 1.0;
  if (lowerTitle.includes(query)) return 0.8;
  if (lowerBody.includes(query)) return 0.5;
  return 0.3;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mcp-server/src/data/
git commit -m "feat(mcp): add shared data layer for specs, evidence, and search"
```

---

### Task 4: Build Tools — context, feedback, opportunities

**Files:**

- Create: `apps/mcp-server/src/tools/context.ts`
- Create: `apps/mcp-server/src/tools/feedback.ts`
- Create: `apps/mcp-server/src/tools/opportunities.ts`

- [ ] **Step 1: Create get_context_for_feature tool**

```typescript
// apps/mcp-server/src/tools/context.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { withAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";
import { cacheKey, cacheGet, cacheSet } from "../middleware/cache.js";
import { loadSpecWithContext, findSpecByTitle } from "../data/specs.js";
import { loadSpecInsightsWithQuotes } from "../data/evidence.js";
import { loadDecisions } from "../data/evidence.js";

const inputSchema = {
  project_id: z.string().describe("The project ID"),
  feature_name: z.string().optional().describe("Feature name to search for"),
  spec_id: z.string().optional().describe("Direct spec ID lookup (takes precedence)"),
};

export function registerContextTool(server: McpServer) {
  server.tool(
    "get_context_for_feature",
    "Get ALL context for a feature: spec, user needs, constraints, decisions, edge cases. Call this before starting work on any feature.",
    inputSchema,
    async ({ project_id, feature_name, spec_id }) => {
      const auth = await withAuth(project_id, "project:read");
      checkRateLimit(auth.keyId);

      if (!spec_id && !feature_name) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Provide spec_id or feature_name" }),
            },
          ],
          isError: true,
        };
      }

      // Check cache
      const ck = cacheKey("context", { project_id, spec_id, feature_name });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { content: [{ type: "text" as const, text: cached }] };
      }

      // Resolve spec ID
      let resolvedSpecId = spec_id;
      if (!resolvedSpecId && feature_name) {
        const found = await findSpecByTitle(project_id, feature_name);
        if (!found) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: `No spec found matching "${feature_name}"` }),
              },
            ],
            isError: true,
          };
        }
        resolvedSpecId = found.id;
      }

      const spec = await loadSpecWithContext(resolvedSpecId!);
      const latestVersion = spec.versions[0];
      const content = (latestVersion?.content ?? spec.content) as Record<string, unknown>;
      const sections = (content.sections ?? []) as Array<{
        id: string;
        title: string;
        content: string;
      }>;

      // Extract user needs from linked insights
      const insights = await loadSpecInsightsWithQuotes(resolvedSpecId!);
      const painPoints = insights.filter((i) => i.type === "PAIN_POINT");
      const desires = insights.filter((i) => i.type === "DESIRE");
      const allQuotes = insights.flatMap((i) => i.quotes).slice(0, 20);

      // Extract constraints from assumptions
      const constraints = spec.assumptions
        .filter((a) => a.category === "CONSTRAINT" || a.category === "DEPENDENCY")
        .map((a) => a.assumption);

      // Extract data model section
      const dataModelSection = sections.find(
        (s) => s.id === "data_model" || s.title.toLowerCase().includes("data model"),
      );

      // Extract success metrics section
      const metricsSection = sections.find(
        (s) => s.id === "success_metrics" || s.title.toLowerCase().includes("success"),
      );
      const successMetrics = metricsSection
        ? [metricsSection.content.replace(/<[^>]+>/g, "").trim()]
        : [];

      // Load related decisions
      const decisions = await loadDecisions(project_id, {
        featureArea: feature_name ?? spec.title,
        limit: 10,
      });

      // Extract edge cases from HIGH risk assumptions
      const edgeCases = spec.assumptions
        .filter((a) => a.riskLevel === "HIGH")
        .map((a) => ({
          description: a.assumption,
          expected_behavior: a.suggestion ?? "Needs definition",
          source: "spec" as const,
        }));

      const result = {
        spec: {
          id: spec.id,
          title: spec.title,
          status: spec.status,
          sections: sections.map((s) => ({ id: s.id, title: s.title })),
          version: latestVersion?.version ?? 1,
        },
        user_needs: {
          pain_points: painPoints.map((p) => ({
            id: p.id,
            title: p.title,
            severity: p.severityScore,
          })),
          desires: desires.map((d) => ({
            id: d.id,
            title: d.title,
          })),
          quotes: allQuotes,
        },
        constraints,
        data_model: dataModelSection?.content.replace(/<[^>]+>/g, "").trim() ?? null,
        past_decisions: decisions.map((d) => ({
          id: d.id,
          title: d.title,
          rationale: d.rationale,
          outcome: d.outcome,
          status: d.status,
        })),
        success_metrics: successMetrics,
        edge_cases: edgeCases,
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
```

- [ ] **Step 2: Create query_user_feedback tool**

```typescript
// apps/mcp-server/src/tools/feedback.ts
import { z } from "zod";
import { db } from "@pm-yc/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { withAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";

const inputSchema = {
  project_id: z.string().describe("The project ID"),
  query: z.string().describe("Search query for feedback content"),
  filters: z
    .object({
      segment: z.string().optional().describe("Filter by segment tag"),
      source: z.string().optional().describe("Filter by data source ref"),
      date_range: z
        .object({
          from: z.string().describe("Start date (ISO)"),
          to: z.string().describe("End date (ISO)"),
        })
        .optional()
        .describe("Filter by date range"),
    })
    .optional()
    .describe("Optional filters"),
  limit: z.number().min(1).max(50).default(20).describe("Max results (default 20)"),
};

export function registerFeedbackTool(server: McpServer) {
  server.tool(
    "query_user_feedback",
    "Search user feedback by keyword. Use to find what users said about a specific topic, feature, or problem.",
    inputSchema,
    async ({ project_id, query, filters, limit }) => {
      const auth = await withAuth(project_id, "feedback_item:read");
      checkRateLimit(auth.keyId);

      const where: Record<string, unknown> = {
        projectId: project_id,
        content: { contains: query, mode: "insensitive" },
      };

      if (filters?.segment) {
        where.segmentTags = { hasSome: [filters.segment] };
      }

      if (filters?.source) {
        where.sourceRef = { contains: filters.source, mode: "insensitive" };
      }

      if (filters?.date_range) {
        where.createdAt = {
          gte: new Date(filters.date_range.from),
          lte: new Date(filters.date_range.to),
        };
      }

      const [items, total] = await Promise.all([
        db.feedbackItem.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            id: true,
            content: true,
            customerName: true,
            segmentTags: true,
            sentiment: true,
            sentimentScore: true,
            sourceRef: true,
            createdAt: true,
          },
        }),
        db.feedbackItem.count({ where }),
      ]);

      const result = {
        results: items.map((f) => ({
          id: f.id,
          content: f.content,
          customer_name: f.customerName,
          segment_tags: f.segmentTags,
          sentiment: f.sentiment,
          sentiment_score: f.sentimentScore,
          source: f.sourceRef,
          created_at: f.createdAt.toISOString(),
        })),
        total_matches: total,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
```

- [ ] **Step 3: Create get_opportunity_details tool**

```typescript
// apps/mcp-server/src/tools/opportunities.ts
import { z } from "zod";
import { db } from "@pm-yc/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { withAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";
import { cacheKey, cacheGet, cacheSet } from "../middleware/cache.js";
import { loadOpportunityInsightsWithQuotes, countOpportunityFeedback } from "../data/evidence.js";

const inputSchema = {
  project_id: z.string().describe("The project ID"),
  opportunity_id: z.string().describe("The opportunity ID"),
};

export function registerOpportunityTool(server: McpServer) {
  server.tool(
    "get_opportunity_details",
    "Get full opportunity details: scores (composite, RICE, ICE), evidence chain with quotes, linked specs, and themes.",
    inputSchema,
    async ({ project_id, opportunity_id }) => {
      const auth = await withAuth(project_id, "opportunity:read");
      checkRateLimit(auth.keyId);

      const ck = cacheKey("opportunity", { project_id, opportunity_id });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { content: [{ type: "text" as const, text: cached }] };
      }

      const opp = await db.opportunity.findUniqueOrThrow({
        where: { id: opportunity_id },
        include: {
          linkedThemes: {
            include: {
              theme: {
                select: { id: true, title: true, feedbackCount: true },
              },
            },
          },
        },
      });

      // Verify project ownership
      if (opp.projectId !== project_id) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Opportunity not in this project" }),
            },
          ],
          isError: true,
        };
      }

      const [insights, feedbackCount] = await Promise.all([
        loadOpportunityInsightsWithQuotes(opportunity_id),
        countOpportunityFeedback(opportunity_id),
      ]);

      // Find specs that reference this opportunity's insights
      const insightIds = insights.map((i) => i.id);
      const linkedSpecs =
        insightIds.length > 0
          ? await db.spec.findMany({
              where: {
                projectId: project_id,
                evidence: {
                  some: { insightId: { in: insightIds } },
                },
              },
              select: { id: true, title: true, status: true },
              distinct: ["id"],
            })
          : [];

      const getConfidence = (count: number) =>
        count > 20 ? "high" : count > 10 ? "medium" : "low";

      const result = {
        opportunity: {
          id: opp.id,
          title: opp.title,
          description: opp.description,
          status: opp.status,
        },
        scores: {
          composite: {
            score: opp.compositeScore,
            frequency: opp.frequencyScore,
            severity: opp.severityScore,
            alignment: opp.strategicAlignment,
            effort_inverse: opp.effortEstimate ? 1 / opp.effortEstimate : 0,
            confidence: getConfidence(insights.length),
          },
          rice: {
            score: opp.riceScore,
            reach: opp.riceReach,
            impact: opp.riceImpact,
            confidence: opp.riceConfidence,
            effort: opp.riceEffort,
          },
          ice: {
            score: opp.iceScore,
            impact: opp.iceImpact,
            confidence: opp.iceConfidence,
            ease: opp.iceEase,
          },
          segment_weighted_freq: opp.segmentWeightedFreq,
        },
        evidence_chain: {
          insights: insights.map((i) => ({
            id: i.id,
            title: i.title,
            type: i.type,
            severity: i.severityScore,
            quotes: i.quotes,
          })),
          feedback_count: feedbackCount,
        },
        linked_specs: linkedSpecs,
        themes: opp.linkedThemes.map((lt) => ({
          id: lt.theme.id,
          title: lt.theme.title,
          feedback_count: lt.theme.feedbackCount,
        })),
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mcp-server/src/tools/context.ts apps/mcp-server/src/tools/feedback.ts apps/mcp-server/src/tools/opportunities.ts
git commit -m "feat(mcp): add context, feedback, and opportunity tools"
```

---

### Task 5: Build Tools — validation, decisions, tasks

**Files:**

- Create: `apps/mcp-server/src/tools/validation.ts`
- Create: `apps/mcp-server/src/tools/decisions.ts`
- Create: `apps/mcp-server/src/tools/tasks.ts`

- [ ] **Step 1: Create validate_against_spec tool**

```typescript
// apps/mcp-server/src/tools/validation.ts
import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createProvider, type LLMProvider } from "@pm-yc/ai";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { withAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";
import { loadSpecWithContext } from "../data/specs.js";
import { env, getLLMApiKey } from "../env.js";

const inputSchema = {
  project_id: z.string().describe("The project ID"),
  spec_id: z.string().describe("The spec ID to validate against"),
  implementation_description: z.string().max(5000).describe("Description of what was implemented"),
};

function getProvider(): LLMProvider {
  const apiKey = getLLMApiKey();
  if (!apiKey) {
    throw new McpError(
      ErrorCode.InternalError,
      "LLM provider not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.",
    );
  }
  return createProvider({ type: env.LLM_PROVIDER, apiKey });
}

export function registerValidationTool(server: McpServer) {
  server.tool(
    "validate_against_spec",
    "Check if an implementation matches the spec. Returns gaps, suggestions, and coverage score. Use before committing.",
    inputSchema,
    async ({ project_id, spec_id, implementation_description }) => {
      const auth = await withAuth(project_id, "spec:read");
      checkRateLimit(auth.keyId);

      const spec = await loadSpecWithContext(spec_id);

      if (spec.projectId !== project_id) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: "Spec not in this project" }) },
          ],
          isError: true,
        };
      }

      const latestVersion = spec.versions[0];
      const content = (latestVersion?.content ?? spec.content) as Record<string, unknown>;
      const sections = (content.sections ?? []) as Array<{
        id: string;
        title: string;
        content: string;
      }>;

      const specSummary = sections
        .map((s) => `## ${s.title}\n${s.content.replace(/<[^>]+>/g, "")}`)
        .join("\n\n");

      const provider = getProvider();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      try {
        const response = await provider.complete({
          messages: [
            {
              role: "system",
              content: `You are a spec validation assistant. Compare an implementation description against a product spec.
Return JSON with this exact structure:
{
  "matches": boolean,
  "coverage_score": number (0-1),
  "gaps": string[],
  "suggestions": string[],
  "matched_requirements": string[]
}
Be specific about gaps — reference actual spec sections. Be constructive in suggestions.`,
            },
            {
              role: "user",
              content: `## SPEC\n${specSummary}\n\n## IMPLEMENTATION\n${implementation_description}`,
            },
          ],
          temperature: 0.3,
          maxTokens: 4000,
        });

        clearTimeout(timeout);

        // Parse JSON from response
        let result: Record<string, unknown>;
        try {
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          result = JSON.parse(jsonMatch?.[0] ?? response.content);
        } catch {
          result = {
            matches: false,
            coverage_score: 0,
            gaps: ["Could not parse validation results"],
            suggestions: [response.content],
            matched_requirements: [],
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        clearTimeout(timeout);
        if ((err as Error).name === "AbortError") {
          throw new McpError(
            ErrorCode.InternalError,
            "LLM request timed out (30s). Try simplifying your implementation description.",
          );
        }
        throw err;
      }
    },
  );
}
```

- [ ] **Step 2: Create get_decision_history tool**

```typescript
// apps/mcp-server/src/tools/decisions.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { withAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";
import { cacheKey, cacheGet, cacheSet } from "../middleware/cache.js";
import { loadDecisions } from "../data/evidence.js";

const inputSchema = {
  project_id: z.string().describe("The project ID"),
  feature_area: z.string().optional().describe("Filter decisions by feature area"),
  query: z.string().optional().describe("Search decision titles and rationale"),
  limit: z.number().min(1).max(30).default(10).describe("Max results (default 10)"),
};

export function registerDecisionsTool(server: McpServer) {
  server.tool(
    "get_decision_history",
    "Get past decisions with rationale and evidence. Use to understand why something was decided before changing it.",
    inputSchema,
    async ({ project_id, feature_area, query, limit }) => {
      const auth = await withAuth(project_id, "decision:read");
      checkRateLimit(auth.keyId);

      const ck = cacheKey("decisions", { project_id, feature_area, query, limit });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { content: [{ type: "text" as const, text: cached }] };
      }

      const decisions = await loadDecisions(project_id, {
        query,
        featureArea: feature_area,
        limit,
      });

      const result = {
        decisions: decisions.map((d) => ({
          id: d.id,
          title: d.title,
          rationale: d.rationale,
          outcome: d.outcome,
          status: d.status,
          evidence: d.decisionEvidence.map((de) => ({
            type: de.insight.type,
            reference: de.insight.id,
            summary: de.insight.title,
          })),
          decided_at: d.decidedAt?.toISOString() ?? null,
          created_at: d.createdAt.toISOString(),
        })),
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
```

- [ ] **Step 3: Create report_task_completion tool**

```typescript
// apps/mcp-server/src/tools/tasks.ts
import { z } from "zod";
import { db } from "@pm-yc/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { withAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";
import { cacheInvalidate } from "../middleware/cache.js";

const inputSchema = {
  project_id: z.string().describe("The project ID"),
  ticket_id: z.string().describe("The ticket ID"),
  status: z.enum(["completed", "blocked"]).describe("New status"),
  notes: z.string().optional().describe("Optional notes about completion or blockers"),
};

export function registerTasksTool(server: McpServer) {
  server.tool(
    "report_task_completion",
    "Report a task/ticket as completed or blocked. Updates the ticket status in the platform.",
    inputSchema,
    async ({ project_id, ticket_id, status, notes }) => {
      const auth = await withAuth(project_id, "ticket:update");
      checkRateLimit(auth.keyId);

      const ticket = await db.ticket.findUniqueOrThrow({
        where: { id: ticket_id },
        select: {
          id: true,
          title: true,
          status: true,
          projectId: true,
          externalId: true,
          externalUrl: true,
          provider: true,
          metadata: true,
        },
      });

      if (ticket.projectId !== project_id) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Ticket not in this project" }),
            },
          ],
          isError: true,
        };
      }

      const newStatus = status === "completed" ? "closed" : "blocked";

      // Append notes to metadata
      const metadata = (ticket.metadata as Record<string, unknown>) ?? {};
      const existingNotes = (metadata.notes as string[]) ?? [];
      if (notes) {
        existingNotes.push(`[${new Date().toISOString()}] ${notes}`);
      }

      await db.ticket.update({
        where: { id: ticket_id },
        data: {
          status: newStatus,
          metadata: { ...metadata, notes: existingNotes },
        },
      });

      // Bust any cached data that might reference this ticket
      cacheInvalidate("context:");

      const result = {
        success: true,
        ticket_title: ticket.title,
        updated_status: newStatus,
        external_url: ticket.externalUrl,
        synced_external: false, // External sync not yet implemented
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mcp-server/src/tools/validation.ts apps/mcp-server/src/tools/decisions.ts apps/mcp-server/src/tools/tasks.ts
git commit -m "feat(mcp): add validation, decisions, and task tools"
```

---

### Task 6: Build Tools — edge-cases, search

**Files:**

- Create: `apps/mcp-server/src/tools/edge-cases.ts`
- Create: `apps/mcp-server/src/tools/search.ts`

- [ ] **Step 1: Create get_edge_cases tool**

```typescript
// apps/mcp-server/src/tools/edge-cases.ts
import { z } from "zod";
import { db } from "@pm-yc/db";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createProvider, type LLMProvider } from "@pm-yc/ai";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { withAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";
import { cacheKey, cacheGet, cacheSet } from "../middleware/cache.js";
import { loadSpecWithContext, findSpecByTitle } from "../data/specs.js";
import { env, getLLMApiKey } from "../env.js";

const inputSchema = {
  project_id: z.string().describe("The project ID"),
  spec_id: z.string().optional().describe("Spec ID to analyze"),
  feature_area: z.string().optional().describe("Feature area to search (if no spec_id)"),
};

export function registerEdgeCasesTool(server: McpServer) {
  server.tool(
    "get_edge_cases",
    "Get enumerated edge cases with expected behaviors for a feature. Combines spec assumptions, feedback pain points, and LLM inference.",
    inputSchema,
    async ({ project_id, spec_id, feature_area }) => {
      const auth = await withAuth(project_id, "spec:read");
      checkRateLimit(auth.keyId);

      if (!spec_id && !feature_area) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Provide spec_id or feature_area" }),
            },
          ],
          isError: true,
        };
      }

      const ck = cacheKey("edge_cases", { project_id, spec_id, feature_area });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { content: [{ type: "text" as const, text: cached }] };
      }

      // Resolve spec
      let resolvedSpecId = spec_id;
      if (!resolvedSpecId && feature_area) {
        const found = await findSpecByTitle(project_id, feature_area);
        if (!found) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: `No spec found matching "${feature_area}"` }),
              },
            ],
            isError: true,
          };
        }
        resolvedSpecId = found.id;
      }

      const spec = await loadSpecWithContext(resolvedSpecId!);
      const latestVersion = spec.versions[0];
      const content = (latestVersion?.content ?? spec.content) as Record<string, unknown>;
      const sections = (content.sections ?? []) as Array<{ title: string; content: string }>;

      // Gather assumptions (HIGH risk become explicit edge cases)
      const highRiskAssumptions = spec.assumptions
        .filter((a) => a.riskLevel === "HIGH")
        .map((a) => ({
          description: a.assumption,
          expected_behavior: a.suggestion ?? "Behavior undefined — needs specification",
          severity: "high" as const,
          source: "spec" as const,
        }));

      // Gather pain points from linked feedback
      const painInsights = await db.insight.findMany({
        where: {
          projectId: project_id,
          type: "PAIN_POINT",
          specEvidence: { some: { specId: resolvedSpecId! } },
        },
        take: 10,
        select: { title: true, description: true, severityScore: true },
      });

      const feedbackEdgeCases = painInsights.map((p) => ({
        description: p.title,
        expected_behavior: `Address: ${p.description.slice(0, 150)}`,
        severity: (p.severityScore >= 4 ? "high" : p.severityScore >= 2 ? "medium" : "low") as
          | "high"
          | "medium"
          | "low",
        source: "feedback" as const,
      }));

      // Use LLM to infer additional edge cases
      let inferredEdgeCases: Array<{
        description: string;
        expected_behavior: string;
        severity: "low" | "medium" | "high";
        source: "inferred";
      }> = [];

      const apiKey = getLLMApiKey();
      if (apiKey) {
        const provider = createProvider({ type: env.LLM_PROVIDER, apiKey });
        const specText = sections
          .map((s) => `## ${s.title}\n${s.content.replace(/<[^>]+>/g, "")}`)
          .join("\n\n");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

        try {
          const response = await provider.complete({
            messages: [
              {
                role: "system",
                content: `Analyze this spec and return edge cases as JSON array:
[{ "description": "...", "expected_behavior": "...", "severity": "low"|"medium"|"high" }]
Focus on: error states, boundary conditions, concurrent access, data consistency, permission edge cases, empty/null states, performance limits. Return 5-10 edge cases.`,
              },
              { role: "user", content: specText.slice(0, 6000) },
            ],
            temperature: 0.3,
            maxTokens: 3000,
          });

          clearTimeout(timeout);

          const jsonMatch = response.content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as Array<{
              description: string;
              expected_behavior: string;
              severity: string;
            }>;
            inferredEdgeCases = parsed.map((p) => ({
              description: p.description,
              expected_behavior: p.expected_behavior,
              severity: (["low", "medium", "high"].includes(p.severity) ? p.severity : "medium") as
                | "low"
                | "medium"
                | "high",
              source: "inferred" as const,
            }));
          }
        } catch {
          clearTimeout(timeout);
          // LLM failure is non-fatal — we still return spec + feedback edge cases
        }
      }

      const result = {
        edge_cases: [...highRiskAssumptions, ...feedbackEdgeCases, ...inferredEdgeCases],
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
```

- [ ] **Step 2: Create search_all_knowledge tool**

```typescript
// apps/mcp-server/src/tools/search.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { withAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";
import { searchAllEntities } from "../data/search.js";

const inputSchema = {
  project_id: z.string().describe("The project ID"),
  query: z.string().describe("Search query across all knowledge"),
  limit: z.number().min(1).max(50).default(20).describe("Max results (default 20)"),
};

export function registerSearchTool(server: McpServer) {
  server.tool(
    "search_all_knowledge",
    "Search across ALL platform data: insights, specs, decisions, feedback, themes, opportunities. Returns ranked results.",
    inputSchema,
    async ({ project_id, query, limit }) => {
      const auth = await withAuth(project_id, "project:read");
      checkRateLimit(auth.keyId);

      const results = await searchAllEntities(project_id, query, limit);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ results }, null, 2),
          },
        ],
      };
    },
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mcp-server/src/tools/edge-cases.ts apps/mcp-server/src/tools/search.ts
git commit -m "feat(mcp): add edge-cases and search tools"
```

---

### Task 7: Build Resources

**Files:**

- Create: `apps/mcp-server/src/resources/index.ts`
- Create: `apps/mcp-server/src/resources/project.ts`
- Create: `apps/mcp-server/src/resources/spec.ts`

- [ ] **Step 1: Create project resources (roadmap, personas, themes)**

```typescript
// apps/mcp-server/src/resources/project.ts
import { db } from "@pm-yc/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { withAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";
import { cacheKey, cacheGet, cacheSet } from "../middleware/cache.js";

export function registerProjectResources(server: McpServer) {
  // Roadmap
  server.resource(
    "project-roadmap",
    "project://{project_id}/roadmap",
    { description: "Current prioritized roadmap — opportunities ranked by composite score" },
    async (uri) => {
      const projectId = uri.pathname.split("/")[1]!;
      const auth = await withAuth(projectId, "project:read");
      checkRateLimit(auth.keyId);

      const ck = cacheKey("resource:roadmap", { project_id: projectId });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: cached }] };
      }

      const opportunities = await db.opportunity.findMany({
        where: { projectId },
        orderBy: { compositeScore: "desc" },
        take: 30,
        include: {
          _count: { select: { linkedInsights: true } },
        },
      });

      const result = {
        opportunities: opportunities.map((o) => ({
          id: o.id,
          title: o.title,
          status: o.status,
          composite_score: o.compositeScore,
          rice_score: o.riceScore,
          effort_estimate: o.effortEstimate,
          linked_insight_count: o._count.linkedInsights,
        })),
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
    },
  );

  // Personas
  server.resource(
    "project-personas",
    "project://{project_id}/personas",
    { description: "User personas with goals, frustrations, and behaviors" },
    async (uri) => {
      const projectId = uri.pathname.split("/")[1]!;
      const auth = await withAuth(projectId, "project:read");
      checkRateLimit(auth.keyId);

      const ck = cacheKey("resource:personas", { project_id: projectId });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: cached }] };
      }

      const personas = await db.persona.findMany({
        where: { projectId },
      });

      const result = {
        personas: personas.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          goals: p.goals,
          frustrations: p.frustrations,
          behaviors: p.behaviors,
          demographics: p.demographics,
        })),
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
    },
  );

  // Themes
  server.resource(
    "project-themes",
    "project://{project_id}/themes",
    { description: "Active theme clusters with feedback counts and top insights" },
    async (uri) => {
      const projectId = uri.pathname.split("/")[1]!;
      const auth = await withAuth(projectId, "project:read");
      checkRateLimit(auth.keyId);

      const ck = cacheKey("resource:themes", { project_id: projectId });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: cached }] };
      }

      const themes = await db.theme.findMany({
        where: { projectId },
        orderBy: { feedbackCount: "desc" },
        include: {
          insights: {
            take: 5,
            orderBy: { severityScore: "desc" },
            select: { id: true, title: true, severityScore: true },
          },
        },
      });

      const result = {
        themes: themes.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          feedback_count: t.feedbackCount,
          color: t.color,
          top_insights: t.insights.map((i) => ({
            id: i.id,
            title: i.title,
            severity: i.severityScore,
          })),
        })),
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
    },
  );
}
```

- [ ] **Step 2: Create spec resource**

```typescript
// apps/mcp-server/src/resources/spec.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { withAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";
import { cacheKey, cacheGet, cacheSet } from "../middleware/cache.js";
import { loadSpecSummary } from "../data/specs.js";
import { db } from "@pm-yc/db";

export function registerSpecResource(server: McpServer) {
  server.resource(
    "spec-document",
    "spec://{spec_id}",
    { description: "Full spec document with content, version, and counts" },
    async (uri) => {
      const specId = uri.pathname.split("/")[1]!;

      // Look up the spec's project to auth
      const specMeta = await db.spec.findUniqueOrThrow({
        where: { id: specId },
        select: { projectId: true },
      });

      const auth = await withAuth(specMeta.projectId, "spec:read");
      checkRateLimit(auth.keyId);

      const ck = cacheKey("resource:spec", { spec_id: specId });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: cached }] };
      }

      const spec = await loadSpecSummary(specId);
      const latestVersion = spec.versions[0];

      const result = {
        id: spec.id,
        title: spec.title,
        type: spec.type,
        status: spec.status,
        content: latestVersion?.content ?? spec.content,
        version: latestVersion?.version ?? 1,
        evidence_count: spec._count.evidence,
        assumption_count: spec._count.assumptions,
        created_at: spec.createdAt.toISOString(),
        updated_at: spec.updatedAt.toISOString(),
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
    },
  );
}
```

- [ ] **Step 3: Create resources index**

```typescript
// apps/mcp-server/src/resources/index.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerProjectResources } from "./project.js";
import { registerSpecResource } from "./spec.js";

export function registerResources(server: McpServer) {
  registerProjectResources(server);
  registerSpecResource(server);
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mcp-server/src/resources/
git commit -m "feat(mcp): add MCP resources — roadmap, personas, themes, spec"
```

---

### Task 8: Wire Up Server and Entry Points

**Files:**

- Modify: `apps/mcp-server/src/tools/index.ts`
- Modify: `apps/mcp-server/src/server.ts`
- Modify: `apps/mcp-server/src/index.ts`

- [ ] **Step 1: Rewrite tools/index.ts to register all 8 tools**

Replace the entire file:

```typescript
// apps/mcp-server/src/tools/index.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerContextTool } from "./context.js";
import { registerFeedbackTool } from "./feedback.js";
import { registerOpportunityTool } from "./opportunities.js";
import { registerValidationTool } from "./validation.js";
import { registerDecisionsTool } from "./decisions.js";
import { registerTasksTool } from "./tasks.js";
import { registerEdgeCasesTool } from "./edge-cases.js";
import { registerSearchTool } from "./search.js";

export function registerTools(server: McpServer) {
  registerContextTool(server);
  registerFeedbackTool(server);
  registerOpportunityTool(server);
  registerValidationTool(server);
  registerDecisionsTool(server);
  registerTasksTool(server);
  registerEdgeCasesTool(server);
  registerSearchTool(server);
}
```

- [ ] **Step 2: Update server.ts to register resources**

Replace the entire file:

```typescript
// apps/mcp-server/src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";

export function createServer() {
  const server = new McpServer({
    name: "pm-yc",
    version: "0.1.0",
  });

  registerTools(server);
  registerResources(server);

  return server;
}
```

- [ ] **Step 3: Rewrite index.ts with dual transport support**

Replace the entire file:

```typescript
// apps/mcp-server/src/index.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

import { createServer } from "./server.js";
import { env } from "./env.js";
import { startRateLimitCleanup } from "./middleware/rate-limit.js";
import { startCacheCleanup } from "./middleware/cache.js";

const isSSE = process.argv.includes("--sse");

async function main() {
  // Start background cleanup tasks
  const stopRateLimit = startRateLimitCleanup();
  const stopCache = startCacheCleanup();

  const cleanup = () => {
    stopRateLimit();
    stopCache();
  };

  if (isSSE) {
    await startSSE(cleanup);
  } else {
    await startStdio(cleanup);
  }
}

async function startStdio(cleanup: () => void) {
  if (!env.PM_YC_API_KEY) {
    console.error("[MCP] Warning: PM_YC_API_KEY not set. All tool calls will fail authentication.");
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[MCP] PM-YC MCP server running on stdio");

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
}

async function startSSE(cleanup: () => void) {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: "0.1.0", transport: "sse" });
  });

  // Store active transports by session
  const transports = new Map<string, SSEServerTransport>();

  app.get("/mcp/sse", (req, res) => {
    const server = createServer();
    const transport = new SSEServerTransport("/mcp/messages", res);

    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);

    // Store API key from auth header in transport context
    const authHeader = req.headers.authorization;
    if (authHeader) {
      (transport as unknown as Record<string, unknown>)._apiKey = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;
    }

    res.on("close", () => {
      transports.delete(sessionId);
    });

    server.connect(transport);
  });

  app.post("/mcp/messages", (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    transport.handlePostMessage(req, res);
  });

  const port = env.PORT;
  app.listen(port, () => {
    console.error(`[MCP] PM-YC MCP server running on SSE at http://localhost:${port}`);
    console.error(`[MCP] SSE endpoint: GET http://localhost:${port}/mcp/sse`);
    console.error(`[MCP] Health check: GET http://localhost:${port}/health`);
  });

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("[MCP] Fatal error:", error);
  process.exit(1);
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/mcp-server/src/tools/index.ts apps/mcp-server/src/server.ts apps/mcp-server/src/index.ts
git commit -m "feat(mcp): wire up all tools, resources, and dual transport entry points"
```

---

### Task 9: Update Package.json and Type Check

**Files:**

- Modify: `apps/mcp-server/package.json`

- [ ] **Step 1: Update package.json with all changes**

The full updated file — replace entirely:

```json
{
  "name": "@pm-yc/mcp-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "pm-yc-mcp": "./dist/index.js"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "dev:sse": "tsx watch src/index.ts --sse",
    "build": "tsup src/index.ts --format esm",
    "start": "node dist/index.js",
    "start:sse": "node dist/index.js --sse",
    "type-check": "tsc --noEmit",
    "lint": "eslint src/",
    "clean": "rm -rf dist .turbo"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.3.0",
    "@pm-yc/ai": "workspace:*",
    "@pm-yc/auth": "workspace:*",
    "@pm-yc/db": "workspace:*",
    "@pm-yc/shared": "workspace:*",
    "express": "^4.21.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@pm-yc/eslint-config": "workspace:*",
    "@pm-yc/tsconfig": "workspace:*",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.5",
    "tsup": "^8.3.5",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 2: Run type check**

```bash
cd apps/mcp-server && pnpm type-check
```

Expected: passes with no errors. If there are import path issues, fix them.

- [ ] **Step 3: Final commit**

```bash
git add apps/mcp-server/
git commit -m "feat(mcp): complete MCP server with 8 tools, 4 resources, auth, rate limiting, and caching"
```
