import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../src/types/index.js";

const findChunksByExactMentionTerms = vi.fn();
const retrieveChunks = vi.fn();
const embedOne = vi.fn();
const createEmbeddingsProvider = vi.fn(() => ({ embedOne }));
const resolveEntityReference = vi.fn();
const getEntityMentionTerms = vi.fn();

vi.mock("../src/db/connection.js", () => ({
  getPool: vi.fn(() => ({ fake: true })),
}));

vi.mock("../src/db/queries.js", async () => {
  const actual = await vi.importActual<typeof import("../src/db/queries.js")>(
    "../src/db/queries.js",
  );

  return {
    ...actual,
    findChunksByExactMentionTerms,
    retrieveChunks,
  };
});

vi.mock("../src/providers/embeddings.js", () => ({
  createEmbeddingsProvider,
}));

vi.mock("../src/core/wiki-entities.js", () => ({
  resolveEntityReference,
  getEntityMentionTerms,
}));

const { searchChunks } = await import("../src/core/retrieve.js");
const { scoreAliasEvidenceText } = await import("../src/db/queries.js");

const config: AppConfig = {
  dbUrl: "postgres://app:pw@localhost:5432/ss_ragbot",
  migratorDbUrl: "postgres://migrator:pw@localhost:5432/ss_ragbot",
  answer: {
    provider: "google",
    model: "gemini-2.5-flash",
    googleApiKey: undefined,
  },
  embedding: {
    provider: "local",
    model: "Xenova/bge-small-en-v1.5",
    cacheDir: ".cache/models",
  },
  source: {
    baseUrl: "https://readshadowslave.com",
    indexUrl: "https://readshadowslave.com/chapters",
    requestTimeoutMs: 15_000,
  },
  chunking: {
    sizeChars: 150,
    overlapChars: 20,
  },
  retrieval: {
    limit: 8,
  },
  wiki: {
    apiUrl: "https://shadowslave.fandom.com/api.php",
  },
  logLevel: "info",
  configPaths: {
    project: "ss-ragbot.config.json",
    user: "~/.config/ss-ragbot/config.json",
    system: "/etc/ss-ragbot/config.json",
    explicit: undefined,
  },
};

describe("searchChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses exact mention search when the query resolves to a known entity alias", async () => {
    resolveEntityReference.mockResolvedValue({
      id: 1,
      canonicalName: "Cassie",
      wikiPageTitle: "Cassie",
      wikiSourceUrl: "https://shadowslave.fandom.com/wiki/Cassie",
      firstAppearanceChapter: 11,
      firstAppearanceLabel: "Chapter 11 First Meeting",
      matchedText: "Cassia",
      matchedKind: "manual_alias",
      terms: [],
    });
    getEntityMentionTerms.mockReturnValue(["Cassie", "Cassy", "Cassia"]);
    findChunksByExactMentionTerms.mockResolvedValue([{ chunkId: 1 }]);

    const results = await searchChunks(config, "Cassia", 5, {});

    expect(findChunksByExactMentionTerms).toHaveBeenCalledWith(
      expect.any(Object),
      ["Cassie", "Cassy", "Cassia"],
      5,
      {},
    );
    expect(embedOne).not.toHaveBeenCalled();
    expect(results).toEqual([{ chunkId: 1 }]);
  });

  it("falls back to semantic retrieval when no entity metadata matches", async () => {
    resolveEntityReference.mockResolvedValue(undefined);
    embedOne.mockResolvedValue([0.1, 0.2]);
    retrieveChunks.mockResolvedValue([{ chunkId: 2 }]);

    const results = await searchChunks(config, "Forgotten Shore", 5, {});

    expect(embedOne).toHaveBeenCalledWith("Forgotten Shore");
    expect(retrieveChunks).toHaveBeenCalled();
    expect(results).toEqual([{ chunkId: 2 }]);
  });
});

describe("scoreAliasEvidenceText", () => {
  it("prefers chunks containing both queried terms plus an identity phrase", () => {
    const strongest = scoreAliasEvidenceText(
      "I'm Sunless. But you can call me Sunny.",
      ["Sunny"],
      ["Sunless"],
      ["Sunny"],
    );
    const weaker = scoreAliasEvidenceText(
      "Sunny walked toward the gate.",
      ["Sunny"],
      ["Sunless"],
      ["Sunny"],
    );

    expect(strongest).toBeGreaterThan(weaker);
  });

  it("prefers dual-term evidence over generic single-name mentions", () => {
    const dualTerm = scoreAliasEvidenceText(
      "Changing Star glanced at Nephis in silence.",
      ["Changing Star"],
      ["Nephis"],
      ["Nephis"],
    );
    const singleName = scoreAliasEvidenceText(
      "Nephis stood by the fire.",
      ["Changing Star"],
      ["Nephis"],
      ["Nephis"],
    );

    expect(dualTerm).toBeGreaterThan(singleName);
  });
});
