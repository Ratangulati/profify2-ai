import { createHmac } from "node:crypto";

import { describe, it, expect } from "vitest";

import { verifyZendeskSignature } from "../../src/zendesk/webhook.js";

const SIGNING_SECRET = "zendesk-test-secret";

describe("verifyZendeskSignature", () => {
  it("returns true for a valid signature", () => {
    const body = '{"ticket_id":"123"}';
    const timestamp = "1700000000";
    const signingInput = `${timestamp}${body}`;
    const signature = createHmac("sha256", SIGNING_SECRET).update(signingInput).digest("base64");

    expect(verifyZendeskSignature(body, timestamp, signature, SIGNING_SECRET)).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    const body = '{"ticket_id":"123"}';
    expect(verifyZendeskSignature(body, "1700000000", "badsig", SIGNING_SECRET)).toBe(false);
  });

  it("returns false for missing timestamp", () => {
    expect(verifyZendeskSignature("body", undefined, "sig", SIGNING_SECRET)).toBe(false);
  });

  it("returns false for missing signature", () => {
    expect(verifyZendeskSignature("body", "123", undefined, SIGNING_SECRET)).toBe(false);
  });
});
