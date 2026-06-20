import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppConfig, ResolvedEntity, RetrievedChunk } from "../src/types/index.js";

const {
  findAliasEquivalenceEvidence,
  findFirstChunkMentionForTerms,
  findChunksByExactMentionTerms,
  getChapterByNumber,
  searchChunks,
  resolveEntityReference,
  hydrateEntityMetadataIfMissing,
  getEntityMentionTerms,
  canUseEntityForEquivalence,
  generate,
  createAnswerProvider,
} = vi.hoisted(() => ({
  ...(function () {
    const generate = vi.fn();

    return {
      findAliasEquivalenceEvidence: vi.fn(),
      findFirstChunkMentionForTerms: vi.fn(),
      findChunksByExactMentionTerms: vi.fn(),
      getChapterByNumber: vi.fn(),
      searchChunks: vi.fn(),
      resolveEntityReference: vi.fn(),
      hydrateEntityMetadataIfMissing: vi.fn(),
      getEntityMentionTerms: vi.fn(),
      canUseEntityForEquivalence: vi.fn(),
      generate,
      createAnswerProvider: vi.fn(() => ({ generate })),
    };
  })(),
}));

vi.mock("../src/db/connection.js", () => ({
  getPool: vi.fn(() => ({ fake: true })),
}));

vi.mock("../src/db/queries.js", async () => {
  const actual = await vi.importActual<typeof import("../src/db/queries.js")>(
    "../src/db/queries.js",
  );

  return {
    ...actual,
    findAliasEquivalenceEvidence,
    findFirstChunkMentionForTerms,
    findChunksByExactMentionTerms,
    getChapterByNumber,
  };
});

vi.mock("../src/core/retrieve.js", () => ({
  searchChunks,
}));

vi.mock("../src/providers/llm.js", () => ({
  createAnswerProvider,
}));

vi.mock("../src/core/wiki-entities.js", () => ({
  resolveEntityReference,
  hydrateEntityMetadataIfMissing,
  getEntityMentionTerms,
  canUseEntityForEquivalence,
}));

import { answerQuestion } from "../src/core/answer.js";
import { buildWholePhrasePattern } from "../src/db/queries.js";

const config: AppConfig = {
  dbUrl: "postgres://app:pw@localhost:5432/ss_ragbot",
  migratorDbUrl: "postgres://migrator:pw@localhost:5432/ss_ragbot",
  answer: {
    provider: "google",
    model: "gemini-2.5-flash",
    googleApiKey: "test-key",
  },
  embedding: {
    provider: "local",
    model: "Xenova/bge-small-en-v1.5",
    cacheDir: "/tmp",
  },
  source: {
    baseUrl: "https://readshadowslave.com",
    indexUrl: "https://readshadowslave.com/chapters",
    requestTimeoutMs: 30_000,
  },
  chunking: {
    sizeChars: 1400,
    overlapChars: 200,
  },
  retrieval: {
    limit: 5,
  },
  wiki: {
    apiUrl: "https://shadowslave.fandom.com/api.php",
  },
  logLevel: "info",
  configPaths: {
    project: ".env",
    user: "~/.config/ss-ragbot.env",
    system: "/etc/ss-ragbot.env",
    explicit: undefined,
  },
};

const firstMentionChunk: RetrievedChunk = {
  chapterId: 24,
  chapterNumber: 24,
  chapterTitle: "Moving Up in the World",
  sourceUrl: "https://readshadowslave.com/chapter/24",
  chunkId: 2401,
  chunkIndex: 0,
  chunkText: "Nephis stepped forward...",
  charCount: 1200,
  distance: 0,
};

const nephisEntity: ResolvedEntity = {
  id: 1,
  canonicalName: "Nephis",
  wikiPageTitle: "Nephis",
  wikiSourceUrl: "https://shadowslave.fandom.com/wiki/Nephis",
  firstAppearanceChapter: 19,
  firstAppearanceLabel: "Chapter 19 Crossing the Bridge",
  matchedText: "Nephis",
  matchedKind: "canonical",
  terms: [
    { text: "Nephis", kind: "canonical" },
    { text: "Neph", kind: "wiki_alias" },
    { text: "Changing Star", kind: "wiki_true_name" },
  ],
};

describe("answerQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAliasEquivalenceEvidence.mockReset();
    findFirstChunkMentionForTerms.mockReset();
    findChunksByExactMentionTerms.mockReset();
    getChapterByNumber.mockReset();
    searchChunks.mockReset();
    resolveEntityReference.mockReset();
    hydrateEntityMetadataIfMissing.mockReset();
    getEntityMentionTerms.mockReset();
    canUseEntityForEquivalence.mockReset();
    generate.mockReset();
    createAnswerProvider.mockReset();
    createAnswerProvider.mockReturnValue({ generate });
    canUseEntityForEquivalence.mockReturnValue(true);
    resolveEntityReference.mockResolvedValue(undefined);
    hydrateEntityMetadataIfMissing.mockResolvedValue(undefined);
  });

  it("answers alias-equivalence questions deterministically with ranked citations", async () => {
    resolveEntityReference
      .mockResolvedValueOnce({
        ...nephisEntity,
        id: 9,
        canonicalName: "Sunny",
        matchedText: "Sunny",
        matchedKind: "canonical",
      })
      .mockResolvedValueOnce({
        ...nephisEntity,
        id: 9,
        canonicalName: "Sunny",
        matchedText: "Sunless",
        matchedKind: "manual_alias",
      });
    findAliasEquivalenceEvidence.mockResolvedValue([
      {
        ...firstMentionChunk,
        chapterId: 36,
        chapterNumber: 36,
        chapterTitle: "Bonfire",
        sourceUrl: "https://readshadowslave.com/chapter/36",
        chunkId: 3601,
        chunkText: "I'm Sunless. But you can call me Sunny.",
        hasLeftTerm: true,
        hasRightTerm: true,
        hasCanonicalTerm: true,
        hasIdentityPhrase: true,
        evidenceScore: 200,
      },
      {
        ...firstMentionChunk,
        chapterId: 2,
        chapterNumber: 2,
        chapterTitle: "Slave Caravan",
        sourceUrl: "https://readshadowslave.com/chapter/2",
        chunkId: 201,
        chunkText: "Name: Sunless",
        hasLeftTerm: false,
        hasRightTerm: true,
        hasCanonicalTerm: false,
        hasIdentityPhrase: false,
        evidenceScore: 8,
      },
    ]);

    const result = await answerQuestion(
      config,
      "Are Sunny and Sunless the same person?",
      8,
      {},
    );

    expect(result.answer).toContain("Yes. Sunny and Sunless are the same person.");
    expect(result.answer).not.toContain("local entity metadata");
    expect(result.answer).toContain('The clearest supporting evidence appears in Chapter 36, "Bonfire", where the text directly links both names.');
    expect(result.citations).toEqual([
      {
        chapterNumber: 36,
        title: "Bonfire",
        sourceUrl: "https://readshadowslave.com/chapter/36",
      },
      {
        chapterNumber: 2,
        title: "Slave Caravan",
        sourceUrl: "https://readshadowslave.com/chapter/2",
      },
    ]);
    expect(createAnswerProvider).not.toHaveBeenCalled();
  });

  it("refuses unresolved alias-equivalence questions instead of falling through to RAG", async () => {
    resolveEntityReference
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        ...nephisEntity,
        id: 9,
        canonicalName: "Sunny",
        matchedText: "Sunless",
        matchedKind: "manual_alias",
      });

    const result = await answerQuestion(
      config,
      "Are Sunny and Sunless the same person?",
      8,
      {},
    );

    expect(result.answer).toBe("Not enough entity metadata was found to determine whether Sunny and Sunless are the same person.");
    expect(searchChunks).not.toHaveBeenCalled();
  });

  it("uses spoiler-safe refusal when alias-equivalence evidence is out of scope", async () => {
    resolveEntityReference
      .mockResolvedValueOnce({
        ...nephisEntity,
        id: 9,
        canonicalName: "Sunny",
        matchedText: "Sunny",
        matchedKind: "canonical",
      })
      .mockResolvedValueOnce({
        ...nephisEntity,
        id: 9,
        canonicalName: "Sunny",
        matchedText: "Sunless",
        matchedKind: "manual_alias",
      });
    findAliasEquivalenceEvidence.mockResolvedValue([]);

    const result = await answerQuestion(
      config,
      "Are Sunny and Sunless the same person?",
      8,
      { chapterTo: 10 },
      false,
      "Not enough spoiler-safe evidence was found within Volume 1: Child of Shadows.",
      true,
    );

    expect(result.answer).toBe("Not enough spoiler-safe evidence was found within Volume 1: Child of Shadows.");
  });

  it("answers no when the two surface forms resolve to different entities", async () => {
    resolveEntityReference
      .mockResolvedValueOnce({
        ...nephisEntity,
        id: 7,
        canonicalName: "Nephis",
        matchedText: "Changing Star",
        matchedKind: "wiki_true_name",
      })
      .mockResolvedValueOnce({
        ...nephisEntity,
        id: 8,
        canonicalName: "Cassie",
        matchedText: "Cassia",
        matchedKind: "manual_alias",
      });
    findChunksByExactMentionTerms
      .mockResolvedValueOnce([{
        ...firstMentionChunk,
        chapterId: 19,
        chapterNumber: 19,
        chapterTitle: "Crossing the Bridge",
        sourceUrl: "https://readshadowslave.com/chapter/19",
        chunkId: 1901,
      }])
      .mockResolvedValueOnce([{
        ...firstMentionChunk,
        chapterId: 22,
        chapterNumber: 22,
        chapterTitle: "Corpse Corner",
        sourceUrl: "https://readshadowslave.com/chapter/22",
        chunkId: 2201,
      }]);

    const result = await answerQuestion(
      config,
      "Is Changing Star the same person as Cassia?",
      8,
      {},
    );

    expect(result.answer).toBe("No. Changing Star and Cassia are not the same person.");
    expect(result.citations).toEqual([
      {
        chapterNumber: 19,
        title: "Crossing the Bridge",
        sourceUrl: "https://readshadowslave.com/chapter/19",
      },
      {
        chapterNumber: 22,
        title: "Corpse Corner",
        sourceUrl: "https://readshadowslave.com/chapter/22",
      },
    ]);
  });

  it("answers first-appearance questions from wiki metadata and contrasts named mention when needed", async () => {
    resolveEntityReference.mockResolvedValue(nephisEntity);
    getEntityMentionTerms.mockReturnValue(["Nephis", "Neph"]);
    getChapterByNumber.mockResolvedValue({
      chapter_number: 19,
      title: "Crossing the Bridge",
      source_url: "https://readshadowslave.com/chapter/19",
    });
    findFirstChunkMentionForTerms.mockResolvedValue(firstMentionChunk);

    const result = await answerQuestion(
      config,
      "When was Nephis first introduced?",
      5,
      {},
    );

    expect(resolveEntityReference).toHaveBeenCalledWith(config, "Nephis");
    expect(findFirstChunkMentionForTerms).toHaveBeenCalledWith(expect.any(Object), ["Nephis", "Neph"], {});
    expect(result.answer).toContain("According to the Shadow Slave Wiki, Nephis first appears in Chapter 19");
    expect(result.answer).toContain('the earliest named mention is Chapter 24, "Moving Up in the World"');
    expect(result.model).toBe("rule-based:first-appearance");
    expect(result.citations).toEqual([
      {
        chapterNumber: 19,
        title: "Crossing the Bridge",
        sourceUrl: "https://readshadowslave.com/chapter/19",
      },
      {
        chapterNumber: 24,
        title: "Moving Up in the World",
        sourceUrl: "https://readshadowslave.com/chapter/24",
      },
    ]);
  });

  it("answers first named mention questions across resolved aliases", async () => {
    resolveEntityReference.mockResolvedValue({
      ...nephisEntity,
      canonicalName: "Cassie",
      matchedText: "Cassie",
      terms: [
        { text: "Cassie", kind: "canonical" },
        { text: "Cassy", kind: "manual_alias" },
        { text: "Cassia", kind: "manual_alias" },
        { text: "Song of the Fallen", kind: "wiki_true_name" },
      ],
    });
    getEntityMentionTerms.mockReturnValue(["Cassie", "Cassy", "Cassia", "Song of the Fallen"]);
    findFirstChunkMentionForTerms.mockResolvedValue({
      ...firstMentionChunk,
      chapterId: 11,
      chapterNumber: 12,
      chapterTitle: "A Lonely Seer",
      sourceUrl: "https://readshadowslave.com/chapter/12",
      chunkId: 1201,
      chunkText: "Cassy watched him silently.",
    });

    const result = await answerQuestion(
      config,
      "When was Cassie first mentioned?",
      5,
      {},
    );

    expect(findFirstChunkMentionForTerms).toHaveBeenCalledWith(
      expect.any(Object),
      ["Cassie", "Cassy", "Cassia", "Song of the Fallen"],
      {},
    );
    expect(result.answer).toBe('Cassie is first named in Chapter 12, "A Lonely Seer".');
    expect(result.model).toBe("rule-based:first-named-mention");
  });

  it("answers combined true-name and introduction questions from resolved metadata", async () => {
    resolveEntityReference.mockResolvedValue({
      ...nephisEntity,
      canonicalName: "Cassie",
      firstAppearanceChapter: 22,
      matchedText: "Song of the Fallen",
      matchedKind: "wiki_true_name",
      terms: [
        { text: "Cassie", kind: "canonical" },
        { text: "Cassy", kind: "manual_alias" },
        { text: "Cassia", kind: "manual_alias" },
        { text: "Song of the Fallen", kind: "wiki_true_name" },
      ],
    });
    getEntityMentionTerms.mockReturnValue(["Cassie", "Cassy", "Cassia", "Song of the Fallen"]);
    getChapterByNumber.mockResolvedValue({
      chapter_number: 22,
      title: "Corpse Corner",
      source_url: "https://readshadowslave.com/chapter/22",
    });
    findFirstChunkMentionForTerms.mockResolvedValue(firstMentionChunk);

    const result = await answerQuestion(
      config,
      "Who is Song of the Fallen and when was she introduced?",
      5,
      {},
    );

    expect(resolveEntityReference).toHaveBeenCalledWith(config, "Song of the Fallen");
    expect(result.answer).toContain("\"Song of the Fallen\" refers to Cassie.");
    expect(result.answer).toContain("According to the Shadow Slave Wiki, Cassie first appears in Chapter 22");
  });

  it("uses exact entity matches across aliases for direct entity questions", async () => {
    resolveEntityReference.mockResolvedValue({
      ...nephisEntity,
      canonicalName: "Cassie",
      matchedText: "Cassia",
      matchedKind: "manual_alias",
      terms: [
        { text: "Cassie", kind: "canonical" },
        { text: "Cassy", kind: "manual_alias" },
        { text: "Cassia", kind: "manual_alias" },
      ],
    });
    getEntityMentionTerms.mockReturnValue(["Cassie", "Cassy", "Cassia"]);
    findChunksByExactMentionTerms.mockResolvedValue([firstMentionChunk]);
    generate.mockResolvedValue({
      text: "Cassie is a blind oracle.",
      model: "gemini-2.5-flash",
    });

    const result = await answerQuestion(config, "Who is Cassia?", 5, {});

    expect(findChunksByExactMentionTerms).toHaveBeenCalledWith(
      expect.any(Object),
      ["Cassia"],
      5,
      {},
    );
    expect(searchChunks).not.toHaveBeenCalled();
    expect(result.answer).toBe("\"Cassia\" refers to Cassie.");
    expect(createAnswerProvider).not.toHaveBeenCalled();
  });

  it("answers true-name identity questions deterministically", async () => {
    resolveEntityReference.mockResolvedValue({
      ...nephisEntity,
      canonicalName: "Sunny",
      matchedText: "Lost from Light",
      matchedKind: "wiki_true_name",
      terms: [
        { text: "Sunny", kind: "canonical" },
        { text: "Lost from Light", kind: "wiki_true_name" },
      ],
    });
    findChunksByExactMentionTerms.mockResolvedValueOnce([
      {
        ...firstMentionChunk,
        chapterId: 526,
        chapterNumber: 526,
        chapterTitle: "Demon",
        sourceUrl: "https://readshadowslave.com/chapter/526",
        chunkId: 5261,
        chunkText: "His True Name was Lost from Light.",
      },
    ]);

    const result = await answerQuestion(config, "Who is Lost from Light?", 5, {});

    expect(result.answer).toBe("\"Lost from Light\" is Sunny's True Name.");
    expect(result.citations).toEqual([
      {
        chapterNumber: 526,
        title: "Demon",
        sourceUrl: "https://readshadowslave.com/chapter/526",
      },
    ]);
    expect(createAnswerProvider).not.toHaveBeenCalled();
  });

  it("keeps metadata identity citations in earliest exact fact order", async () => {
    resolveEntityReference.mockResolvedValue({
      ...nephisEntity,
      canonicalName: "Effie",
      matchedText: "Raised by Wolves",
      matchedKind: "wiki_true_name",
      terms: [
        { text: "Effie", kind: "canonical" },
        { text: "Raised by Wolves", kind: "wiki_true_name" },
      ],
    });
    findChunksByExactMentionTerms.mockResolvedValueOnce([
      {
        ...firstMentionChunk,
        chapterId: 1546,
        chapterNumber: 1546,
        chapterTitle: "Raised by Wolves",
        sourceUrl: "https://readshadowslave.com/chapter/1546",
        chunkId: 15461,
        chunkText: "Raised by Wolves.",
      },
      {
        ...firstMentionChunk,
        chapterId: 2227,
        chapterNumber: 2227,
        chapterTitle: "The Dragon and the Princess",
        sourceUrl: "https://readshadowslave.com/chapter/2227",
        chunkId: 22271,
        chunkText: 'Effie, known as Raised by Wolves, laughed.',
      },
      {
        ...firstMentionChunk,
        chapterId: 2517,
        chapterNumber: 2517,
        chapterTitle: "Trust",
        sourceUrl: "https://readshadowslave.com/chapter/2517",
        chunkId: 25171,
        chunkText: 'Effie said her True Name was "Raised by Wolves".',
      },
    ]);

    const result = await answerQuestion(config, "Who is Raised by Wolves?", 5, {});

    expect(result.answer).toBe("\"Raised by Wolves\" is Effie's True Name.");
    expect(result.citations).toEqual([
      {
        chapterNumber: 1546,
        title: "Raised by Wolves",
        sourceUrl: "https://readshadowslave.com/chapter/1546",
      },
      {
        chapterNumber: 2227,
        title: "The Dragon and the Princess",
        sourceUrl: "https://readshadowslave.com/chapter/2227",
      },
      {
        chapterNumber: 2517,
        title: "Trust",
        sourceUrl: "https://readshadowslave.com/chapter/2517",
      },
    ]);
    expect(createAnswerProvider).not.toHaveBeenCalled();
  });

  it("hydrates missing identity metadata once before refusing", async () => {
    resolveEntityReference
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        ...nephisEntity,
        canonicalName: "Effie",
        matchedText: "Raised by Wolves",
        matchedKind: "wiki_true_name",
        terms: [
          { text: "Effie", kind: "canonical" },
          { text: "Raised by Wolves", kind: "wiki_true_name" },
        ],
      });
    hydrateEntityMetadataIfMissing.mockResolvedValue({
      ...nephisEntity,
      canonicalName: "Effie",
      matchedText: "Raised by Wolves",
      matchedKind: "wiki_true_name",
      terms: [
        { text: "Effie", kind: "canonical" },
        { text: "Raised by Wolves", kind: "wiki_true_name" },
      ],
    });
    findChunksByExactMentionTerms.mockResolvedValueOnce([firstMentionChunk]);

    const result = await answerQuestion(config, "Who is Raised by Wolves?", 5, {});

    expect(hydrateEntityMetadataIfMissing).toHaveBeenCalledWith(config, "Raised by Wolves");
    expect(result.answer).toBe("\"Raised by Wolves\" is Effie's True Name.");
  });

  it("refuses unresolved identity questions instead of falling through to generic RAG", async () => {
    resolveEntityReference.mockResolvedValue(undefined);
    hydrateEntityMetadataIfMissing.mockResolvedValue(undefined);

    const result = await answerQuestion(config, "Who is Raised from Wolves?", 5, {});

    expect(result.answer).toBe('Structured entity metadata for "Raised from Wolves" is not available locally, and the wiki source could not be refreshed.');
    expect(searchChunks).not.toHaveBeenCalled();
    expect(createAnswerProvider).not.toHaveBeenCalled();
  });

  it("answers true-name lookup questions deterministically", async () => {
    resolveEntityReference.mockResolvedValue({
      ...nephisEntity,
      canonicalName: "Sunny",
      matchedText: "Sunny",
      matchedKind: "canonical",
      terms: [
        { text: "Sunny", kind: "canonical" },
        { text: "Lost from Light", kind: "wiki_true_name" },
      ],
    });
    findChunksByExactMentionTerms.mockResolvedValueOnce([
      {
        ...firstMentionChunk,
        chapterId: 15,
        chapterNumber: 15,
        chapterTitle: "Shadow Slave",
        sourceUrl: "https://readshadowslave.com/chapter/15",
        chunkId: 151,
        chunkText: "His True Name was Lost from Light.",
      },
    ]);

    const result = await answerQuestion(config, "What is Sunny's True Name?", 5, {});

    expect(result.answer).toBe("Sunny's True Name is \"Lost from Light\".");
    expect(result.citations).toEqual([
      {
        chapterNumber: 15,
        title: "Shadow Slave",
        sourceUrl: "https://readshadowslave.com/chapter/15",
      },
    ]);
    expect(createAnswerProvider).not.toHaveBeenCalled();
  });

  it("answers structured relationship questions deterministically", async () => {
    resolveEntityReference
      .mockResolvedValueOnce({
        ...nephisEntity,
        canonicalName: "Sunny",
        matchedText: "Sunny",
        matchedKind: "canonical",
      })
      .mockResolvedValueOnce(undefined);
    searchChunks.mockResolvedValue([firstMentionChunk]);

    const result = await answerQuestion(
      config,
      "What is the relationship between Sunny and Rain?",
      5,
      {},
    );

    expect(result.answer).toContain("Sunny and Rain are siblings");
    expect(result.answer).toContain("Rain is Sunny's younger sister");
    expect(createAnswerProvider).not.toHaveBeenCalled();
  });

  it("does not force relational what-is questions through direct entity matching", async () => {
    searchChunks.mockResolvedValue([firstMentionChunk]);
    generate.mockResolvedValue({
      text: "Effie's son is named Little Ling.",
      model: "gemini-2.5-flash",
    });

    const result = await answerQuestion(
      config,
      "What is the name of Effie's son?",
      5,
      { chapterTo: 1800 },
      false,
      "Not enough spoiler-safe evidence was found within Through Chapter 1800.",
      true,
    );

    expect(searchChunks).toHaveBeenCalledWith(
      config,
      "What is the name of Effie's son?",
      5,
      { chapterTo: 1800 },
    );
    expect(findChunksByExactMentionTerms).not.toHaveBeenCalled();
    expect(result.answer).toBe("Effie's son is named Little Ling.");
  });

  it("limits displayed citations to the top three supporting chapters", async () => {
    searchChunks.mockResolvedValue([
      {
        ...firstMentionChunk,
        chapterId: 219,
        chapterNumber: 219,
        chapterTitle: "Relics of the Past",
        sourceUrl: "https://readshadowslave.com/chapter/219",
        chunkId: 2191,
        chunkText: "Sunny wondered what kind of child Effie would one day give birth to.",
        distance: 0.39,
      },
      {
        ...firstMentionChunk,
        chapterId: 1546,
        chapterNumber: 1546,
        chapterTitle: "Raised by Wolves",
        sourceUrl: "https://readshadowslave.com/chapter/1546",
        chunkId: 15461,
        chunkText: "Effie grinned. \"He-he. Well... I'll just call him Little Dumpling for now.\"",
        distance: 0.38,
      },
      {
        ...firstMentionChunk,
        chapterId: 1601,
        chapterNumber: 1601,
        chapterTitle: "Esteemed Guest",
        sourceUrl: "https://readshadowslave.com/chapter/1601",
        chunkId: 16011,
        chunkText: "Effie laughed while carrying Little Ling in her arms.",
        distance: 0.37,
      },
      {
        ...firstMentionChunk,
        chapterId: 1719,
        chapterNumber: 1719,
        chapterTitle: "Story Time.",
        sourceUrl: "https://readshadowslave.com/chapter/1719",
        chunkId: 17191,
        chunkText: "Effie patted Little Ling on the head and smiled. \"What do you want, dumpling?\"",
        distance: 0.36,
      },
      {
        ...firstMentionChunk,
        chapterId: 1720,
        chapterNumber: 1720,
        chapterTitle: "Hard day at Work.",
        sourceUrl: "https://readshadowslave.com/chapter/1720",
        chunkId: 17201,
        chunkText: "It was precisely because of Little Ling and his dad that she was here.",
        distance: 0.35,
      },
    ]);
    generate.mockResolvedValue({
      text: "Effie's son is referred to as Little Ling. He is also temporarily called Little Dumpling, or simply dumpling, by Effie.",
      model: "gemini-2.5-flash",
    });

    const result = await answerQuestion(
      config,
      "What is the name of Effie's son?",
      8,
      { chapterTo: 1730 },
      false,
      "Not enough spoiler-safe evidence was found within Through Chapter 1730.",
      true,
    );

    expect(result.citations).toHaveLength(3);
    expect(result.citations.some((citation) => citation.chapterNumber === 219)).toBe(false);
    expect(result.citations.map((citation) => citation.chapterNumber)).toEqual([1719, 1601, 1546]);
  });

  it("uses the spoiler-safe empty result message when a cutoff removes all evidence", async () => {
    resolveEntityReference.mockResolvedValue({
      ...nephisEntity,
      canonicalName: "Nephis",
      matchedText: "Nephis",
    });
    getEntityMentionTerms.mockReturnValue(["Nephis", "Neph"]);
    findChunksByExactMentionTerms.mockResolvedValue([]);

    const result = await answerQuestion(
      config,
      "Who is Nephis?",
      5,
      { chapterTo: 10 },
      false,
      "Not enough spoiler-safe evidence was found within Volume 1: Child of Shadows.",
      true,
    );

    expect(result.answer).toBe("Not enough spoiler-safe evidence was found within Volume 1: Child of Shadows.");
    expect(createAnswerProvider).not.toHaveBeenCalled();
  });

  it("does not reveal wiki first-appearance chapters past the spoiler cutoff", async () => {
    resolveEntityReference.mockResolvedValue({
      ...nephisEntity,
      canonicalName: "Mordret",
      firstAppearanceChapter: 588,
      firstAppearanceLabel: "Chapter 588 Trust Issues",
    });

    const result = await answerQuestion(
      config,
      "When was Mordret first introduced?",
      5,
      { chapterTo: 350 },
      false,
      "Not enough spoiler-safe evidence was found within Volume 2: Demon of Change.",
      true,
    );

    expect(result.answer).toBe("Not enough spoiler-safe evidence was found within Volume 2: Demon of Change.");
    expect(result.citations).toEqual([]);
  });
});

describe("buildWholePhrasePattern", () => {
  it("anchors short names to whole words", () => {
    expect(buildWholePhrasePattern("Kai")).toBe("(^|[^[:alnum:]_])Kai($|[^[:alnum:]_])");
  });

  it("supports multi-word names and escapes regex metacharacters", () => {
    expect(buildWholePhrasePattern("the Saint? Tyris")).toBe(
      "(^|[^[:alnum:]_])the[[:space:]]+Saint\\?[[:space:]]+Tyris($|[^[:alnum:]_])",
    );
  });
});
