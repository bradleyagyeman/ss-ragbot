import { describe, expect, it } from "vitest";

import { formatHuman, formatPlain } from "../src/interfaces/output.js";
import type { AskResult, SearchResult } from "../src/types/index.js";

describe("output formatting", () => {
  it("prints the applied spoiler boundary in human ask output", () => {
    const payload: AskResult = {
      question: "Who is Mordret?",
      answer: "Mordret is a prince of nothing.",
      citations: [
        {
          chapterNumber: 520,
          title: "A Prince of Nothing",
          sourceUrl: "https://readshadowslave.com/chapter/520",
        },
      ],
      chunks: [],
      model: "gemini-2.5-flash",
      appliedSpoilerBoundary: {
        input: "before second nightmare",
        id: "before-second-nightmare",
        label: "Before Second Nightmare",
        chapterTo: 600,
      },
    };

    const output = formatHuman(payload);
    expect(output).toContain("Spoiler Safe: Before Second Nightmare (through Chapter 600)");
  });

  it("prints the applied spoiler boundary in plain search output", () => {
    const payload: SearchResult = {
      query: "Mordret",
      results: [],
      appliedSpoilerBoundary: {
        input: "volume 2",
        id: "volume-2",
        label: "Volume 2: Demon of Change",
        chapterTo: 350,
      },
    };

    const output = formatPlain(payload);
    expect(output).toContain("spoiler_safe\tvolume-2\tVolume 2: Demon of Change\t350");
  });
});
