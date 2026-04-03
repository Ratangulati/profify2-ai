import type {
  IntegrationProvider,
  IntegrationConfig,
  OAuthTokens,
  SyncResult,
  WebhookEvent,
} from "../types.js";

import { IntercomClient } from "./client.js";
import { syncIntercom } from "./sync.js";
import type { IntercomConfig } from "./types.js";
import { handleIntercomWebhook } from "./webhook.js";

const INTERCOM_AUTH_URL = "https://app.intercom.com/oauth";

export class IntercomProvider implements IntegrationProvider {
  readonly type = "INTERCOM" as const;

  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}

  getAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
    });
    return `${INTERCOM_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<OAuthTokens> {
    const response = await IntercomClient.exchangeCode(this.clientId, this.clientSecret, code);
    return {
      accessToken: response.access_token,
      // Intercom tokens don't expire and have no refresh token
    };
  }

  async sync(config: IntegrationConfig, cursor?: string): Promise<SyncResult> {
    return syncIntercom(config as IntercomConfig, this.clientSecret, cursor);
  }

  async handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    signingSecret: string,
  ): Promise<WebhookEvent> {
    return handleIntercomWebhook(headers, body, signingSecret);
  }
}

export type { IntercomConfig } from "./types.js";
export { IntercomClient } from "./client.js";
export { mapConversationToFeedback, stripHtml } from "./mapper.js";
export { verifyWebhookSignature, handleIntercomWebhook } from "./webhook.js";
