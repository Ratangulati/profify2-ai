import type { FeedbackItemData } from "../types.js";

import type { IntercomConversationWithParts, IntercomConversationPart } from "./types.js";

/**
 * Extract customer messages from an Intercom conversation.
 * Filters out admin/bot replies — only "user" and "lead" messages are feedback.
 */
function extractCustomerParts(convo: IntercomConversationWithParts): IntercomConversationPart[] {
  return (convo.conversation_parts?.conversation_parts ?? []).filter(
    (part) => part.body && (part.author.type === "user" || part.author.type === "lead"),
  );
}

/**
 * Build the source URL for an Intercom conversation.
 */
function buildSourceUrl(conversationId: string, appId?: string): string {
  if (appId) {
    return `https://app.intercom.com/a/apps/${appId}/inbox/inbox/all/conversations/${conversationId}`;
  }
  return `https://app.intercom.com/conversations/${conversationId}`;
}

/**
 * Map a full Intercom conversation (with parts) into FeedbackItemData entries.
 *
 * Strategy:
 * - The initial customer message becomes one feedback item
 * - Each subsequent customer reply becomes its own item
 *   (so conversation threads produce multiple feedback signals)
 * - Tags, rating, and timing metadata are attached to every item
 */
export function mapConversationToFeedback(
  convo: IntercomConversationWithParts,
  appId?: string,
): FeedbackItemData[] {
  const items: FeedbackItemData[] = [];

  const contact = convo.contacts?.contacts?.[0];
  const tags = (convo.tags?.tags ?? []).map((t) => t.name);
  const sourceUrl = buildSourceUrl(convo.id, appId);

  const metadata: Record<string, unknown> = {
    intercomConversationId: convo.id,
    state: convo.state,
    topic: convo.title ?? undefined,
  };

  if (convo.conversation_rating) {
    metadata.rating = convo.conversation_rating.rating;
    metadata.ratingRemark = convo.conversation_rating.remark;
  }

  if (convo.statistics) {
    if (convo.statistics.time_to_close != null) {
      metadata.timeToClose = convo.statistics.time_to_close;
    }
    if (convo.statistics.time_to_first_response != null) {
      metadata.timeToFirstResponse = convo.statistics.time_to_first_response;
    }
  }

  // Initial message from the source (usually the customer opening the convo)
  if (convo.source?.body && convo.source.author?.type !== "admin") {
    items.push({
      content: stripHtml(convo.source.body),
      sourceRef: `intercom:convo:${convo.id}:source`,
      sourceUrl,
      customerEmail: contact?.email ?? convo.source.author?.email,
      customerName: contact?.name ?? convo.source.author?.name,
      segmentTags: tags,
      metadata: { ...metadata, partType: "initial_message" },
    });
  }

  // Subsequent customer replies
  const customerParts = extractCustomerParts(convo);
  for (const part of customerParts) {
    items.push({
      content: stripHtml(part.body!),
      sourceRef: `intercom:convo:${convo.id}:part:${part.id}`,
      sourceUrl,
      customerEmail: contact?.email ?? part.author.email,
      customerName: contact?.name ?? part.author.name,
      segmentTags: tags,
      metadata: { ...metadata, partType: part.part_type },
    });
  }

  return items;
}

/** Minimal HTML tag stripper for Intercom message bodies. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
