import { describe, it, expect } from "vitest";

import {
  mapTicketToFeedback,
  mapSatisfactionRatingToFeedback,
  mapWebhookToFeedback,
} from "../../src/zendesk/mapper.js";
import type {
  ZendeskTicket,
  ZendeskComment,
  ZendeskSatisfactionRating,
  ZendeskWebhookPayload,
} from "../../src/zendesk/types.js";

const SUBDOMAIN = "testco";

const makeTicket = (overrides?: Partial<ZendeskTicket>): ZendeskTicket => ({
  id: 12345,
  url: "https://testco.zendesk.com/api/v2/tickets/12345.json",
  subject: "Can't export reports",
  description: "When I click export, nothing happens. Please help!",
  status: "open",
  priority: "high",
  tags: ["export", "bug"],
  requester_id: 100,
  submitter_id: 100,
  organization_id: 200,
  satisfaction_rating: { score: "good", comment: "Quick fix!" },
  created_at: "2024-01-15T10:00:00Z",
  updated_at: "2024-01-15T12:00:00Z",
  custom_fields: [],
  ...overrides,
});

const makeComment = (overrides?: Partial<ZendeskComment>): ZendeskComment => ({
  id: 5001,
  type: "Comment",
  body: "I tried a different browser and same issue",
  html_body: "<p>I tried a different browser and same issue</p>",
  author_id: 100,
  public: true,
  created_at: "2024-01-15T11:00:00Z",
  ...overrides,
});

describe("mapTicketToFeedback", () => {
  it("maps a ticket description and end-user comments to feedback items", () => {
    const ticket = makeTicket();
    const endUserComments = [makeComment()];
    const items = mapTicketToFeedback(ticket, endUserComments, SUBDOMAIN, "Acme Corp");

    expect(items).toHaveLength(2);

    // Description item
    expect(items[0].content).toBe("When I click export, nothing happens. Please help!");
    expect(items[0].sourceRef).toBe("zendesk:ticket:12345:description");
    expect(items[0].sourceUrl).toBe("https://testco.zendesk.com/agent/tickets/12345");
    expect(items[0].segmentTags).toEqual(["export", "bug", "org:Acme Corp"]);
    expect(items[0].metadata).toMatchObject({
      zendeskTicketId: 12345,
      ticketStatus: "open",
      ticketPriority: "high",
      satisfactionScore: "good",
      organizationName: "Acme Corp",
    });

    // End-user comment
    expect(items[1].content).toBe("I tried a different browser and same issue");
    expect(items[1].sourceRef).toBe("zendesk:ticket:12345:comment:5001");
  });

  it("handles tickets with no description", () => {
    const ticket = makeTicket({ description: "" });
    const items = mapTicketToFeedback(ticket, [], SUBDOMAIN);
    expect(items).toHaveLength(0);
  });

  it("includes org tag when organizationName is provided", () => {
    const items = mapTicketToFeedback(makeTicket(), [], SUBDOMAIN, "BigCo");
    expect(items[0].segmentTags).toContain("org:BigCo");
  });
});

describe("mapSatisfactionRatingToFeedback", () => {
  it("maps a CSAT rating with comment", () => {
    const rating: ZendeskSatisfactionRating = {
      id: 3001,
      score: "bad",
      comment: "Response time was too slow",
      requester_id: 100,
      ticket_id: 12345,
      created_at: "2024-01-16T10:00:00Z",
      updated_at: "2024-01-16T10:00:00Z",
    };

    const item = mapSatisfactionRatingToFeedback(rating, SUBDOMAIN);
    expect(item).not.toBeNull();
    expect(item!.content).toBe("Response time was too slow");
    expect(item!.sourceRef).toBe("zendesk:csat:3001");
    expect(item!.segmentTags).toEqual(["csat"]);
    expect(item!.metadata).toMatchObject({ csatScore: "bad" });
  });

  it("maps a CSAT rating without comment as a bare rating", () => {
    const rating: ZendeskSatisfactionRating = {
      id: 3002,
      score: "good",
      comment: null,
      requester_id: 100,
      ticket_id: 12345,
      created_at: "2024-01-16T10:00:00Z",
      updated_at: "2024-01-16T10:00:00Z",
    };

    const item = mapSatisfactionRatingToFeedback(rating, SUBDOMAIN);
    expect(item!.content).toBe("CSAT rating: good");
  });
});

describe("mapWebhookToFeedback", () => {
  it("maps a Zendesk webhook payload", () => {
    const payload: ZendeskWebhookPayload = {
      ticket_id: "12345",
      ticket_subject: "Export broken",
      ticket_description: "Export button doesn't work",
      ticket_status: "open",
      ticket_priority: "high",
      ticket_tags: "export bug",
      requester_name: "Jane",
      requester_email: "jane@example.com",
      organization_name: "Acme",
      current_comment: "Still broken after update",
      event_type: "ticket_update",
    };

    const item = mapWebhookToFeedback(payload, SUBDOMAIN);
    expect(item.content).toBe("Still broken after update");
    expect(item.customerEmail).toBe("jane@example.com");
    expect(item.segmentTags).toEqual(["export", "bug", "org:Acme"]);
    expect(item.metadata).toMatchObject({ webhookSource: true });
  });

  it("falls back to description when no current comment", () => {
    const payload: ZendeskWebhookPayload = {
      ticket_id: "12345",
      ticket_subject: "Issue",
      ticket_description: "Original description",
      ticket_status: "new",
      ticket_priority: "normal",
      ticket_tags: "",
      requester_name: "Bob",
      requester_email: "bob@example.com",
    };

    const item = mapWebhookToFeedback(payload, SUBDOMAIN);
    expect(item.content).toBe("Original description");
  });
});
