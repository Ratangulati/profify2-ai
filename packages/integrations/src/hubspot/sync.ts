import { decryptTokens } from "../encryption.js";
import type { SyncResult, OAuthTokens } from "../types.js";

import { HubSpotClient } from "./client.js";
import {
  mapDealToFeedback,
  mapNoteToFeedback,
  mapTicketToFeedback,
  mapCallToFeedback,
  mapFeedbackSubmissionToFeedback,
} from "./mapper.js";
import type { HubSpotConfig } from "./types.js";

/**
 * Build a HubSpotClient from stored config.
 */
function buildClient(config: HubSpotConfig, secret: string): HubSpotClient {
  if (!config.encryptedTokens) {
    throw new Error("HubSpot integration is not authenticated — no tokens stored");
  }

  const tokens = decryptTokens<OAuthTokens>(config.encryptedTokens, secret);
  return new HubSpotClient(tokens.accessToken);
}

/**
 * Resolve company name from an association, with caching.
 */
async function resolveCompanyName(
  client: HubSpotClient,
  companyId: string | undefined,
  cache: Map<string, string>,
): Promise<string | undefined> {
  if (!companyId) return undefined;
  if (cache.has(companyId)) return cache.get(companyId);

  try {
    const company = await client.getCompany(companyId);
    const name = company.properties.name;
    cache.set(companyId, name);
    return name;
  } catch {
    return undefined;
  }
}

/**
 * Run a sync pass against HubSpot.
 *
 * Syncs five object types:
 * 1. Deals (closed-lost with reason) — maps amount to revenueWeight
 * 2. Notes (deal/company notes)
 * 3. Tickets (support tickets with content)
 * 4. Calls (call engagement notes)
 * 5. Feedback submissions (if Service Hub is available)
 *
 * All use `hs_lastmodifieddate` for incremental sync.
 */
export async function syncHubSpot(
  config: HubSpotConfig,
  secret: string,
  cursor?: string,
): Promise<SyncResult> {
  const client = buildClient(config, secret);
  const portalId = config.portalId ?? "";
  const allItems = [];

  const modifiedAfter = cursor ?? config.lastSyncTimestamp;
  const companyCache = new Map<string, string>();

  // 1. Closed-lost deals
  const dealsResponse = await client.searchDeals(modifiedAfter);
  for (const deal of dealsResponse.results) {
    // Only process closed-lost deals that have a reason
    if (!deal.properties.closed_lost_reason) continue;

    const companyId = deal.associations?.companies?.results?.[0]?.id;
    const companyName = await resolveCompanyName(client, companyId, companyCache);

    const item = mapDealToFeedback(deal, portalId, companyName);
    if (item) allItems.push(item);
  }

  // 2. Notes
  const notesResponse = await client.listNotes(modifiedAfter);
  for (const note of notesResponse.results) {
    const companyId = note.associations?.companies?.results?.[0]?.id;
    const companyName = await resolveCompanyName(client, companyId, companyCache);

    const item = mapNoteToFeedback(note, portalId, companyName);
    if (item) allItems.push(item);
  }

  // 3. Tickets
  const ticketsResponse = await client.searchTickets(modifiedAfter);
  for (const ticket of ticketsResponse.results) {
    const item = mapTicketToFeedback(ticket, portalId);
    if (item) allItems.push(item);
  }

  // 4. Calls
  const callsResponse = await client.listCalls(modifiedAfter);
  for (const call of callsResponse.results) {
    const companyId = call.associations?.companies?.results?.[0]?.id;
    const companyName = await resolveCompanyName(client, companyId, companyCache);

    const item = mapCallToFeedback(call, portalId, companyName);
    if (item) allItems.push(item);
  }

  // 5. Feedback submissions (if Service Hub is enabled)
  if (config.hasFeedbackSurveys !== false) {
    try {
      const feedbackResponse = await client.listFeedbackSubmissions(modifiedAfter);
      for (const submission of feedbackResponse.results) {
        // Client-side filter for incremental sync
        if (modifiedAfter && submission.properties.hs_lastmodifieddate < modifiedAfter) {
          continue;
        }

        const item = mapFeedbackSubmissionToFeedback(submission, portalId);
        if (item) allItems.push(item);
      }
    } catch {
      // Feedback submissions require Service Hub — silently skip if unavailable
    }
  }

  return {
    items: allItems,
    cursor: new Date().toISOString(),
    hasMore: false,
  };
}
