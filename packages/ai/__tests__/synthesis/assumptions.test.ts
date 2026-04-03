import { describe, it, expect } from "vitest";

import {
  buildAssumptionPrompt,
  parseAssumptionResponse,
  type SpecSection,
} from "../../src/synthesis/assumptions.js";

describe("buildAssumptionPrompt", () => {
  it("includes spec title and section content", () => {
    const sections: SpecSection[] = [
      { sectionRef: "Overview", content: "This feature will let users export data." },
      { sectionRef: "Requirements", content: "Must handle 10k concurrent users." },
    ];
    const prompt = buildAssumptionPrompt("Export Feature PRD", sections);
    expect(prompt).toContain("Export Feature PRD");
    expect(prompt).toContain("### Overview");
    expect(prompt).toContain("This feature will let users export data.");
    expect(prompt).toContain("### Requirements");
  });

  it("lists all assumption categories", () => {
    const prompt = buildAssumptionPrompt("Test", [{ sectionRef: "s1", content: "text" }]);
    expect(prompt).toContain("USER_BEHAVIOR");
    expect(prompt).toContain("TECHNICAL");
    expect(prompt).toContain("MARKET");
    expect(prompt).toContain("ADOPTION");
    expect(prompt).toContain("RESOURCE");
    expect(prompt).toContain("REGULATORY");
  });

  it("instructs to return JSON array", () => {
    const prompt = buildAssumptionPrompt("Test", [{ sectionRef: "s1", content: "text" }]);
    expect(prompt).toContain("JSON array");
  });
});

describe("parseAssumptionResponse", () => {
  it("parses valid JSON response", () => {
    const raw = JSON.stringify([
      {
        section_ref: "Overview",
        quote_text: "Users will discover this organically",
        assumption: "Users will find the feature without guidance",
        category: "USER_BEHAVIOR",
        risk_level: "HIGH",
        suggestion: "Run a usability test with 5 users",
      },
    ]);
    const result = parseAssumptionResponse(raw, "spec-1");
    expect(result).toHaveLength(1);
    expect(result[0].specId).toBe("spec-1");
    expect(result[0].sectionRef).toBe("Overview");
    expect(result[0].assumption).toBe("Users will find the feature without guidance");
    expect(result[0].category).toBe("USER_BEHAVIOR");
    expect(result[0].riskLevel).toBe("HIGH");
    expect(result[0].suggestion).toBe("Run a usability test with 5 users");
  });

  it("handles markdown-fenced JSON", () => {
    const raw =
      "```json\n" +
      JSON.stringify([
        {
          section_ref: null,
          quote_text: "Quote",
          assumption: "An assumption",
          category: "TECHNICAL",
          risk_level: "MEDIUM",
          suggestion: null,
        },
      ]) +
      "\n```";
    const result = parseAssumptionResponse(raw, "spec-1");
    expect(result).toHaveLength(1);
    expect(result[0].sectionRef).toBeNull();
    expect(result[0].suggestion).toBeNull();
  });

  it("defaults unknown category to TECHNICAL", () => {
    const raw = JSON.stringify([
      {
        section_ref: "s1",
        quote_text: "Quote",
        assumption: "Assumption",
        category: "UNKNOWN_CATEGORY",
        risk_level: "HIGH",
        suggestion: null,
      },
    ]);
    const result = parseAssumptionResponse(raw, "spec-1");
    expect(result[0].category).toBe("TECHNICAL");
  });

  it("defaults unknown risk level to MEDIUM", () => {
    const raw = JSON.stringify([
      {
        section_ref: "s1",
        quote_text: "Quote",
        assumption: "Assumption",
        category: "MARKET",
        risk_level: "EXTREME",
        suggestion: null,
      },
    ]);
    const result = parseAssumptionResponse(raw, "spec-1");
    expect(result[0].riskLevel).toBe("MEDIUM");
  });

  it("filters out entries with missing required fields", () => {
    const raw = JSON.stringify([
      { section_ref: "s1", quote_text: "Quote" }, // missing assumption, category, risk_level
      {
        section_ref: "s1",
        quote_text: 123,
        assumption: "A",
        category: "TECHNICAL",
        risk_level: "LOW",
      }, // quote_text not string
    ]);
    const result = parseAssumptionResponse(raw, "spec-1");
    expect(result).toHaveLength(0);
  });

  it("returns empty array for invalid JSON", () => {
    const result = parseAssumptionResponse("not json", "spec-1");
    expect(result).toEqual([]);
  });

  it("returns empty array for empty array response", () => {
    const result = parseAssumptionResponse("[]", "spec-1");
    expect(result).toEqual([]);
  });

  it("handles null section_ref (converts to null)", () => {
    const raw = JSON.stringify([
      {
        quote_text: "Quote",
        assumption: "Assumption",
        category: "ADOPTION",
        risk_level: "LOW",
        suggestion: "Test it",
      },
    ]);
    const result = parseAssumptionResponse(raw, "spec-1");
    expect(result[0].sectionRef).toBeNull();
  });

  it("handles null suggestion (converts to null)", () => {
    const raw = JSON.stringify([
      {
        section_ref: "s1",
        quote_text: "Quote",
        assumption: "Assumption",
        category: "RESOURCE",
        risk_level: "CRITICAL",
      },
    ]);
    const result = parseAssumptionResponse(raw, "spec-1");
    expect(result[0].suggestion).toBeNull();
  });

  it("validates all valid categories", () => {
    const categories = [
      "USER_BEHAVIOR",
      "TECHNICAL",
      "MARKET",
      "ADOPTION",
      "RESOURCE",
      "REGULATORY",
    ];
    for (const category of categories) {
      const raw = JSON.stringify([
        {
          section_ref: "s1",
          quote_text: "Q",
          assumption: "A",
          category,
          risk_level: "LOW",
          suggestion: null,
        },
      ]);
      const result = parseAssumptionResponse(raw, "spec-1");
      expect(result[0].category).toBe(category);
    }
  });

  it("validates all valid risk levels", () => {
    const levels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    for (const level of levels) {
      const raw = JSON.stringify([
        {
          section_ref: "s1",
          quote_text: "Q",
          assumption: "A",
          category: "TECHNICAL",
          risk_level: level,
          suggestion: null,
        },
      ]);
      const result = parseAssumptionResponse(raw, "spec-1");
      expect(result[0].riskLevel).toBe(level);
    }
  });
});
