import type {
  IntegrationProvider,
  IntegrationConfig,
  OAuthTokens,
  SyncResult,
  WebhookEvent,
} from "../types.js";

import { HubSpotClient } from "./client.js";
import { syncHubSpot } from "./sync.js";
import type { HubSpotConfig } from "./types.js";

const HUBSPOT_AUTH_URL = "https://app.hubspot.com/oauth/authorize";

export class HubSpotProvider implements IntegrationProvider {
  readonly type = "HUBSPOT" as const;

  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}

  getAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
      scope: [
        "crm.objects.deals.read",
        "crm.objects.contacts.read",
        "crm.objects.companies.read",
        "tickets",
        "e-commerce",
      ].join(" "),
    });
    return `${HUBSPOT_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const response = await HubSpotClient.exchangeCode(
      this.clientId,
      this.clientSecret,
      code,
      redirectUri,
    );

    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
    };
  }

  async sync(config: IntegrationConfig, cursor?: string): Promise<SyncResult> {
    return syncHubSpot(config as HubSpotConfig, this.clientSecret, cursor);
  }

  async handleWebhook(
    _headers: Record<string, string | string[] | undefined>,
    _body: unknown,
    _signingSecret: string,
  ): Promise<WebhookEvent> {
    // HubSpot uses webhook subscriptions via developer apps.
    // Webhook handling can be added when subscriptions are configured.
    throw new Error("HubSpot webhook handling not implemented — use polling sync instead");
  }
}

export type { HubSpotConfig } from "./types.js";
export { HubSpotClient } from "./client.js";
export {
  mapDealToFeedback,
  mapNoteToFeedback,
  mapTicketToFeedback,
  mapCallToFeedback,
  mapFeedbackSubmissionToFeedback,
} from "./mapper.js";
