import { decryptTokens } from "../encryption.js";
import type { SyncResult, OAuthTokens } from "../types.js";

import { IntercomClient } from "./client.js";
import { mapConversationToFeedback } from "./mapper.js";
import type { IntercomConfig } from "./types.js";

/**
 * Run a sync pass against Intercom.
 *
 * - Full sync: fetches all conversations.
 * - Incremental sync: uses `updated_after` to only fetch conversations
 *   modified since the last sync cursor (an ISO timestamp).
 *
 * Returns a page of FeedbackItemData plus the next cursor.
 * The caller (worker job) is responsible for calling this in a loop
 * while `hasMore` is true, then storing the final cursor.
 */
export async function syncIntercom(
  config: IntercomConfig,
  secret: string,
  cursor?: string,
): Promise<SyncResult> {
  if (!config.encryptedTokens) {
    throw new Error("Intercom integration is not authenticated — no tokens stored");
  }

  const tokens = decryptTokens<OAuthTokens>(config.encryptedTokens, secret);
  const client = new IntercomClient(tokens.accessToken);

  // Parse cursor: "timestamp|startingAfter" or just a timestamp
  let updatedAfter: number | undefined;
  let startingAfter: string | undefined;

  if (cursor) {
    const [ts, sa] = cursor.split("|");
    if (ts) updatedAfter = Math.floor(new Date(ts).getTime() / 1000);
    if (sa) startingAfter = sa;
  } else if (config.lastSyncTimestamp) {
    updatedAfter = Math.floor(new Date(config.lastSyncTimestamp).getTime() / 1000);
  }

  const response = await client.listConversations(startingAfter, updatedAfter);
  const allItems = [];

  // For each conversation, fetch full parts and map to feedback
  for (const convo of response.conversations) {
    const full = await client.getConversation(convo.id);
    const feedbackItems = mapConversationToFeedback(full, config.appId);
    allItems.push(...feedbackItems);
  }

  // Build next cursor
  const hasMore = !!response.pages.next;
  const nowIso = new Date().toISOString();
  let nextCursor: string | undefined;

  if (hasMore && response.pages.next) {
    // Preserve the sync timestamp with the pagination cursor
    const ts = updatedAfter ? new Date(updatedAfter * 1000).toISOString() : nowIso;
    nextCursor = `${ts}|${response.pages.next.starting_after}`;
  } else {
    // Pagination complete — store current time as the new watermark
    nextCursor = nowIso;
  }

  return {
    items: allItems,
    cursor: nextCursor,
    hasMore,
  };
}
