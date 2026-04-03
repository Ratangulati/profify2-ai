import { createHmac, timingSafeEqual } from "node:crypto";

import type { WebhookEvent } from "../types.js";

import { mapWebhookToFeedback } from "./mapper.js";
import type { ZendeskWebhookPayload } from "./types.js";

/**
 * Verify a Zendesk webhook signature.
 *
 * Zendesk signs webhooks with HMAC-SHA256.
 * The signature is in the `x-zendesk-webhook-signature` header (base64-encoded).
 * The timestamp is in `x-zendesk-webhook-signature-timestamp`.
 *
 * Signing input: timestamp + body
 */
export function verifyZendeskSignature(
  rawBody: string | Buffer,
  timestamp: string | undefined,
  signature: string | undefined,
  signingSecret: string,
): boolean {
  if (!signature || !timestamp) return false;

  const signingInput = `${timestamp}${typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")}`;

  const expected = createHmac("sha256", signingSecret).update(signingInput).digest("base64");

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Process a Zendesk trigger webhook payload.
 *
 * Zendesk triggers are configured by the user to POST JSON to our endpoint.
 * The payload shape depends on the trigger template, but we expect the
 * ZendeskWebhookPayload fields.
 */
export function handleZendeskWebhook(
  headers: Record<string, string | string[] | undefined>,
  body: unknown,
  signingSecret: string,
  subdomain: string,
): WebhookEvent {
  const signature = Array.isArray(headers["x-zendesk-webhook-signature"])
    ? headers["x-zendesk-webhook-signature"][0]
    : headers["x-zendesk-webhook-signature"];

  const timestamp = Array.isArray(headers["x-zendesk-webhook-signature-timestamp"])
    ? headers["x-zendesk-webhook-signature-timestamp"][0]
    : headers["x-zendesk-webhook-signature-timestamp"];

  const rawBody = typeof body === "string" ? body : JSON.stringify(body);

  if (!verifyZendeskSignature(rawBody, timestamp, signature, signingSecret)) {
    throw new Error("Invalid Zendesk webhook signature");
  }

  const payload = (typeof body === "string" ? JSON.parse(body) : body) as ZendeskWebhookPayload;
  const item = mapWebhookToFeedback(payload, subdomain);
  const eventType = payload.event_type ?? "ticket_update";

  return { type: eventType, items: [item], rawPayload: payload };
}
