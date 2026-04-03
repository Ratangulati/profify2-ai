import type {
  IntegrationProvider,
  IntegrationConfig,
  OAuthTokens,
  SyncResult,
  WebhookEvent,
} from "../types.js";

import { SalesforceClient } from "./client.js";
import { syncSalesforce } from "./sync.js";
import type { SalesforceConfig } from "./types.js";

const SF_AUTH_URL = "https://login.salesforce.com/services/oauth2/authorize";

export class SalesforceProvider implements IntegrationProvider {
  readonly type = "SALESFORCE" as const;

  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}

  getAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
      scope: "api refresh_token",
    });
    return `${SF_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const response = await SalesforceClient.exchangeCode(
      this.clientId,
      this.clientSecret,
      code,
      redirectUri,
    );

    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      instanceUrl: response.instance_url,
    };
  }

  async sync(config: IntegrationConfig, cursor?: string): Promise<SyncResult> {
    return syncSalesforce(config as SalesforceConfig, this.clientSecret, cursor);
  }

  async handleWebhook(
    _headers: Record<string, string | string[] | undefined>,
    _body: unknown,
    _signingSecret: string,
  ): Promise<WebhookEvent> {
    // Salesforce uses Outbound Messages or Platform Events, not simple webhooks.
    // For now, we rely on polling sync. Outbound Message support can be added later.
    throw new Error("Salesforce webhook handling not implemented — use polling sync instead");
  }
}

export type { SalesforceConfig } from "./types.js";
export { SalesforceClient } from "./client.js";
export {
  mapOpportunityToFeedback,
  mapCaseToFeedback,
  mapTaskToFeedback,
  mapFeatureRequestToFeedback,
} from "./mapper.js";
