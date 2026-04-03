import type { DataSourceType } from "@pm-yc/shared";

// ── Feedback item shape produced by all providers ──────────────────────

export interface FeedbackItemData {
  content: string;
  sourceRef: string;
  sourceUrl?: string;
  customerEmail?: string;
  customerName?: string;
  segmentTags: string[];
  language?: string;
  metadata: Record<string, unknown>;
}

// ── Sync result returned after a full or incremental sync ──────────────

export interface SyncResult {
  items: FeedbackItemData[];
  /** Opaque cursor/timestamp the provider stores for incremental sync */
  cursor?: string;
  /** Whether there are more pages to fetch */
  hasMore: boolean;
}

// ── OAuth helpers ──────────────────────────────────────────────────────

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  /** Provider-specific extras (e.g. Salesforce instanceUrl) */
  [key: string]: unknown;
}

export interface OAuthStartResult {
  authUrl: string;
  state: string;
}

// ── Webhook payload after validation ──────────────────────────────────

export interface WebhookEvent {
  type: string;
  items: FeedbackItemData[];
  rawPayload: unknown;
}

// ── Config stored in DataSource.config (encrypted tokens inside) ──────

export interface IntegrationConfig {
  encryptedTokens?: string;
  /** Provider-specific settings (subdomain, custom fields, etc.) */
  [key: string]: unknown;
}

// ── Provider interface — every integration implements this ─────────────

export interface IntegrationProvider {
  readonly type: DataSourceType;

  /** Build the OAuth redirect URL */
  getAuthUrl(redirectUri: string, state: string): string;

  /** Exchange an auth code for tokens */
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;

  /** Run a full or incremental sync */
  sync(config: IntegrationConfig, cursor?: string): Promise<SyncResult>;

  /** Validate and parse an incoming webhook */
  handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    signingSecret: string,
  ): Promise<WebhookEvent>;
}
