import { describe, expect, it } from "vitest";

import {
  SpoilerBoundaryError,
  listSpoilerBoundarySuggestions,
  normalizeSpoilerBoundary,
  resolveSpoilerBoundary,
} from "../src/core/spoiler-boundaries.js";

describe("resolveSpoilerBoundary", () => {
  it("resolves named story boundaries through aliases", () => {
    expect(resolveSpoilerBoundary("before second nightmare")).toEqual({
      input: "before second nightmare",
      id: "before-second-nightmare",
      label: "Before Second Nightmare",
      chapterTo: 600,
      kind: "named",
    });
  });

  it("resolves slug aliases for spoiler boundaries", () => {
    expect(resolveSpoilerBoundary("before-second-nightmare")).toEqual({
      input: "before-second-nightmare",
      id: "before-second-nightmare",
      label: "Before Second Nightmare",
      chapterTo: 600,
      kind: "named",
    });
  });

  it("resolves article variants and slug volume aliases", () => {
    expect(resolveSpoilerBoundary("before the second nightmare")).toEqual({
      input: "before the second nightmare",
      id: "before-second-nightmare",
      label: "Before Second Nightmare",
      chapterTo: 600,
      kind: "named",
    });
    expect(resolveSpoilerBoundary("volume-1")).toEqual({
      input: "volume-1",
      id: "volume-1",
      label: "Volume 1: Child of Shadows",
      chapterTo: 95,
      kind: "named",
    });
    expect(resolveSpoilerBoundary("forgotten-shore")).toEqual({
      input: "forgotten-shore",
      id: "forgotten-shore",
      label: "Forgotten Shore",
      chapterTo: 350,
      kind: "named",
    });
  });

  it("distinguishes between before and through nightmare boundaries", () => {
    expect(resolveSpoilerBoundary("through third nightmare")).toEqual({
      input: "through third nightmare",
      id: "third-nightmare",
      label: "Third Nightmare",
      chapterTo: 1580,
      kind: "named",
    });
  });

  it("resolves chapter-based natural language and slug boundaries", () => {
    expect(resolveSpoilerBoundary("before chapter 1729")).toEqual({
      input: "before chapter 1729",
      id: "before-chapter-1729",
      label: "Before Chapter 1729",
      chapterTo: 1728,
      kind: "chapter",
    });
    expect(resolveSpoilerBoundary("through chapter 500")).toEqual({
      input: "through chapter 500",
      id: "through-chapter-500",
      label: "Through Chapter 500",
      chapterTo: 500,
      kind: "chapter",
    });
    expect(resolveSpoilerBoundary("up to chapter 350")).toEqual({
      input: "up to chapter 350",
      id: "up-to-chapter-350",
      label: "Up to Chapter 350",
      chapterTo: 350,
      kind: "chapter",
    });
    expect(resolveSpoilerBoundary("chapter-95")).toEqual({
      input: "chapter-95",
      id: "chapter-95",
      label: "Through Chapter 95",
      chapterTo: 95,
      kind: "chapter",
    });
  });

  it("normalizes punctuation and casing", () => {
    expect(normalizeSpoilerBoundary(" Before   The SECOND Nightmare! ")).toBe("before the second nightmare");
  });

  it("fails with a helpful error for unknown boundaries", () => {
    expect(() => resolveSpoilerBoundary("before the forgotten desert")).toThrowError(SpoilerBoundaryError);
    expect(listSpoilerBoundarySuggestions()).toContain("before second nightmare");
  });

  it("explains quoting and slug alternatives for split multi-word input", () => {
    expect(() => resolveSpoilerBoundary("before")).toThrowError(
      /Multi-word spoiler boundaries must be quoted[\s\S]*--spoiler-safe "before second nightmare"[\s\S]*--spoiler-safe before-second-nightmare[\s\S]*Chapter-based spoiler boundaries are also supported[\s\S]*--spoiler-safe "before chapter 1729"[\s\S]*--spoiler-safe before-chapter-1729/,
    );
    expect(() => resolveSpoilerBoundary("second")).toThrowError(
      /Multi-word spoiler boundaries must be quoted[\s\S]*--spoiler-safe "second nightmare"[\s\S]*--spoiler-safe second-nightmare/,
    );
  });

  it("explains malformed chapter-based boundaries", () => {
    expect(() => resolveSpoilerBoundary("before chapter nope")).toThrowError(
      /Invalid chapter-based spoiler boundary[\s\S]*before chapter 1729[\s\S]*before-chapter-1729/,
    );
  });
});
