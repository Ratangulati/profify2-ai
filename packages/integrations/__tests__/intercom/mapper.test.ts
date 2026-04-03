import { describe, it, expect } from "vitest";

import { mapConversationToFeedback, stripHtml } from "../../src/intercom/mapper.js";
import type { IntercomConversationWithParts } from "../../src/intercom/types.js";

const makeConversation = (
  overrides?: Partial<IntercomConversationWithParts>,
): IntercomConversationWithParts => ({
  id: "conv_123",
  created_at: 1700000000,
  updated_at: 1700001000,
  title: "Login issues",
  state: "closed",
  source: {
    type: "conversation",
    id: "src_1",
    delivered_as: "customer_initiated",
    body: "<p>I can't log in to my account</p>",
    author: { type: "user", id: "user_1", name: "Jane Doe", email: "jane@example.com" },
    url: null,
  },
  contacts: {
    contacts: [{ id: "contact_1", email: "jane@example.com", name: "Jane Doe" }],
  },
  tags: {
    tags: [
      { id: "tag_1", name: "login" },
      { id: "tag_2", name: "bug" },
    ],
  },
  conversation_rating: {
    rating: 4,
    remark: "Resolved quickly",
    created_at: 1700002000,
  },
  statistics: {
    time_to_close: 3600,
    time_to_first_response: 120,
  },
  conversation_parts: {
    type: "conversation_part.list",
    conversation_parts: [
      {
        id: "part_1",
        part_type: "comment",
        body: "<p>I tried resetting my password but it didn't work</p>",
        created_at: 1700000500,
        author: { type: "user", id: "user_1", name: "Jane Doe", email: "jane@example.com" },
      },
      {
        id: "part_2",
        part_type: "comment",
        body: "Have you tried clearing your cookies?",
        created_at: 1700000600,
        author: { type: "admin", id: "admin_1", name: "Support Agent" },
      },
      {
        id: "part_3",
        part_type: "comment",
        body: "Yes, that fixed it! Thanks!",
        created_at: 1700000700,
        author: { type: "user", id: "user_1", name: "Jane Doe", email: "jane@example.com" },
      },
    ],
    total_count: 3,
  },
  ...overrides,
});

describe("mapConversationToFeedback", () => {
  it("maps the initial message and customer replies to feedback items", () => {
    const convo = makeConversation();
    const items = mapConversationToFeedback(convo, "app123");

    // Initial message + 2 customer parts (admin reply excluded)
    expect(items).toHaveLength(3);

    // Initial message
    expect(items[0].content).toBe("I can't log in to my account");
    expect(items[0].sourceRef).toBe("intercom:convo:conv_123:source");
    expect(items[0].customerEmail).toBe("jane@example.com");
    expect(items[0].segmentTags).toEqual(["login", "bug"]);
    expect(items[0].metadata).toMatchObject({
      rating: 4,
      timeToClose: 3600,
      topic: "Login issues",
    });

    // First customer reply
    expect(items[1].content).toBe("I tried resetting my password but it didn't work");
    expect(items[1].sourceRef).toBe("intercom:convo:conv_123:part:part_1");

    // Second customer reply (admin reply skipped)
    expect(items[2].content).toBe("Yes, that fixed it! Thanks!");
    expect(items[2].sourceRef).toBe("intercom:convo:conv_123:part:part_3");
  });

  it("builds correct source URL with appId", () => {
    const items = mapConversationToFeedback(makeConversation(), "myapp");
    expect(items[0].sourceUrl).toBe(
      "https://app.intercom.com/a/apps/myapp/inbox/inbox/all/conversations/conv_123",
    );
  });

  it("excludes admin-authored initial messages", () => {
    const convo = makeConversation({
      source: {
        type: "conversation",
        id: "src_1",
        delivered_as: "admin_initiated",
        body: "Admin started this convo",
        author: { type: "admin", id: "admin_1", name: "Agent" },
        url: null,
      },
    });
    const items = mapConversationToFeedback(convo);
    // Only customer parts, no initial message
    expect(items).toHaveLength(2);
  });

  it("returns empty array for conversations with no customer messages", () => {
    const convo = makeConversation({
      source: {
        type: "conversation",
        id: "src_1",
        delivered_as: "admin_initiated",
        body: "Admin note",
        author: { type: "admin", id: "admin_1" },
        url: null,
      },
      conversation_parts: {
        type: "conversation_part.list",
        conversation_parts: [],
        total_count: 0,
      },
    });
    const items = mapConversationToFeedback(convo);
    expect(items).toHaveLength(0);
  });
});

describe("stripHtml", () => {
  it("strips HTML tags and decodes entities", () => {
    expect(stripHtml("<p>Hello &amp; <b>world</b></p>")).toBe("Hello & world");
  });

  it("converts br tags to newlines", () => {
    expect(stripHtml("line1<br/>line2<br>line3")).toBe("line1\nline2\nline3");
  });

  it("collapses excessive newlines", () => {
    expect(stripHtml("<p>A</p><p></p><p></p><p>B</p>")).toBe("A\n\nB");
  });
});
