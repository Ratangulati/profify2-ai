export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "GUEST";

export type Resource =
  | "workspace"
  | "member"
  | "billing"
  | "project"
  | "data_source"
  | "feedback_item"
  | "theme"
  | "insight"
  | "persona"
  | "opportunity"
  | "spec"
  | "ticket"
  | "decision"
  | "api_key";

export type Action = "create" | "read" | "update" | "delete" | "manage";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

export interface WorkspaceContext {
  workspaceId: string;
  role: WorkspaceRole;
}

export interface SessionUser extends AuthUser {
  workspaces: WorkspaceContext[];
}

export interface ApiKeyPayload {
  workspaceId: string;
  keyId: string;
  scopes: string[];
}
