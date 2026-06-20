import { describe, expect, it } from "vitest";

import { buildAnswerPrompt } from "../src/core/prompt.js";

describe("buildAnswerPrompt", () => {
  it("includes canon guardrails and chunk evidence", () => {
    const prompt = buildAnswerPrompt("Who is Mordret?", [
      {
        chapterId: 1,
        chapterNumber: 100,
        chapterTitle: "A Prince",
        sourceUrl: "https://example.com/chapter/100",
        chunkId: 1,
        chunkIndex: 0,
        chunkText: "Mordret is discussed here.",
        charCount: 25,
        distance: 0.1,
      },
    ]);

    expect(prompt).toContain("Use only the supplied evidence.");
    expect(prompt).toContain("Do not include inline chapter numbers or source URLs in the prose answer");
    expect(prompt).toContain("Chapter 100: A Prince");
    expect(prompt).toContain("Who is Mordret?");
  });
});
