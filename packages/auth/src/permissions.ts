import type { Action, Resource, WorkspaceRole } from "./types";

/**
 * Permission matrix: role -> resource -> allowed actions
 *
 * OWNER/ADMIN: full CRUD on all resources, manage members and billing
 * MEMBER: CRUD on projects/specs/insights, read data sources
 * VIEWER: read-only on everything within their projects
 * GUEST: read-only on specifically shared specs/reports
 */
const PERMISSION_MATRIX: Record<WorkspaceRole, Record<Resource, Set<Action>>> = {
  OWNER: {
    workspace: new Set(["create", "read", "update", "delete", "manage"]),
    member: new Set(["create", "read", "update", "delete", "manage"]),
    billing: new Set(["create", "read", "update", "delete", "manage"]),
    project: new Set(["create", "read", "update", "delete", "manage"]),
    data_source: new Set(["create", "read", "update", "delete", "manage"]),
    feedback_item: new Set(["create", "read", "update", "delete", "manage"]),
    theme: new Set(["create", "read", "update", "delete", "manage"]),
    insight: new Set(["create", "read", "update", "delete", "manage"]),
    persona: new Set(["create", "read", "update", "delete", "manage"]),
    opportunity: new Set(["create", "read", "update", "delete", "manage"]),
    spec: new Set(["create", "read", "update", "delete", "manage"]),
    ticket: new Set(["create", "read", "update", "delete", "manage"]),
    decision: new Set(["create", "read", "update", "delete", "manage"]),
    api_key: new Set(["create", "read", "update", "delete", "manage"]),
  },
  ADMIN: {
    workspace: new Set(["read", "update", "manage"]),
    member: new Set(["create", "read", "update", "delete", "manage"]),
    billing: new Set(["read", "update", "manage"]),
    project: new Set(["create", "read", "update", "delete", "manage"]),
    data_source: new Set(["create", "read", "update", "delete", "manage"]),
    feedback_item: new Set(["create", "read", "update", "delete", "manage"]),
    theme: new Set(["create", "read", "update", "delete", "manage"]),
    insight: new Set(["create", "read", "update", "delete", "manage"]),
    persona: new Set(["create", "read", "update", "delete", "manage"]),
    opportunity: new Set(["create", "read", "update", "delete", "manage"]),
    spec: new Set(["create", "read", "update", "delete", "manage"]),
    ticket: new Set(["create", "read", "update", "delete", "manage"]),
    decision: new Set(["create", "read", "update", "delete", "manage"]),
    api_key: new Set(["create", "read", "update", "delete", "manage"]),
  },
  MEMBER: {
    workspace: new Set(["read"]),
    member: new Set(["read"]),
    billing: new Set([]),
    project: new Set(["create", "read", "update", "delete"]),
    data_source: new Set(["read"]),
    feedback_item: new Set(["create", "read", "update", "delete"]),
    theme: new Set(["create", "read", "update", "delete"]),
    insight: new Set(["create", "read", "update", "delete"]),
    persona: new Set(["create", "read", "update", "delete"]),
    opportunity: new Set(["create", "read", "update", "delete"]),
    spec: new Set(["create", "read", "update", "delete"]),
    ticket: new Set(["create", "read", "update", "delete"]),
    decision: new Set(["create", "read", "update", "delete"]),
    api_key: new Set([]),
  },
  VIEWER: {
    workspace: new Set(["read"]),
    member: new Set(["read"]),
    billing: new Set([]),
    project: new Set(["read"]),
    data_source: new Set(["read"]),
    feedback_item: new Set(["read"]),
    theme: new Set(["read"]),
    insight: new Set(["read"]),
    persona: new Set(["read"]),
    opportunity: new Set(["read"]),
    spec: new Set(["read"]),
    ticket: new Set(["read"]),
    decision: new Set(["read"]),
    api_key: new Set([]),
  },
  GUEST: {
    workspace: new Set([]),
    member: new Set([]),
    billing: new Set([]),
    project: new Set([]),
    data_source: new Set([]),
    feedback_item: new Set([]),
    theme: new Set([]),
    insight: new Set([]),
    persona: new Set([]),
    opportunity: new Set([]),
    spec: new Set(["read"]),
    ticket: new Set([]),
    decision: new Set(["read"]),
    api_key: new Set([]),
  },
};

export function hasPermission(role: WorkspaceRole, resource: Resource, action: Action): boolean {
  return PERMISSION_MATRIX[role]?.[resource]?.has(action) ?? false;
}

export class ForbiddenError extends Error {
  public readonly statusCode = 403;

  constructor(role: WorkspaceRole, resource: Resource, action: Action) {
    super(`Role '${role}' cannot '${action}' on '${resource}'`);
    this.name = "ForbiddenError";
  }
}

export function requirePermission(role: WorkspaceRole, resource: Resource, action: Action): void {
  if (!hasPermission(role, resource, action)) {
    throw new ForbiddenError(role, resource, action);
  }
}
