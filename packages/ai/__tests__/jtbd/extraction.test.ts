import { describe, it, expect } from "vitest";

import {
  buildJTBDPrompt,
  parseJTBDResponse,
  calculateOpportunityScore,
  type FeedbackForJTBD,
} from "../../src/jtbd/extraction.js";

describe("calculateOpportunityScore", () => {
  it("returns importance + gap for high importance, low satisfaction", () => {
    // importance=5, satisfaction=1 → gap=4 → score=9
    expect(calculateOpportunityScore(5, 1)).toBe(9);
  });

  it("returns just importance when satisfaction >= importance", () => {
    // importance=3, satisfaction=4 → gap=0 → score=3
    expect(calculateOpportunityScore(3, 4)).toBe(3);
  });

  it("handles equal importance and satisfaction", () => {
    expect(calculateOpportunityScore(3, 3)).toBe(3);
  });

  it("handles maximum values", () => {
    expect(calculateOpportunityScore(5, 5)).toBe(5);
  });

  it("handles minimum values", () => {
    expect(calculateOpportunityScore(1, 1)).toBe(1);
  });

  it("max opportunity: importance 5, satisfaction 1", () => {
    expect(calculateOpportunityScore(5, 1)).toBe(9);
  });
});

describe("buildJTBDPrompt", () => {
  it("includes theme title", () => {
    const items: FeedbackForJTBD[] = [
      { id: "f1", content: "I need faster reports", sentimentScore: -0.3 },
    ];
    const prompt = buildJTBDPrompt("Reporting Issues", items);
    expect(prompt).toContain("Reporting Issues");
  });

  it("includes all feedback items", () => {
    const items: FeedbackForJTBD[] = [
      { id: "f1", content: "Feedback one", sentimentScore: null },
      { id: "f2", content: "Feedback two", sentimentScore: 0.5 },
    ];
    const prompt = buildJTBDPrompt("Theme", items);
    expect(prompt).toContain("[f1]");
    expect(prompt).toContain("[f2]");
    expect(prompt).toContain("Feedback one");
    expect(prompt).toContain("Feedback two");
  });

  it("references all job types", () => {
    const prompt = buildJTBDPrompt("T", [{ id: "f1", content: "t", sentimentScore: null }]);
    expect(prompt).toContain("MAIN");
    expect(prompt).toContain("RELATED");
    expect(prompt).toContain("EMOTIONAL");
    expect(prompt).toContain("SOCIAL");
  });
});

describe("parseJTBDResponse", () => {
  it("parses valid JTBD response", () => {
    const raw = JSON.stringify([
      {
        statement:
          "When I generate reports, I want to see real-time data, so I can make timely decisions",
        job_type: "MAIN",
        importance: 5,
        satisfaction: 2,
        evidence_ids: ["f1", "f2"],
      },
    ]);
    const results = parseJTBDResponse(raw);
    expect(results).toHaveLength(1);
    expect(results[0].statement).toContain("When I generate reports");
    expect(results[0].jobType).toBe("MAIN");
    expect(results[0].importance).toBe(5);
    expect(results[0].satisfaction).toBe(2);
    expect(results[0].opportunityScore).toBe(8); // 5 + (5-2)
    expect(results[0].evidenceIds).toEqual(["f1", "f2"]);
  });

  it("clamps importance and satisfaction to 1-5", () => {
    const raw = JSON.stringify([
      {
        statement: "When I..., I want to..., so I can...",
        job_type: "RELATED",
        importance: 10,
        satisfaction: -1,
        evidence_ids: [],
      },
    ]);
    const results = parseJTBDResponse(raw);
    expect(results[0].importance).toBe(5);
    expect(results[0].satisfaction).toBe(1);
  });

  it("defaults unknown job type to RELATED", () => {
    const raw = JSON.stringify([
      {
        statement: "stmt",
        job_type: "UNKNOWN",
        importance: 3,
        satisfaction: 3,
        evidence_ids: [],
      },
    ]);
    const results = parseJTBDResponse(raw);
    expect(results[0].jobType).toBe("RELATED");
  });

  it("filters out entries with missing required fields", () => {
    const raw = JSON.stringify([
      { statement: "stmt" }, // missing job_type, importance, satisfaction
    ]);
    const results = parseJTBDResponse(raw);
    expect(results).toHaveLength(0);
  });

  it("handles markdown-fenced JSON", () => {
    const raw =
      "```json\n" +
      JSON.stringify([
        {
          statement: "When I..., I want to..., so I can...",
          job_type: "EMOTIONAL",
          importance: 4,
          satisfaction: 3,
          evidence_ids: ["f1"],
        },
      ]) +
      "\n```";
    const results = parseJTBDResponse(raw);
    expect(results).toHaveLength(1);
    expect(results[0].jobType).toBe("EMOTIONAL");
  });

  it("returns empty for invalid JSON", () => {
    expect(parseJTBDResponse("not json")).toEqual([]);
  });

  it("filters non-string evidence IDs", () => {
    const raw = JSON.stringify([
      {
        statement: "s",
        job_type: "MAIN",
        importance: 3,
        satisfaction: 3,
        evidence_ids: ["f1", 123, null, "f2"],
      },
    ]);
    const results = parseJTBDResponse(raw);
    expect(results[0].evidenceIds).toEqual(["f1", "f2"]);
  });
});
