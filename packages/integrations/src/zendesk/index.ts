import type {
  IntegrationProvider,
  IntegrationConfig,
  OAuthTokens,
  SyncResult,
  WebhookEvent,
} from "../types.js";

import { ZendeskClient } from "./client.js";
import { syncZendesk } from "./sync.js";
import type { ZendeskConfig } from "./types.js";
import { handleZendeskWebhook } from "./webhook.js";

export class ZendeskProvider implements IntegrationProvider {
  readonly type = "ZENDESK" as const;

  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}

  getAuthUrl(redirectUri: string, state: string): string {
    // Zendesk OAuth requires the subdomain — it must be in the state or a separate param.
    // We expect the caller to include subdomain in the state payload.
    // The actual auth URL is constructed per-subdomain.
    throw new Error("Use getAuthUrlForSubdomain() instead — Zendesk OAuth requires a subdomain");
  }

  /** Zendesk-specific: build the OAuth URL for a given subdomain. */
  getAuthUrlForSubdomain(subdomain: string, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      redirect_uri: redirectUri,
      client_id: this.clientId,
      scope: "read",
      state,
    });
    return `https://${subdomain}.zendesk.com/oauth/authorizations/new?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string, subdomain?: string): Promise<OAuthTokens> {
    if (!subdomain) {
      throw new Error("Zendesk OAuth exchange requires a subdomain");
    }

    const response = await ZendeskClient.exchangeCode(
      subdomain,
      this.clientId,
      this.clientSecret,
      code,
      redirectUri,
    );

    return { accessToken: response.access_token };
  }

  async sync(config: IntegrationConfig, cursor?: string): Promise<SyncResult> {
    return syncZendesk(config as unknown as ZendeskConfig, this.clientSecret, cursor);
  }

  async handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    signingSecret: string,
  ): Promise<WebhookEvent> {
    // Extract subdomain from a custom header or the webhook config
    const subdomain =
      (Array.isArray(headers["x-zendesk-subdomain"])
        ? headers["x-zendesk-subdomain"][0]
        : headers["x-zendesk-subdomain"]) ?? "unknown";

    return handleZendeskWebhook(headers, body, signingSecret, subdomain);
  }
}

export type { ZendeskConfig } from "./types.js";
export { ZendeskClient } from "./client.js";
export {
  mapTicketToFeedback,
  mapSatisfactionRatingToFeedback,
  mapWebhookToFeedback,
} from "./mapper.js";
export { verifyZendeskSignature, handleZendeskWebhook } from "./webhook.js";
