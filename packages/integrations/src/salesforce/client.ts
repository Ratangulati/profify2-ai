import Bottleneck from "bottleneck";

import type { SalesforceQueryResult, SalesforceOAuthResponse } from "./types.js";

const SF_LOGIN_URL = "https://login.salesforce.com";
const SF_API_VERSION = "v58.0";

/**
 * Salesforce REST API client with rate limiting.
 * Salesforce API limits vary by edition (typically 15,000–100,000/day).
 * We target 100 concurrent with 100ms spacing to stay safe.
 */
export class SalesforceClient {
  private limiter: Bottleneck;
  private apiBase: string;

  constructor(
    private instanceUrl: string,
    private accessToken: string,
  ) {
    this.apiBase = `${instanceUrl}/services/data/${SF_API_VERSION}`;
    this.limiter = new Bottleneck({
      maxConcurrent: 5,
      minTime: 100,
    });
  }

  /** OAuth 2.0 Web Server flow — exchange authorization code for tokens. */
  static async exchangeCode(
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string,
  ): Promise<SalesforceOAuthResponse> {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    const res = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Salesforce OAuth exchange failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<SalesforceOAuthResponse>;
  }

  /** Refresh an expired access token. */
  static async refreshToken(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
  ): Promise<SalesforceOAuthResponse> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Salesforce token refresh failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<SalesforceOAuthResponse>;
  }

  private async request<T>(path: string): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.apiBase}${path}`;

    const res = await this.limiter.schedule(() =>
      fetch(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
        },
      }),
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Salesforce API ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /** Execute a SOQL query with automatic pagination via nextRecordsUrl. */
  async query<T>(soql: string): Promise<T[]> {
    const encodedQuery = encodeURIComponent(soql);
    let result = await this.request<SalesforceQueryResult<T>>(`/query?q=${encodedQuery}`);
    const records = [...result.records];

    while (!result.done && result.nextRecordsUrl) {
      result = await this.request<SalesforceQueryResult<T>>(result.nextRecordsUrl);
      records.push(...result.records);
    }

    return records;
  }

  /** Execute a SOQL query returning the first page only (for paginated sync). */
  async queryPage<T>(soql: string): Promise<SalesforceQueryResult<T>> {
    const encodedQuery = encodeURIComponent(soql);
    return this.request<SalesforceQueryResult<T>>(`/query?q=${encodedQuery}`);
  }

  /** Fetch the next page of a paginated query. */
  async queryMore<T>(nextRecordsUrl: string): Promise<SalesforceQueryResult<T>> {
    return this.request<SalesforceQueryResult<T>>(nextRecordsUrl);
  }

  /** Describe an sObject to check if it exists (e.g. Feature_Request__c). */
  async describeSObject(objectName: string): Promise<boolean> {
    try {
      await this.request(`/sobjects/${objectName}/describe`);
      return true;
    } catch {
      return false;
    }
  }
}
