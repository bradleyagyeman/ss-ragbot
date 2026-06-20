import { describe, expect, it } from "vitest";

import { normalizeEntityText } from "../src/core/entity-normalize.js";
import { getEntityMentionTerms, parseWikiEntity } from "../src/core/wiki-entities.js";

describe("parseWikiEntity", () => {
  it("extracts canonical name, first appearance, and aliases from wiki wikitext", () => {
    const parsed = parseWikiEntity(
      `
{{ShadowSlave infobox
  | name=Cassie<ref>Chapter 12 A Lonely Seer</ref>
  | alias=
*Cassy {{c|Translation variant}}
*Cassia
  | novel=Chapter 11 First Meeting
  | true_name3=Song of the Fallen
}}
      `,
      "Cassie",
    );

    expect(parsed).toEqual({
      canonicalName: "Cassie",
      firstAppearanceChapter: 11,
      firstAppearanceLabel: "First Meeting",
      trueNames: ["Song of the Fallen"],
      wikiAliases: ["Cassy", "Cassia"],
    });
  });
});

describe("normalizeEntityText", () => {
  it("normalizes punctuation and leading articles", () => {
    expect(normalizeEntityText(" The Silver-Haired Girl! ")).toBe("silver haired girl");
  });
});

describe("getEntityMentionTerms", () => {
  it("omits descriptor-only terms from exact mention searches", () => {
    expect(
      getEntityMentionTerms({
        id: 1,
        canonicalName: "Nephis",
        wikiPageTitle: "Nephis",
        wikiSourceUrl: "https://shadowslave.fandom.com/wiki/Nephis",
        firstAppearanceChapter: 19,
        firstAppearanceLabel: "Chapter 19 Crossing the Bridge",
        matchedText: "silver-haired girl",
        matchedKind: "manual_descriptor",
        terms: [
          { text: "Nephis", kind: "canonical" },
          { text: "Neph", kind: "wiki_alias" },
          { text: "Changing Star", kind: "wiki_true_name" },
          { text: "Lady", kind: "wiki_alias" },
          { text: "silver-haired girl", kind: "manual_descriptor" },
        ],
      }),
    ).toEqual(["Nephis", "Changing Star"]);
  });
});
