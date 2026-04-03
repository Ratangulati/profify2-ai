import type { FeedbackItemData } from "../types.js";

import type {
  ZendeskTicket,
  ZendeskComment,
  ZendeskSatisfactionRating,
  ZendeskWebhookPayload,
} from "./types.js";

/**
 * Map a Zendesk ticket + its end-user comments into FeedbackItemData entries.
 *
 * Strategy:
 * - The ticket description (first message) is one feedback item.
 * - Each subsequent end-user comment is its own feedback item.
 * - Ticket tags, priority, and satisfaction rating go into metadata.
 */
export function mapTicketToFeedback(
  ticket: ZendeskTicket,
  endUserComments: ZendeskComment[],
  subdomain: string,
  organizationName?: string,
): FeedbackItemData[] {
  const items: FeedbackItemData[] = [];
  const sourceUrl = `https://${subdomain}.zendesk.com/agent/tickets/${ticket.id}`;

  const segmentTags = [...ticket.tags];
  if (organizationName) {
    segmentTags.push(`org:${organizationName}`);
  }

  const baseMetadata: Record<string, unknown> = {
    zendeskTicketId: ticket.id,
    ticketStatus: ticket.status,
    ticketPriority: ticket.priority,
    ticketSubject: ticket.subject,
  };

  if (ticket.satisfaction_rating) {
    baseMetadata.satisfactionScore = ticket.satisfaction_rating.score;
    baseMetadata.satisfactionComment = ticket.satisfaction_rating.comment;
  }

  if (organizationName) {
    baseMetadata.organizationName = organizationName;
  }

  // The ticket description (opening message)
  if (ticket.description) {
    items.push({
      content: ticket.description,
      sourceRef: `zendesk:ticket:${ticket.id}:description`,
      sourceUrl,
      segmentTags,
      metadata: { ...baseMetadata, commentType: "description" },
    });
  }

  // End-user comments (not agent internal notes)
  for (const comment of endUserComments) {
    items.push({
      content: comment.body,
      sourceRef: `zendesk:ticket:${ticket.id}:comment:${comment.id}`,
      sourceUrl,
      segmentTags,
      metadata: { ...baseMetadata, commentType: "end_user_reply" },
    });
  }

  return items;
}

/**
 * Map a Zendesk CSAT satisfaction rating into a FeedbackItemData.
 */
export function mapSatisfactionRatingToFeedback(
  rating: ZendeskSatisfactionRating,
  subdomain: string,
): FeedbackItemData | null {
  // Only process ratings that have a comment — bare good/bad scores
  // don't carry actionable feedback text
  const content = rating.comment ? rating.comment : `CSAT rating: ${rating.score}`;

  return {
    content,
    sourceRef: `zendesk:csat:${rating.id}`,
    sourceUrl: `https://${subdomain}.zendesk.com/agent/tickets/${rating.ticket_id}`,
    segmentTags: ["csat"],
    metadata: {
      zendeskTicketId: rating.ticket_id,
      csatScore: rating.score,
      csatComment: rating.comment,
    },
  };
}

/**
 * Map a Zendesk trigger webhook payload into a FeedbackItemData.
 */
export function mapWebhookToFeedback(
  payload: ZendeskWebhookPayload,
  subdomain: string,
): FeedbackItemData {
  const content = payload.current_comment ?? payload.ticket_description;
  const segmentTags = payload.ticket_tags ? payload.ticket_tags.split(" ").filter(Boolean) : [];

  if (payload.organization_name) {
    segmentTags.push(`org:${payload.organization_name}`);
  }

  return {
    content,
    sourceRef: `zendesk:ticket:${payload.ticket_id}:webhook`,
    sourceUrl: `https://${subdomain}.zendesk.com/agent/tickets/${payload.ticket_id}`,
    customerEmail: payload.requester_email,
    customerName: payload.requester_name,
    segmentTags,
    metadata: {
      zendeskTicketId: payload.ticket_id,
      ticketSubject: payload.ticket_subject,
      ticketStatus: payload.ticket_status,
      ticketPriority: payload.ticket_priority,
      organizationName: payload.organization_name,
      satisfactionScore: payload.satisfaction_score,
      satisfactionComment: payload.satisfaction_comment,
      eventType: payload.event_type,
      webhookSource: true,
    },
  };
}
