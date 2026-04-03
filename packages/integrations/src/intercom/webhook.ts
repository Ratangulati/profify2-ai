import { createHmac } from "node:crypto";

import type { WebhookEvent, FeedbackItemData } from "../types.js";

import { mapConversationToFeedback } from "./mapper.js";
import type { IntercomWebhookPayload, IntercomConversationWithParts } from "./types.js";

const SUPPORTED_TOPICS = new Set([
  "conversation.created",
  "conversation.user.replied",
  "conversation_rating.added",
]);

/**
 * Validate the Intercom webhook signature.
 *
 * Intercom signs webhooks with HMAC-SHA256 using the app's client secret.
 * The signature is in the `x-hub-signature` header as `sha256=<hex>`.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  // Constant-time comparison
  if (expected.length !== provided.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Process an Intercom webhook payload into feedback items.
 */
export function handleIntercomWebhook(
  headers: Record<string, string | string[] | undefined>,
  body: unknown,
  signingSecret: string,
): WebhookEvent {
  const signature = Array.isArray(headers["x-hub-signature"])
    ? headers["x-hub-signature"][0]
    : headers["x-hub-signature"];

  const rawBody = typeof body === "string" ? body : JSON.stringify(body);

  if (!verifyWebhookSignature(rawBody, signature, signingSecret)) {
    throw new Error("Invalid Intercom webhook signature");
  }

  const payload = (typeof body === "string" ? JSON.parse(body) : body) as IntercomWebhookPayload;

  if (!SUPPORTED_TOPICS.has(payload.topic)) {
    return { type: payload.topic, items: [], rawPayload: payload };
  }

  const convo = payload.data.item as IntercomConversationWithParts;
  let items: FeedbackItemData[];

  if (payload.topic === "conversation_rating.added") {
    // For rating events, create a single feedback item with the rating
    const contact = convo.contacts?.contacts?.[0];
    items = convo.conversation_rating
      ? [
          {
            content:
              convo.conversation_rating.remark ?? `Rating: ${convo.conversation_rating.rating}/5`,
            sourceRef: `intercom:rating:${convo.id}`,
            sourceUrl: `https://app.intercom.com/conversations/${convo.id}`,
            customerEmail: contact?.email,
            customerName: contact?.name,
            segmentTags: (convo.tags?.tags ?? []).map((t) => t.name),
            metadata: {
              intercomConversationId: convo.id,
              rating: convo.conversation_rating.rating,
              ratingRemark: convo.conversation_rating.remark,
              webhookTopic: payload.topic,
            },
          },
        ]
      : [];
  } else {
    // For conversation.created and conversation.user.replied
    items = mapConversationToFeedback(convo);
    // Tag items with the webhook topic for downstream processing
    for (const item of items) {
      (item.metadata as Record<string, unknown>).webhookTopic = payload.topic;
    }
  }

  return { type: payload.topic, items, rawPayload: payload };
}
