import Bottleneck from "bottleneck";

import type {
  IntercomConversationWithParts,
  IntercomListResponse,
  IntercomOAuthResponse,
} from "./types.js";

const INTERCOM_API = "https://api.intercom.io";
const INTERCOM_TOKEN_URL = "https://api.intercom.io/auth/eagle/token";

/**
 * Intercom API client with built-in rate limiting via Bottleneck.
 * Intercom allows ~1000 requests/minute per workspace.
 * We target 800/min to leave headroom.
 */
export class IntercomClient {
  private limiter: Bottleneck;

  constructor(private accessToken: string) {
    this.limiter = new Bottleneck({
      reservoir: 800,
      reservoirRefreshAmount: 800,
      reservoirRefreshInterval: 60_000,
      maxConcurrent: 10,
      minTime: 50,
    });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.limiter.schedule(() =>
      fetch(`${INTERCOM_API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...init?.headers,
        },
      }),
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Intercom API ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /** Exchange an OAuth code for an access token. */
  static async exchangeCode(
    clientId: string,
    clientSecret: string,
    code: string,
  ): Promise<IntercomOAuthResponse> {
    const res = await fetch(INTERCOM_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Intercom OAuth exchange failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<IntercomOAuthResponse>;
  }

  /**
   * List conversations with cursor-based pagination.
   * @param startingAfter - cursor from previous page's `pages.next.starting_after`
   * @param updatedAfter  - Unix timestamp for incremental sync
   */
  async listConversations(
    startingAfter?: string,
    updatedAfter?: number,
  ): Promise<IntercomListResponse> {
    const params = new URLSearchParams({ per_page: "50" });
    if (startingAfter) params.set("starting_after", startingAfter);

    const path = `/conversations?${params.toString()}`;

    // Intercom's search endpoint supports updated_after filtering
    if (updatedAfter) {
      return this.searchConversations(updatedAfter, startingAfter);
    }

    return this.request<IntercomListResponse>(path);
  }

  /**
   * Search conversations updated after a given timestamp.
   * Uses POST /conversations/search with query builder.
   */
  async searchConversations(
    updatedAfter: number,
    startingAfter?: string,
  ): Promise<IntercomListResponse> {
    const body: Record<string, unknown> = {
      query: {
        field: "updated_at",
        operator: ">",
        value: updatedAfter,
      },
      pagination: { per_page: 50, ...(startingAfter ? { starting_after: startingAfter } : {}) },
    };

    return this.request<IntercomListResponse>("/conversations/search", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** Get a single conversation with all its parts (messages). */
  async getConversation(conversationId: string): Promise<IntercomConversationWithParts> {
    return this.request<IntercomConversationWithParts>(
      `/conversations/${conversationId}?display_as=plaintext`,
    );
  }
}
