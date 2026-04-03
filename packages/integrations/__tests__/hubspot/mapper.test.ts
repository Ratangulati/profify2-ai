import { describe, it, expect } from "vitest";

import {
  mapDealToFeedback,
  mapNoteToFeedback,
  mapTicketToFeedback,
  mapCallToFeedback,
  mapFeedbackSubmissionToFeedback,
} from "../../src/hubspot/mapper.js";
import type {
  HubSpotDeal,
  HubSpotNote,
  HubSpotTicket,
  HubSpotCallEngagement,
  HubSpotFeedbackSubmission,
} from "../../src/hubspot/types.js";

const PORTAL_ID = "12345678";

describe("mapDealToFeedback", () => {
  const makeDeal = (overrides?: Partial<HubSpotDeal>): HubSpotDeal => ({
    id: "deal_001",
    properties: {
      dealname: "Enterprise Plan - BigCo",
      dealstage: "closedlost",
      amount: "75000",
      closedate: "2024-01-15T00:00:00.000Z",
      closed_lost_reason: "Product lacks SSO and audit logs",
      hs_lastmodifieddate: "2024-01-15T12:00:00.000Z",
    },
    ...overrides,
  });

  it("maps a closed-lost deal with revenue weight", () => {
    const item = mapDealToFeedback(makeDeal(), PORTAL_ID, "BigCo Inc");

    expect(item).not.toBeNull();
    expect(item!.content).toBe("Product lacks SSO and audit logs");
    expect(item!.sourceRef).toBe("hubspot:deal:deal_001");
    expect(item!.segmentTags).toEqual(["company:BigCo Inc"]);
    expect(item!.metadata).toMatchObject({
      hubspotObjectType: "Deal",
      dealName: "Enterprise Plan - BigCo",
      amount: 75000,
      revenueWeight: 75000,
      closedLostReason: "Product lacks SSO and audit logs",
      companyName: "BigCo Inc",
    });
  });

  it("returns null when no closed_lost_reason", () => {
    const deal = makeDeal();
    deal.properties.closed_lost_reason = null;
    expect(mapDealToFeedback(deal, PORTAL_ID)).toBeNull();
  });

  it("handles null amount gracefully", () => {
    const deal = makeDeal();
    deal.properties.amount = null;
    const item = mapDealToFeedback(deal, PORTAL_ID);
    expect(item!.metadata).toMatchObject({ amount: undefined, revenueWeight: undefined });
  });
});

describe("mapNoteToFeedback", () => {
  it("maps a note with HTML content", () => {
    const note: HubSpotNote = {
      id: "note_001",
      properties: {
        hs_note_body: "<p>Customer mentioned they need <b>bulk import</b> feature</p>",
        hs_timestamp: "2024-01-15T10:00:00.000Z",
        hs_lastmodifieddate: "2024-01-15T10:00:00.000Z",
        hubspot_owner_id: "owner_1",
      },
    };

    const item = mapNoteToFeedback(note, PORTAL_ID, "Acme");
    expect(item).not.toBeNull();
    expect(item!.content).toBe("Customer mentioned they need bulk import feature");
    expect(item!.segmentTags).toEqual(["company:Acme"]);
  });

  it("returns null for empty note body", () => {
    const note: HubSpotNote = {
      id: "note_002",
      properties: {
        hs_note_body: "",
        hs_timestamp: "2024-01-15T10:00:00.000Z",
        hs_lastmodifieddate: "2024-01-15T10:00:00.000Z",
        hubspot_owner_id: null,
      },
    };
    expect(mapNoteToFeedback(note, PORTAL_ID)).toBeNull();
  });
});

describe("mapTicketToFeedback", () => {
  it("maps a ticket", () => {
    const ticket: HubSpotTicket = {
      id: "ticket_001",
      properties: {
        subject: "Cannot upload files larger than 10MB",
        content: "When I try to upload a 15MB CSV, it fails with no error message",
        hs_pipeline_stage: "1",
        hs_ticket_priority: "HIGH",
        hs_lastmodifieddate: "2024-01-15T10:00:00.000Z",
      },
    };

    const item = mapTicketToFeedback(ticket, PORTAL_ID, "TestCo");
    expect(item).not.toBeNull();
    expect(item!.content).toBe("When I try to upload a 15MB CSV, it fails with no error message");
    expect(item!.sourceRef).toBe("hubspot:ticket:ticket_001");
  });

  it("falls back to subject when no content", () => {
    const ticket: HubSpotTicket = {
      id: "ticket_002",
      properties: {
        subject: "Login page is blank",
        content: null,
        hs_pipeline_stage: "1",
        hs_ticket_priority: null,
        hs_lastmodifieddate: "2024-01-15T10:00:00.000Z",
      },
    };

    const item = mapTicketToFeedback(ticket, PORTAL_ID);
    expect(item!.content).toBe("Login page is blank");
  });
});

describe("mapCallToFeedback", () => {
  it("maps a call engagement with notes", () => {
    const call: HubSpotCallEngagement = {
      id: "call_001",
      properties: {
        hs_call_body: "Customer requested webhook support and better error messages",
        hs_call_title: "Product feedback call",
        hs_call_direction: "OUTBOUND",
        hs_call_duration: "1800000",
        hs_call_disposition: "Connected",
        hs_timestamp: "2024-01-15T14:00:00.000Z",
        hs_lastmodifieddate: "2024-01-15T14:30:00.000Z",
      },
    };

    const item = mapCallToFeedback(call, PORTAL_ID, "ClientCo");
    expect(item).not.toBeNull();
    expect(item!.content).toBe("Customer requested webhook support and better error messages");
    expect(item!.metadata).toMatchObject({
      callDirection: "OUTBOUND",
      callDuration: "1800000",
    });
  });

  it("returns null for calls without notes", () => {
    const call: HubSpotCallEngagement = {
      id: "call_002",
      properties: {
        hs_call_body: null,
        hs_call_title: "Quick check-in",
        hs_call_direction: "INBOUND",
        hs_call_duration: "300000",
        hs_call_disposition: null,
        hs_timestamp: "2024-01-15T15:00:00.000Z",
        hs_lastmodifieddate: "2024-01-15T15:00:00.000Z",
      },
    };
    expect(mapCallToFeedback(call, PORTAL_ID)).toBeNull();
  });
});

describe("mapFeedbackSubmissionToFeedback", () => {
  it("maps a feedback survey submission", () => {
    const submission: HubSpotFeedbackSubmission = {
      id: "fb_001",
      properties: {
        hs_content: "The onboarding process was confusing, especially step 3",
        hs_survey_type: "NPS",
        hs_sentiment: "NEGATIVE",
        hs_response_value: "4",
        hs_submission_timestamp: "2024-01-15T16:00:00.000Z",
        hs_lastmodifieddate: "2024-01-15T16:00:00.000Z",
      },
    };

    const item = mapFeedbackSubmissionToFeedback(submission, PORTAL_ID);
    expect(item).not.toBeNull();
    expect(item!.content).toBe("The onboarding process was confusing, especially step 3");
    expect(item!.segmentTags).toEqual(["feedback_survey"]);
    expect(item!.metadata).toMatchObject({
      surveyType: "NPS",
      sentiment: "NEGATIVE",
      responseValue: "4",
    });
  });

  it("returns null when no content", () => {
    const submission: HubSpotFeedbackSubmission = {
      id: "fb_002",
      properties: {
        hs_content: null,
        hs_survey_type: "NPS",
        hs_sentiment: null,
        hs_response_value: "10",
        hs_submission_timestamp: "2024-01-15T16:00:00.000Z",
        hs_lastmodifieddate: "2024-01-15T16:00:00.000Z",
      },
    };
    expect(mapFeedbackSubmissionToFeedback(submission, PORTAL_ID)).toBeNull();
  });
});
