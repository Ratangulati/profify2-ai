import { z } from "zod";

// Common
export const emailSchema = z.string().email("Invalid email address");

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const cuidSchema = z.string().min(1);

// Workspace
export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
});

export const workspaceRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER", "GUEST"]);

// Project
export const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(2000).nullable().optional(),
  settings: z.record(z.unknown()).optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

// Data Source
export const dataSourceTypeSchema = z.enum([
  "INTERCOM",
  "ZENDESK",
  "SALESFORCE",
  "HUBSPOT",
  "LINEAR",
  "JIRA",
  "GITHUB",
  "SLACK",
  "CSV",
  "WEBHOOK",
  "EMAIL",
  "BROWSER_EXTENSION",
  "APP_REVIEW",
  "INTERVIEW",
  "ANALYTICS",
]);

export const createDataSourceSchema = z.object({
  type: dataSourceTypeSchema,
  name: z.string().min(1).max(255),
  config: z.record(z.unknown()).optional(),
});

// Feedback
export const sentimentSchema = z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED"]);

export const createFeedbackItemSchema = z.object({
  content: z.string().min(1).max(50000),
  sourceRef: z.string().max(500).nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  customerEmail: z.string().email().nullable().optional(),
  customerName: z.string().max(255).nullable().optional(),
  segmentTags: z.array(z.string()).optional(),
  language: z.string().max(10).optional(),
  sentiment: sentimentSchema.nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Insight
export const insightTypeSchema = z.enum([
  "PAIN_POINT",
  "DESIRE",
  "OBSERVATION",
  "TREND",
  "OPPORTUNITY",
]);

export const createInsightSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
  type: insightTypeSchema,
  severityScore: z.number().min(0).max(10).optional(),
  themeId: cuidSchema.nullable().optional(),
});

// Spec
export const specTypeSchema = z.enum(["PRD", "ONE_PAGER", "USER_STORY", "RFC", "DESIGN_DOC"]);
export const specStatusSchema = z.enum(["DRAFT", "REVIEW", "APPROVED", "ARCHIVED"]);

export const createSpecSchema = z.object({
  title: z.string().min(1).max(500),
  type: specTypeSchema.optional(),
  content: z.record(z.unknown()).optional(),
});

export const updateSpecSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  status: specStatusSchema.optional(),
  content: z.record(z.unknown()).optional(),
});

// Opportunity
export const createOpportunitySchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).nullable().optional(),
  riceReach: z.number().int().positive().nullable().optional(),
  riceImpact: z.number().min(0).max(10).nullable().optional(),
  riceConfidence: z.number().min(0).max(1).nullable().optional(),
  riceEffort: z.number().positive().nullable().optional(),
  strategicAlignment: z.number().min(0).max(10).nullable().optional(),
  insightIds: z.array(cuidSchema).optional(),
});

// Decision
export const decisionStatusSchema = z.enum(["PROPOSED", "APPROVED", "REJECTED", "SUPERSEDED"]);

export const createDecisionSchema = z.object({
  title: z.string().min(1).max(500),
  rationale: z.string().min(1).max(10000),
  outcome: z.string().max(5000).nullable().optional(),
  insightIds: z.array(cuidSchema).optional(),
  approverIds: z.array(cuidSchema).optional(),
});

// Inferred types
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateDataSourceInput = z.infer<typeof createDataSourceSchema>;
export type CreateFeedbackItemInput = z.infer<typeof createFeedbackItemSchema>;
export type CreateInsightInput = z.infer<typeof createInsightSchema>;
export type CreateSpecInput = z.infer<typeof createSpecSchema>;
export type UpdateSpecInput = z.infer<typeof updateSpecSchema>;
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type CreateDecisionInput = z.infer<typeof createDecisionSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
