import type { FeedbackItemData } from "../types.js";

import type {
  HubSpotDeal,
  HubSpotNote,
  HubSpotTicket,
  HubSpotCallEngagement,
  HubSpotFeedbackSubmission,
} from "./types.js";

const HUBSPOT_BASE = "https://app.hubspot.com";

/**
 * Map a closed-lost HubSpot deal into a FeedbackItemData.
 */
export function mapDealToFeedback(
  deal: HubSpotDeal,
  portalId: string,
  companyName?: string,
): FeedbackItemData | null {
  const reason = deal.properties.closed_lost_reason;
  if (!reason) return null;

  const segmentTags: string[] = [];
  if (companyName) segmentTags.push(`company:${companyName}`);

  const amount = deal.properties.amount ? parseFloat(deal.properties.amount) : undefined;

  return {
    content: reason,
    sourceRef: `hubspot:deal:${deal.id}`,
    sourceUrl: `${HUBSPOT_BASE}/contacts/${portalId}/deal/${deal.id}`,
    segmentTags,
    metadata: {
      hubspotObjectType: "Deal",
      hubspotId: deal.id,
      dealName: deal.properties.dealname,
      dealStage: deal.properties.dealstage,
      amount,
      closeDate: deal.properties.closedate,
      closedLostReason: reason,
      companyName,
      revenueWeight: amount,
    },
  };
}

/**
 * Map a HubSpot note engagement into a FeedbackItemData.
 */
export function mapNoteToFeedback(
  note: HubSpotNote,
  portalId: string,
  companyName?: string,
): FeedbackItemData | null {
  const body = note.properties.hs_note_body;
  if (!body) return null;

  const segmentTags: string[] = [];
  if (companyName) segmentTags.push(`company:${companyName}`);

  return {
    content: stripHtml(body),
    sourceRef: `hubspot:note:${note.id}`,
    sourceUrl: `${HUBSPOT_BASE}/contacts/${portalId}/record/0-4/${note.id}`,
    segmentTags,
    metadata: {
      hubspotObjectType: "Note",
      hubspotId: note.id,
      timestamp: note.properties.hs_timestamp,
      companyName,
    },
  };
}

/**
 * Map a HubSpot ticket into a FeedbackItemData.
 */
export function mapTicketToFeedback(
  ticket: HubSpotTicket,
  portalId: string,
  companyName?: string,
): FeedbackItemData | null {
  const content = ticket.properties.content ?? ticket.properties.subject;
  if (!content) return null;

  const segmentTags: string[] = [];
  if (companyName) segmentTags.push(`company:${companyName}`);

  return {
    content,
    sourceRef: `hubspot:ticket:${ticket.id}`,
    sourceUrl: `${HUBSPOT_BASE}/contacts/${portalId}/ticket/${ticket.id}`,
    segmentTags,
    metadata: {
      hubspotObjectType: "Ticket",
      hubspotId: ticket.id,
      ticketSubject: ticket.properties.subject,
      pipelineStage: ticket.properties.hs_pipeline_stage,
      priority: ticket.properties.hs_ticket_priority,
      companyName,
    },
  };
}

/**
 * Map a HubSpot call engagement into a FeedbackItemData.
 */
export function mapCallToFeedback(
  call: HubSpotCallEngagement,
  portalId: string,
  companyName?: string,
): FeedbackItemData | null {
  const body = call.properties.hs_call_body;
  if (!body) return null;

  const segmentTags: string[] = [];
  if (companyName) segmentTags.push(`company:${companyName}`);

  return {
    content: body,
    sourceRef: `hubspot:call:${call.id}`,
    sourceUrl: `${HUBSPOT_BASE}/contacts/${portalId}/record/0-48/${call.id}`,
    segmentTags,
    metadata: {
      hubspotObjectType: "Call",
      hubspotId: call.id,
      callTitle: call.properties.hs_call_title,
      callDirection: call.properties.hs_call_direction,
      callDuration: call.properties.hs_call_duration,
      callDisposition: call.properties.hs_call_disposition,
      timestamp: call.properties.hs_timestamp,
      companyName,
    },
  };
}

/**
 * Map a HubSpot feedback submission into a FeedbackItemData.
 */
export function mapFeedbackSubmissionToFeedback(
  submission: HubSpotFeedbackSubmission,
  portalId: string,
): FeedbackItemData | null {
  const content = submission.properties.hs_content;
  if (!content) return null;

  return {
    content,
    sourceRef: `hubspot:feedback:${submission.id}`,
    sourceUrl: `${HUBSPOT_BASE}/contacts/${portalId}/record/0-19/${submission.id}`,
    segmentTags: ["feedback_survey"],
    metadata: {
      hubspotObjectType: "FeedbackSubmission",
      hubspotId: submission.id,
      surveyType: submission.properties.hs_survey_type,
      sentiment: submission.properties.hs_sentiment,
      responseValue: submission.properties.hs_response_value,
      submissionTimestamp: submission.properties.hs_submission_timestamp,
    },
  };
}

/** Minimal HTML tag stripper. */
function stripHtml(html: string): string {
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
