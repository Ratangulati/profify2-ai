import { createHmac } from "node:crypto";

import { describe, it, expect } from "vitest";

import type { IntercomWebhookPayload } from "../../src/intercom/types.js";
import { verifyWebhookSignature, handleIntercomWebhook } from "../../src/intercom/webhook.js";

const SIGNING_SECRET = "test-webhook-secret";

function signPayload(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyWebhookSignature", () => {
  it("returns true for a valid signature", () => {
    const body = '{"type":"notification_event"}';
    const sig = signPayload(body, SIGNING_SECRET);
    expect(verifyWebhookSignature(body, sig, SIGNING_SECRET)).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    const body = '{"type":"notification_event"}';
    expect(verifyWebhookSignature(body, "sha256=bad", SIGNING_SECRET)).toBe(false);
  });

  it("returns false for missing signature", () => {
    expect(verifyWebhookSignature("body", undefined, SIGNING_SECRET)).toBe(false);
  });

  it("handles signature without sha256= prefix", () => {
    const body = "test";
    const hash = createHmac("sha256", SIGNING_SECRET).update(body).digest("hex");
    expect(verifyWebhookSignature(body, hash, SIGNING_SECRET)).toBe(true);
  });
});

describe("handleIntercomWebhook", () => {
  const makePayload = (topic: string): IntercomWebhookPayload => ({
    type: "notification_event",
    topic,
    id: "notif_1",
    app_id: "app_123",
    data: {
      type: "notification_event_data",
      item: {
        id: "conv_456",
        created_at: 1700000000,
        updated_at: 1700001000,
        title: "Feature request",
        state: "open",
        source: {
          type: "conversation",
          id: "src_1",
          delivered_as: "customer_initiated",
          body: "<p>I need dark mode</p>",
          author: { type: "user", id: "user_1", name: "Alice", email: "alice@co.com" },
          url: null,
        },
        contacts: { contacts: [{ id: "c1", email: "alice@co.com", name: "Alice" }] },
        tags: { tags: [{ id: "t1", name: "feature-request" }] },
        conversation_parts: {
          type: "conversation_part.list" as const,
          conversation_parts: [],
          total_count: 0,
        },
      },
    },
    delivery_attempts: 1,
    first_sent_at: 1700000000,
    created_at: 1700000000,
  });

  it("processes conversation.created webhook", () => {
    const payload = makePayload("conversation.created");
    const body = JSON.stringify(payload);
    const sig = signPayload(body, SIGNING_SECRET);

    const event = handleIntercomWebhook({ "x-hub-signature": sig }, body, SIGNING_SECRET);

    expect(event.type).toBe("conversation.created");
    expect(event.items).toHaveLength(1);
    expect(event.items[0].content).toBe("I need dark mode");
    expect(event.items[0].segmentTags).toEqual(["feature-request"]);
  });

  it("processes conversation_rating.added webhook", () => {
    const payload = makePayload("conversation_rating.added");
    // Add rating to the conversation item
    (payload.data.item as Record<string, unknown>).conversation_rating = {
      rating: 5,
      remark: "Amazing support!",
      created_at: 1700002000,
    };

    const body = JSON.stringify(payload);
    const sig = signPayload(body, SIGNING_SECRET);

    const event = handleIntercomWebhook({ "x-hub-signature": sig }, body, SIGNING_SECRET);

    expect(event.type).toBe("conversation_rating.added");
    expect(event.items).toHaveLength(1);
    expect(event.items[0].content).toBe("Amazing support!");
    expect(event.items[0].metadata).toMatchObject({ rating: 5 });
  });

  it("returns empty items for unsupported topics", () => {
    const payload = makePayload("conversation.admin.assigned");
    const body = JSON.stringify(payload);
    const sig = signPayload(body, SIGNING_SECRET);

    const event = handleIntercomWebhook({ "x-hub-signature": sig }, body, SIGNING_SECRET);

    expect(event.items).toHaveLength(0);
  });

  it("throws on invalid signature", () => {
    const payload = makePayload("conversation.created");
    const body = JSON.stringify(payload);

    expect(() =>
      handleIntercomWebhook({ "x-hub-signature": "sha256=bad" }, body, SIGNING_SECRET),
    ).toThrow("Invalid Intercom webhook signature");
  });
});
