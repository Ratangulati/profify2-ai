import Bottleneck from "bottleneck";

import type {
  ZendeskSearchResponse,
  ZendeskCommentsResponse,
  ZendeskSatisfactionResponse,
  ZendeskOAuthResponse,
  ZendeskUser,
  ZendeskOrganization,
} from "./types.js";

/**
 * Zendesk API client with rate limiting.
 * Most Zendesk plans allow 700 requests/minute.
 * We target 600/min for safety.
 */
export class ZendeskClient {
  private limiter: Bottleneck;
  private baseUrl: string;

  constructor(
    subdomain: string,
    private authHeader: string,
  ) {
    this.baseUrl = `https://${subdomain}.zendesk.com/api/v2`;
    this.limiter = new Bottleneck({
      reservoir: 600,
      reservoirRefreshAmount: 600,
      reservoirRefreshInterval: 60_000,
      maxConcurrent: 10,
      minTime: 80,
    });
  }

  /** Create a client using OAuth access token. */
  static withOAuth(subdomain: string, accessToken: string): ZendeskClient {
    return new ZendeskClient(subdomain, `Bearer ${accessToken}`);
  }

  /** Create a client using API token + admin email. */
  static withApiToken(subdomain: string, email: string, apiToken: string): ZendeskClient {
    const encoded = Buffer.from(`${email}/token:${apiToken}`).toString("base64");
    return new ZendeskClient(subdomain, `Basic ${encoded}`);
  }

  /** Exchange an OAuth code for an access token. */
  static async exchangeCode(
    subdomain: string,
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string,
  ): Promise<ZendeskOAuthResponse> {
    const res = await fetch(`https://${subdomain}.zendesk.com/oauth/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        scope: "read",
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Zendesk OAuth exchange failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<ZendeskOAuthResponse>;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;

    const res = await this.limiter.schedule(() =>
      fetch(url, {
        ...init,
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...init?.headers,
        },
      }),
    );

    // Handle Zendesk rate limit headers
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
      throw new Error(`Zendesk rate limited. Retry after ${retryAfter}s`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Zendesk API ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Search tickets updated after a given timestamp.
   * Uses cursor-based pagination via `after_cursor`.
   */
  async searchTickets(updatedAfter?: string, afterCursor?: string): Promise<ZendeskSearchResponse> {
    let query = "type:ticket";
    if (updatedAfter) {
      query += ` updated>${updatedAfter}`;
    }

    const params = new URLSearchParams({
      query,
      sort_by: "updated_at",
      sort_order: "asc",
      per_page: "100",
    });

    if (afterCursor) {
      params.set("page[after]", afterCursor);
    }

    return this.request<ZendeskSearchResponse>(`/search.json?${params.toString()}`);
  }

  /** Get all comments for a ticket. Only includes end-user (public) comments. */
  async getTicketComments(ticketId: number): Promise<ZendeskCommentsResponse> {
    return this.request<ZendeskCommentsResponse>(`/tickets/${ticketId}/comments.json`);
  }

  /** Get a user by ID (for resolving requester names). */
  async getUser(userId: number): Promise<ZendeskUser> {
    const res = await this.request<{ user: ZendeskUser }>(`/users/${userId}.json`);
    return res.user;
  }

  /** Get an organization by ID. */
  async getOrganization(orgId: number): Promise<ZendeskOrganization> {
    const res = await this.request<{ organization: ZendeskOrganization }>(
      `/organizations/${orgId}.json`,
    );
    return res.organization;
  }

  /** Get CSAT satisfaction ratings, optionally filtered by date. */
  async getSatisfactionRatings(afterDate?: string): Promise<ZendeskSatisfactionResponse> {
    const params = new URLSearchParams({ per_page: "100", sort_order: "asc" });
    if (afterDate) {
      params.set("start_time", String(Math.floor(new Date(afterDate).getTime() / 1000)));
    }
    return this.request<ZendeskSatisfactionResponse>(
      `/satisfaction_ratings.json?${params.toString()}`,
    );
  }
}
