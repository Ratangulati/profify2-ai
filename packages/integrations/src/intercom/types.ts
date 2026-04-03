// ── Intercom API response shapes ───────────────────────────────────────

export interface IntercomConversation {
  id: string;
  created_at: number;
  updated_at: number;
  title: string | null;
  state: "open" | "closed" | "snoozed";
  source: {
    type: string;
    id: string;
    delivered_as: string;
    body: string;
    author: IntercomAuthor;
    url: string | null;
  };
  contacts: {
    contacts: Array<{ id: string; external_id?: string; email?: string; name?: string }>;
  };
  tags: { tags: Array<{ id: string; name: string }> };
  conversation_rating?: {
    rating: number;
    remark: string | null;
    created_at: number;
  };
  statistics?: {
    time_to_close?: number;
    time_to_first_response?: number;
  };
  custom_attributes?: Record<string, unknown>;
}

export interface IntercomAuthor {
  type: "user" | "lead" | "admin" | "bot" | "team";
  id: string;
  name?: string;
  email?: string;
}

export interface IntercomConversationPart {
  id: string;
  part_type: string;
  body: string | null;
  created_at: number;
  author: IntercomAuthor;
}

export interface IntercomConversationParts {
  type: "conversation_part.list";
  conversation_parts: IntercomConversationPart[];
  total_count: number;
}

export interface IntercomConversationWithParts extends IntercomConversation {
  conversation_parts: IntercomConversationParts;
}

export interface IntercomListResponse {
  type: "conversation.list";
  conversations: IntercomConversation[];
  pages: {
    type: "pages";
    page: number;
    per_page: number;
    total_pages: number;
    next?: { page: number; starting_after: string };
  };
}

export interface IntercomOAuthResponse {
  token_type: string;
  access_token: string;
}

// ── Webhook payloads ───────────────────────────────────────────────────

export interface IntercomWebhookPayload {
  type: "notification_event";
  topic: string;
  id: string;
  app_id: string;
  data: {
    type: "notification_event_data";
    item: IntercomConversation | IntercomConversationWithParts;
  };
  delivery_attempts: number;
  first_sent_at: number;
  created_at: number;
}

// ── Config shape stored in DataSource.config ───────────────────────────

export interface IntercomConfig {
  encryptedTokens?: string;
  appId?: string;
  /** ISO timestamp for incremental sync */
  lastSyncTimestamp?: string;
}
