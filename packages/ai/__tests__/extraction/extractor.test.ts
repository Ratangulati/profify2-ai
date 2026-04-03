import { describe, it, expect } from "vitest";

import { parseJsonArray } from "../../src/extraction/extractor.js";

describe("parseJsonArray", () => {
  it("parses a valid JSON array", () => {
    const result = parseJsonArray<{ title: string }>('[{"title":"Bug"}]');
    expect(result).toEqual([{ title: "Bug" }]);
  });

  it("strips markdown code fences", () => {
    const result = parseJsonArray<{ title: string }>('```json\n[{"title":"Slow load"}]\n```');
    expect(result).toEqual([{ title: "Slow load" }]);
  });

  it("strips code fences without language hint", () => {
    const result = parseJsonArray<{ title: string }>('```\n[{"title":"Test"}]\n```');
    expect(result).toEqual([{ title: "Test" }]);
  });

  it("returns empty array for non-array JSON", () => {
    const result = parseJsonArray<unknown>('{"title":"Bug"}');
    expect(result).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    const result = parseJsonArray<unknown>("not json at all");
    expect(result).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    const result = parseJsonArray<unknown>("");
    expect(result).toEqual([]);
  });

  it("handles whitespace and newlines around JSON", () => {
    const result = parseJsonArray<{ x: number }>('  \n  [{"x": 1}, {"x": 2}]  \n  ');
    expect(result).toEqual([{ x: 1 }, { x: 2 }]);
  });
});
