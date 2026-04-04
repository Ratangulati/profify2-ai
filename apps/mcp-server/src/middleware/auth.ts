import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { hashApiKey } from "@pm-yc/auth";
import { db } from "@pm-yc/db";

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
 * Full auth check: resolve key -> authenticate -> verify project -> check scope.
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
