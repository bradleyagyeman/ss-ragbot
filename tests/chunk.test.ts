import { describe, expect, it } from "vitest";

import { chunkText } from "../src/core/chunk.js";

describe("chunkText", () => {
  it("splits long text into deterministic overlapping chunks", () => {
    const text = "alpha ".repeat(600);
    const chunks = chunkText(text, {
      sizeChars: 200,
      overlapChars: 40,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[1].chunkIndex).toBe(1);
    expect(chunks[0].chunkText.length).toBeLessThanOrEqual(200);
  });
});
