import { describe, expect, it } from "vitest";

import {
  parseAliasEquivalenceIntent,
  parseDirectEntityIntent,
  parseFirstAppearanceIntent,
  parseFirstNamedMentionIntent,
  parseRelationshipIntent,
  parseTrueNameIntent,
} from "../src/core/query-intents.js";

describe("parseFirstAppearanceIntent", () => {
  it("detects first introduced questions", () => {
    expect(parseFirstAppearanceIntent("When was Nephis first introduced?")).toEqual({
      kind: "first_appearance",
      entity: "Nephis",
    });
  });

  it("detects first appear questions", () => {
    expect(parseFirstAppearanceIntent("When did Mordret first appear?")).toEqual({
      kind: "first_appearance",
      entity: "Mordret",
    });
  });

  it("detects chapter phrasing and strips a leading article", () => {
    expect(parseFirstAppearanceIntent("What chapter was the Nameless Temple first introduced in?")).toEqual({
      kind: "first_appearance",
      entity: "Nameless Temple",
    });
  });

  it("detects combined identity and introduction questions", () => {
    expect(parseFirstAppearanceIntent("Who is Song of the Fallen and when was she introduced?")).toEqual({
      kind: "first_appearance",
      entity: "Song of the Fallen",
    });
  });
});

describe("parseFirstNamedMentionIntent", () => {
  it("detects first mentioned questions", () => {
    expect(parseFirstNamedMentionIntent("When was Cassie first mentioned?")).toEqual({
      kind: "first_named_mention",
      entity: "Cassie",
    });
  });

  it("returns undefined for introduction questions", () => {
    expect(parseFirstNamedMentionIntent("When was Nephis first introduced?")).toBeUndefined();
  });
});

describe("parseDirectEntityIntent", () => {
  it("detects direct entity questions", () => {
    expect(parseDirectEntityIntent("Who is Mordret?")).toEqual({
      kind: "direct_entity",
      entity: "Mordret",
    });
  });

  it("still detects bare what-is entity lookups", () => {
    expect(parseDirectEntityIntent("What is Changing Star?")).toEqual({
      kind: "direct_entity",
      entity: "Changing Star",
    });
  });

  it("returns undefined for non-entity questions", () => {
    expect(parseDirectEntityIntent("When was Nephis first introduced?")).toBeUndefined();
    expect(parseDirectEntityIntent("What is the name of Effie's son?")).toBeUndefined();
  });
});

describe("parseAliasEquivalenceIntent", () => {
  it("detects are X and Y the same person questions", () => {
    expect(parseAliasEquivalenceIntent("Are Sunny and Sunless the same person?")).toEqual({
      kind: "alias_equivalence",
      left: "Sunny",
      right: "Sunless",
    });
  });

  it("detects is X the same person as Y questions", () => {
    expect(parseAliasEquivalenceIntent("Is Cassie the same person as Cassia?")).toEqual({
      kind: "alias_equivalence",
      left: "Cassie",
      right: "Cassia",
    });
  });

  it("detects is X actually Y questions", () => {
    expect(parseAliasEquivalenceIntent("Is Changing Star actually Nephis?")).toEqual({
      kind: "alias_equivalence",
      left: "Changing Star",
      right: "Nephis",
    });
  });
});

describe("parseTrueNameIntent", () => {
  it("detects true-name questions", () => {
    expect(parseTrueNameIntent("What is Sunny's True Name?")).toEqual({
      kind: "true_name",
      entity: "Sunny",
    });
    expect(parseTrueNameIntent("What is the True Name of Nephis?")).toEqual({
      kind: "true_name",
      entity: "Nephis",
    });
  });
});

describe("parseRelationshipIntent", () => {
  it("detects relationship-between questions", () => {
    expect(parseRelationshipIntent("What is the relationship between Sunny and Rain?")).toEqual({
      kind: "relationship",
      left: "Sunny",
      right: "Rain",
    });
  });

  it("detects relationship-to questions", () => {
    expect(parseRelationshipIntent("What is Mordret's relationship to Valor?")).toEqual({
      kind: "relationship",
      left: "Mordret",
      right: "Valor",
    });
  });
});
