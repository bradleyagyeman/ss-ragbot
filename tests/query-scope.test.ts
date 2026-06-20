import { describe, expect, it } from "vitest";

import { resolveQueryScope } from "../src/core/query-scope.js";

describe("resolveQueryScope", () => {
  it("applies spoiler-safe chapter caps to inferred query filters", () => {
    expect(resolveQueryScope("Summarize chapters 10-800", {}, "before second nightmare")).toEqual({
      filters: {
        chapterFrom: 10,
        chapterTo: 600,
      },
      appliedSpoilerBoundary: {
        input: "before second nightmare",
        id: "before-second-nightmare",
        label: "Before Second Nightmare",
        chapterTo: 600,
        kind: "named",
      },
      emptyResultMessage: "Not enough spoiler-safe evidence was found within Before Second Nightmare.",
    });
  });

  it("intersects explicit chapter filters with spoiler-safe boundaries", () => {
    expect(
      resolveQueryScope(
        "Who is Mordret?",
        {
          chapterFrom: 500,
          chapterTo: 900,
        },
        "volume 2",
      ),
    ).toEqual({
      filters: {
        chapterFrom: 500,
        chapterTo: 350,
      },
      appliedSpoilerBoundary: {
        input: "volume 2",
        id: "volume-2",
        label: "Volume 2: Demon of Change",
        chapterTo: 350,
        kind: "named",
      },
      emptyResultMessage: "Not enough spoiler-safe evidence was found within Volume 2: Demon of Change.",
    });
  });

  it("treats slug and article variants like their phrase aliases", () => {
    expect(resolveQueryScope("Who is Mordret?", {}, "before-second-nightmare")).toEqual({
      filters: {
        chapterTo: 600,
      },
      appliedSpoilerBoundary: {
        input: "before-second-nightmare",
        id: "before-second-nightmare",
        label: "Before Second Nightmare",
        chapterTo: 600,
        kind: "named",
      },
      emptyResultMessage: "Not enough spoiler-safe evidence was found within Before Second Nightmare.",
    });

    expect(resolveQueryScope("Who is Mordret?", {}, "the second nightmare")).toEqual({
      filters: {
        chapterTo: 742,
      },
      appliedSpoilerBoundary: {
        input: "the second nightmare",
        id: "second-nightmare",
        label: "Second Nightmare",
        chapterTo: 742,
        kind: "named",
      },
      emptyResultMessage: "Not enough spoiler-safe evidence was found within Second Nightmare.",
    });
  });

  it("applies chapter-based spoiler-safe boundaries and intersects explicit chapter caps", () => {
    expect(resolveQueryScope("Who is Mordret?", {}, "before chapter 1729")).toEqual({
      filters: {
        chapterTo: 1728,
      },
      appliedSpoilerBoundary: {
        input: "before chapter 1729",
        id: "before-chapter-1729",
        label: "Before Chapter 1729",
        chapterTo: 1728,
        kind: "chapter",
      },
      emptyResultMessage: "Not enough spoiler-safe evidence was found within Before Chapter 1729.",
    });

    expect(resolveQueryScope("Who is Mordret?", { chapterTo: 900 }, "through-chapter-1729")).toEqual({
      filters: {
        chapterTo: 900,
      },
      appliedSpoilerBoundary: {
        input: "through-chapter-1729",
        id: "through-chapter-1729",
        label: "Through Chapter 1729",
        chapterTo: 1729,
        kind: "chapter",
      },
      emptyResultMessage: "Not enough spoiler-safe evidence was found within Through Chapter 1729.",
    });
  });

  it("returns the base filters when spoiler-safe mode is not used", () => {
    expect(resolveQueryScope("What happens in chapter 1?", {})).toEqual({
      filters: {
        chapterFrom: 1,
        chapterTo: 1,
      },
    });
  });
});
