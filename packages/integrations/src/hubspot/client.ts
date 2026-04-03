import Bottleneck from "bottleneck";

import type {
  HubSpotPaginatedResponse,
  HubSpotDeal,
  HubSpotNote,
  HubSpotTicket,
  HubSpotCallEngagement,
  HubSpotFeedbackSubmission,
  HubSpotCompany,
  HubSpotContact,
  HubSpotOAuthResponse,
} from "./types.js";

const HUBSPOT_API = "https://api.hubapi.com";
const HUBSPOT_OAUTH_URL = "https://api.hubapi.com/oauth/v1/token";

/**
 * HubSpot CRM API v3 client with rate limiting.
 *
 * HubSpot rate limits:
 * - OAuth apps: 100 requests per 10 seconds (600/min)
 * - Private apps: 200 per 10 seconds
 * We target 80 per 10 seconds for safety.
 */
export class HubSpotClient {
  private limiter: Bottleneck;

  constructor(private accessToken: string) {
    this.limiter = new Bottleneck({
      reservoir: 80,
      reservoirRefreshAmount: 80,
      reservoirRefreshInterval: 10_000,
      maxConcurrent: 5,
      minTime: 100,
    });
  }

  /** Exchange an OAuth code for tokens. */
  static async exchangeCode(
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string,
  ): Promise<HubSpotOAuthResponse> {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });

    const res = await fetch(HUBSPOT_OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HubSpot OAuth exchange failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<HubSpotOAuthResponse>;
  }

  /** Refresh an expired access token. */
  static async refreshToken(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
  ): Promise<HubSpotOAuthResponse> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    const res = await fetch(HUBSPOT_OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HubSpot token refresh failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<HubSpotOAuthResponse>;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = path.startsWith("http") ? path : `${HUBSPOT_API}${path}`;

    const res = await this.limiter.schedule(() =>
      fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...init?.headers,
        },
      }),
    );

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After") ?? "10";
      throw new Error(`HubSpot rate limited. Retry after ${retryAfter}s`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HubSpot API ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Search deals with filters.
   * Uses the CRM search API for `hs_lastmodifieddate` filtering.
   */
  async searchDeals(
    modifiedAfter?: string,
    after?: string,
  ): Promise<HubSpotPaginatedResponse<HubSpotDeal>> {
    const filters: Array<Record<string, unknown>> = [];
    if (modifiedAfter) {
      filters.push({
        propertyName: "hs_lastmodifieddate",
        operator: "GTE",
        value: modifiedAfter,
      });
    }

    const body: Record<string, unknown> = {
      filterGroups: filters.length > 0 ? [{ filters }] : [],
      properties: [
        "dealname",
        "dealstage",
        "amount",
        "closedate",
        "closed_lost_reason",
        "hs_lastmodifieddate",
      ],
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "ASCENDING" }],
      limit: 100,
      ...(after ? { after } : {}),
    };

    return this.request<HubSpotPaginatedResponse<HubSpotDeal>>("/crm/v3/objects/deals/search", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** List notes (engagements) with pagination. */
  async listNotes(
    modifiedAfter?: string,
    after?: string,
  ): Promise<HubSpotPaginatedResponse<HubSpotNote>> {
    const filters: Array<Record<string, unknown>> = [];
    if (modifiedAfter) {
      filters.push({
        propertyName: "hs_lastmodifieddate",
        operator: "GTE",
        value: modifiedAfter,
      });
    }

    return this.request<HubSpotPaginatedResponse<HubSpotNote>>("/crm/v3/objects/notes/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: filters.length > 0 ? [{ filters }] : [],
        properties: ["hs_note_body", "hs_timestamp", "hs_lastmodifieddate", "hubspot_owner_id"],
        sorts: [{ propertyName: "hs_lastmodifieddate", direction: "ASCENDING" }],
        limit: 100,
        ...(after ? { after } : {}),
      }),
    });
  }

  /** Search tickets. */
  async searchTickets(
    modifiedAfter?: string,
    after?: string,
  ): Promise<HubSpotPaginatedResponse<HubSpotTicket>> {
    const filters: Array<Record<string, unknown>> = [];
    if (modifiedAfter) {
      filters.push({
        propertyName: "hs_lastmodifieddate",
        operator: "GTE",
        value: modifiedAfter,
      });
    }

    return this.request<HubSpotPaginatedResponse<HubSpotTicket>>("/crm/v3/objects/tickets/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: filters.length > 0 ? [{ filters }] : [],
        properties: [
          "subject",
          "content",
          "hs_pipeline_stage",
          "hs_ticket_priority",
          "hs_lastmodifieddate",
        ],
        sorts: [{ propertyName: "hs_lastmodifieddate", direction: "ASCENDING" }],
        limit: 100,
        ...(after ? { after } : {}),
      }),
    });
  }

  /** List call engagements. */
  async listCalls(
    modifiedAfter?: string,
    after?: string,
  ): Promise<HubSpotPaginatedResponse<HubSpotCallEngagement>> {
    const filters: Array<Record<string, unknown>> = [];
    if (modifiedAfter) {
      filters.push({
        propertyName: "hs_lastmodifieddate",
        operator: "GTE",
        value: modifiedAfter,
      });
    }

    return this.request<HubSpotPaginatedResponse<HubSpotCallEngagement>>(
      "/crm/v3/objects/calls/search",
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: filters.length > 0 ? [{ filters }] : [],
          properties: [
            "hs_call_body",
            "hs_call_title",
            "hs_call_direction",
            "hs_call_duration",
            "hs_call_disposition",
            "hs_timestamp",
            "hs_lastmodifieddate",
          ],
          sorts: [{ propertyName: "hs_lastmodifieddate", direction: "ASCENDING" }],
          limit: 100,
          ...(after ? { after } : {}),
        }),
      },
    );
  }

  /** List feedback submissions (requires Service Hub). */
  async listFeedbackSubmissions(
    modifiedAfter?: string,
    after?: string,
  ): Promise<HubSpotPaginatedResponse<HubSpotFeedbackSubmission>> {
    const params = new URLSearchParams({ limit: "100" });
    if (after) params.set("after", after);

    // Feedback submissions don't support the search endpoint;
    // use the list endpoint and filter client-side if needed.
    return this.request<HubSpotPaginatedResponse<HubSpotFeedbackSubmission>>(
      `/crm/v3/objects/feedback_submissions?${params.toString()}` +
        `&properties=hs_content,hs_survey_type,hs_sentiment,hs_response_value,hs_submission_timestamp,hs_lastmodifieddate`,
    );
  }

  /** Get a company by ID. */
  async getCompany(companyId: string): Promise<HubSpotCompany> {
    return this.request<HubSpotCompany>(
      `/crm/v3/objects/companies/${companyId}?properties=name,domain,industry`,
    );
  }

  /** Get a contact by ID. */
  async getContact(contactId: string): Promise<HubSpotContact> {
    return this.request<HubSpotContact>(
      `/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,email,company`,
    );
  }
}
