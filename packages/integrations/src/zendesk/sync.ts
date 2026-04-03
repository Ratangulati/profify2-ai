import { decryptTokens } from "../encryption.js";
import type { SyncResult, OAuthTokens } from "../types.js";

import { ZendeskClient } from "./client.js";
import { mapTicketToFeedback, mapSatisfactionRatingToFeedback } from "./mapper.js";
import type { ZendeskConfig, ZendeskComment } from "./types.js";

/**
 * Build a ZendeskClient from stored config.
 */
function buildClient(config: ZendeskConfig, secret: string): ZendeskClient {
  if (!config.encryptedTokens) {
    throw new Error("Zendesk integration is not authenticated — no tokens stored");
  }

  const tokens = decryptTokens<OAuthTokens & { apiToken?: string }>(config.encryptedTokens, secret);

  if (config.authMode === "api_token" && tokens.apiToken && config.adminEmail) {
    return ZendeskClient.withApiToken(config.subdomain, config.adminEmail, tokens.apiToken);
  }

  return ZendeskClient.withOAuth(config.subdomain, tokens.accessToken);
}

/**
 * Filter comments to only end-user messages (not agent replies or internal notes).
 */
function filterEndUserComments(
  comments: ZendeskComment[],
  endUserIds: Set<number>,
): ZendeskComment[] {
  // First comment is the ticket description, skip it
  return comments.slice(1).filter((c) => c.public && endUserIds.has(c.author_id));
}

/**
 * Run a sync pass against Zendesk.
 *
 * - Searches tickets updated since last sync
 * - For each ticket, fetches comments and filters to end-user messages
 * - Also pulls CSAT satisfaction ratings as separate feedback
 * - Uses cursor-based pagination
 */
export async function syncZendesk(
  config: ZendeskConfig,
  secret: string,
  cursor?: string,
): Promise<SyncResult> {
  const client = buildClient(config, secret);
  const allItems = [];

  // Parse cursor: "timestamp|afterCursor" or just a timestamp
  let updatedAfter: string | undefined;
  let afterCursor: string | undefined;

  if (cursor) {
    const pipeIdx = cursor.indexOf("|");
    if (pipeIdx > 0) {
      updatedAfter = cursor.slice(0, pipeIdx);
      afterCursor = cursor.slice(pipeIdx + 1);
    } else {
      updatedAfter = cursor;
    }
  } else if (config.lastSyncTimestamp) {
    updatedAfter = config.lastSyncTimestamp;
  }

  // Search tickets
  const searchResult = await client.searchTickets(updatedAfter, afterCursor);

  // Cache org names to avoid duplicate lookups
  const orgCache = new Map<number, string>();

  for (const ticket of searchResult.results) {
    // Resolve organization name for customer segment mapping
    let orgName: string | undefined;
    if (ticket.organization_id) {
      if (!orgCache.has(ticket.organization_id)) {
        try {
          const org = await client.getOrganization(ticket.organization_id);
          orgCache.set(ticket.organization_id, org.name);
        } catch {
          // Organization lookup failed — continue without it
        }
      }
      orgName = orgCache.get(ticket.organization_id);
    }

    // Fetch comments and filter to end-user messages
    const commentsResponse = await client.getTicketComments(ticket.id);

    // Build a set of end-user IDs (the requester)
    const endUserIds = new Set([ticket.requester_id]);
    const endUserComments = filterEndUserComments(commentsResponse.comments, endUserIds);

    const feedbackItems = mapTicketToFeedback(ticket, endUserComments, config.subdomain, orgName);
    allItems.push(...feedbackItems);
  }

  // Fetch CSAT ratings (only on first page to avoid duplicates)
  if (!afterCursor) {
    const csatResponse = await client.getSatisfactionRatings(updatedAfter);
    for (const rating of csatResponse.satisfaction_ratings) {
      const item = mapSatisfactionRatingToFeedback(rating, config.subdomain);
      if (item) allItems.push(item);
    }
  }

  // Build next cursor
  const hasMore = !!searchResult.next_page && !!searchResult.after_cursor;
  const nowIso = new Date().toISOString();
  let nextCursor: string | undefined;

  if (hasMore && searchResult.after_cursor) {
    const ts = updatedAfter ?? nowIso;
    nextCursor = `${ts}|${searchResult.after_cursor}`;
  } else {
    nextCursor = nowIso;
  }

  return { items: allItems, cursor: nextCursor, hasMore };
}
