// Workspace & Auth
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  plan: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "GUEST";

export interface WorkspaceMembership {
  id: string;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  createdAt: Date;
  updatedAt: Date;
}

// Projects & Data
export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown>;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type DataSourceType =
  | "INTERCOM"
  | "ZENDESK"
  | "SALESFORCE"
  | "HUBSPOT"
  | "LINEAR"
  | "JIRA"
  | "GITHUB"
  | "SLACK"
  | "CSV"
  | "WEBHOOK"
  | "EMAIL"
  | "BROWSER_EXTENSION"
  | "APP_REVIEW"
  | "INTERVIEW"
  | "ANALYTICS";

export type SyncStatus = "IDLE" | "SYNCING" | "SUCCESS" | "FAILED";

export type Sentiment = "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED";

export type InsightType = "PAIN_POINT" | "DESIRE" | "OBSERVATION" | "TREND" | "OPPORTUNITY";

export type OpportunityStatus =
  | "IDENTIFIED"
  | "EVALUATING"
  | "PRIORITIZED"
  | "IN_PROGRESS"
  | "SHIPPED"
  | "KILLED"
  | "DEFERRED"
  | "ARCHIVED";

export type ConfidenceLevel = "high" | "medium" | "low";

export type ScoringMethod = "composite" | "rice" | "ice" | "segmentWeighted" | "manual";

export type SpecType = "PRD" | "ONE_PAGER" | "USER_STORY" | "RFC" | "DESIGN_DOC";

export type SpecStatus = "DRAFT" | "REVIEW" | "APPROVED" | "ARCHIVED";

export type DecisionStatus = "PROPOSED" | "APPROVED" | "REJECTED" | "SUPERSEDED";

// API Response types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}
