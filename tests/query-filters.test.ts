import { describe, expect, it } from "vitest";

import { resolveQueryFilters } from "../src/core/query-filters.js";

describe("resolveQueryFilters", () => {
  it("infers a single chapter filter from direct chapter references", () => {
    expect(resolveQueryFilters("What happens in chapter 1?", {})).toEqual({
      chapterFrom: 1,
      chapterTo: 1,
    });
  });

  it("infers chapter ranges when no explicit flags are provided", () => {
    expect(resolveQueryFilters("Summarize chapters 10-12", {})).toEqual({
      chapterFrom: 10,
      chapterTo: 12,
    });
  });

  it("respects explicit CLI filters over inferred ones", () => {
    expect(
      resolveQueryFilters("What happens in chapter 1?", {
        chapterFrom: 20,
        chapterTo: 30,
      }),
    ).toEqual({
      chapterFrom: 20,
      chapterTo: 30,
    });
  });
});
