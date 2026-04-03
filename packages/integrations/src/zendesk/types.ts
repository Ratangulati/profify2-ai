// ── Zendesk API response shapes ────────────────────────────────────────

export interface ZendeskTicket {
  id: number;
  url: string;
  subject: string;
  description: string;
  status: "new" | "open" | "pending" | "hold" | "solved" | "closed";
  priority: "urgent" | "high" | "normal" | "low" | null;
  tags: string[];
  requester_id: number;
  submitter_id: number;
  organization_id: number | null;
  satisfaction_rating: {
    score: "offered" | "unoffered" | "good" | "bad";
    comment: string | null;
  } | null;
  created_at: string;
  updated_at: string;
  custom_fields: Array<{ id: number; value: string | null }>;
}

export interface ZendeskUser {
  id: number;
  name: string;
  email: string;
  role: "end-user" | "agent" | "admin";
  organization_id: number | null;
}

export interface ZendeskOrganization {
  id: number;
  name: string;
  tags: string[];
}

export interface ZendeskComment {
  id: number;
  type: "Comment";
  body: string;
  html_body: string;
  author_id: number;
  public: boolean;
  created_at: string;
}

export interface ZendeskSatisfactionRating {
  id: number;
  score: "good" | "bad";
  comment: string | null;
  requester_id: number;
  ticket_id: number;
  created_at: string;
  updated_at: string;
}

export interface ZendeskSearchResponse {
  results: ZendeskTicket[];
  count: number;
  next_page: string | null;
  previous_page: string | null;
  /** Cursor for cursor-based pagination */
  after_cursor: string | null;
  before_cursor: string | null;
}

export interface ZendeskCommentsResponse {
  comments: ZendeskComment[];
  next_page: string | null;
  count: number;
}

export interface ZendeskSatisfactionResponse {
  satisfaction_ratings: ZendeskSatisfactionRating[];
  next_page: string | null;
  count: number;
}

export interface ZendeskOAuthResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

// ── Webhook payload from Zendesk triggers ──────────────────────────────

export interface ZendeskWebhookPayload {
  ticket_id: string;
  ticket_subject: string;
  ticket_description: string;
  ticket_status: string;
  ticket_priority: string;
  ticket_tags: string;
  requester_name: string;
  requester_email: string;
  organization_name?: string;
  satisfaction_score?: string;
  satisfaction_comment?: string;
  current_comment?: string;
  current_comment_author_name?: string;
  event_type?: string;
}

// ── Config shape stored in DataSource.config ───────────────────────────

export interface ZendeskConfig {
  encryptedTokens?: string;
  subdomain: string;
  /** "oauth" or "api_token" */
  authMode: "oauth" | "api_token";
  /** For api_token auth: the admin email */
  adminEmail?: string;
  lastSyncTimestamp?: string;
}
