import { describe, it, expect } from "vitest";

import {
  detectByNameAndAlias,
  buildDetectionPrompt,
  parseLLMDetectionResponse,
  type CompetitorConfig,
} from "../../src/competitive/detection.js";

const COMPETITORS: CompetitorConfig[] = [
  { id: "c1", name: "Notion", aliases: [] },
  { id: "c2", name: "Productboard", aliases: ["PB"] },
  { id: "c3", name: "Aha!", aliases: ["Aha"] },
  { id: "c4", name: "Linear", aliases: [] },
];

describe("detectByNameAndAlias", () => {
  it("detects exact name match (case-insensitive)", () => {
    const results = detectByNameAndAlias("I really like notion for docs", COMPETITORS);
    expect(results).toHaveLength(1);
    expect(results[0].competitorName).toBe("Notion");
    expect(results[0].method).toBe("exact");
  });

  it("detects alias match", () => {
    const results = detectByNameAndAlias("We use PB for roadmapping", COMPETITORS);
    expect(results).toHaveLength(1);
    expect(results[0].competitorName).toBe("Productboard");
    expect(results[0].method).toBe("alias");
    expect(results[0].matchedTerm).toBe("PB");
  });

  it("detects multiple competitors", () => {
    const results = detectByNameAndAlias("We use Notion and Linear for planning", COMPETITORS);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.competitorName).sort()).toEqual(["Linear", "Notion"]);
  });

  it("respects word boundaries", () => {
    const results = detectByNameAndAlias("Notional improvements to the product", COMPETITORS);
    expect(results).toHaveLength(0);
  });

  it("returns empty array for no matches", () => {
    const results = detectByNameAndAlias("This is great software", COMPETITORS);
    expect(results).toHaveLength(0);
  });

  it("handles competitor name with special chars (Aha!)", () => {
    const results = detectByNameAndAlias("We compared this to Aha! last week", COMPETITORS);
    expect(results).toHaveLength(1);
    expect(results[0].competitorName).toBe("Aha!");
  });

  it("handles empty competitors list", () => {
    const results = detectByNameAndAlias("Some text about Notion", []);
    expect(results).toHaveLength(0);
  });

  it("handles empty content", () => {
    const results = detectByNameAndAlias("", COMPETITORS);
    expect(results).toHaveLength(0);
  });
});

describe("buildDetectionPrompt", () => {
  it("includes competitor names", () => {
    const prompt = buildDetectionPrompt("some feedback", ["Notion", "Linear"]);
    expect(prompt).toContain("Notion");
    expect(prompt).toContain("Linear");
  });

  it("includes feedback content", () => {
    const prompt = buildDetectionPrompt("I prefer the old tool", ["Notion"]);
    expect(prompt).toContain("I prefer the old tool");
  });
});

describe("parseLLMDetectionResponse", () => {
  it("parses valid response", () => {
    const raw = JSON.stringify([{ competitor_name: "Notion", matched_phrase: "that other tool" }]);
    const results = parseLLMDetectionResponse(raw, COMPETITORS);
    expect(results).toHaveLength(1);
    expect(results[0].competitorId).toBe("c1");
    expect(results[0].method).toBe("llm");
  });

  it("filters out unknown competitors", () => {
    const raw = JSON.stringify([{ competitor_name: "FakeProduct", matched_phrase: "some phrase" }]);
    const results = parseLLMDetectionResponse(raw, COMPETITORS);
    expect(results).toHaveLength(0);
  });

  it("handles empty array", () => {
    const results = parseLLMDetectionResponse("[]", COMPETITORS);
    expect(results).toHaveLength(0);
  });

  it("handles invalid JSON", () => {
    const results = parseLLMDetectionResponse("not json", COMPETITORS);
    expect(results).toHaveLength(0);
  });
});
