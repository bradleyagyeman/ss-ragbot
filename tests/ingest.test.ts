import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashContent } from "../src/utils/hashing.js";
import type { AppConfig, ChapterInput, Logger } from "../src/types/index.js";

const fakePool = { kind: "pool" };
const fakeClient = { kind: "client" };

const getPoolMock = vi.fn(() => fakePool);
const getChapterBySourceRefMock = vi.fn();
const replaceChunksMock = vi.fn();
const upsertChapterMock = vi.fn();
const withTransactionMock = vi.fn(async (_pool: unknown, handler: (client: unknown) => Promise<unknown>) =>
  handler(fakeClient),
);
const embedMock = vi.fn();
const createEmbeddingsProviderMock = vi.fn(() => ({
  embed: embedMock,
}));

vi.mock("../src/db/connection.js", () => ({
  getPool: getPoolMock,
}));

vi.mock("../src/db/queries.js", () => ({
  getChapterBySourceRef: getChapterBySourceRefMock,
  replaceChunks: replaceChunksMock,
  upsertChapter: upsertChapterMock,
}));

vi.mock("../src/db/migrations.js", () => ({
  withTransaction: withTransactionMock,
}));

vi.mock("../src/providers/embeddings.js", () => ({
  createEmbeddingsProvider: createEmbeddingsProviderMock,
}));

const { ingestChapters } = await import("../src/core/ingest.js");

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

const logger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const chapter: ChapterInput = {
  chapterNumber: 1,
  title: "Nightmare Begins",
  sourceName: "readshadowslave",
  sourceUrl: "https://readshadowslave.com/chapter/1",
  sourceChapterRef: "/chapter/1",
  rawText: "Sunny enters the police station. ".repeat(40),
};

beforeEach(() => {
  vi.clearAllMocks();
  getPoolMock.mockReturnValue(fakePool);
  withTransactionMock.mockImplementation(async (_pool: unknown, handler: (client: unknown) => Promise<unknown>) =>
    handler(fakeClient),
  );
  createEmbeddingsProviderMock.mockReturnValue({
    embed: embedMock,
  });
  embedMock.mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]);
  upsertChapterMock.mockResolvedValue(101);
  replaceChunksMock.mockResolvedValue(undefined);
});

describe("ingestChapters", () => {
  it("skips unchanged chapters without embedding or writing", async () => {
    getChapterBySourceRefMock.mockResolvedValue({
      id: 1,
      chapter_number: 1,
      title: chapter.title,
      source_name: chapter.sourceName,
      source_url: chapter.sourceUrl,
      source_chapter_ref: chapter.sourceChapterRef,
      content_hash: hashContent(chapter.rawText),
    });

    const summary = await ingestChapters(config, "readshadowslave", [chapter], {
      logger,
    });

    expect(summary).toMatchObject({
      processed: 1,
      inserted: 0,
      updated: 0,
      skipped: 1,
      errors: [],
    });
    expect(embedMock).not.toHaveBeenCalled();
    expect(withTransactionMock).not.toHaveBeenCalled();
  });

  it("reports inserts in dry-run mode without touching embeddings or the database", async () => {
    getChapterBySourceRefMock.mockResolvedValue(undefined);

    const summary = await ingestChapters(config, "readshadowslave", [chapter], {
      dryRun: true,
      logger,
    });

    expect(summary).toMatchObject({
      processed: 1,
      inserted: 1,
      updated: 0,
      skipped: 0,
      errors: [],
    });
    expect(createEmbeddingsProviderMock).not.toHaveBeenCalled();
    expect(embedMock).not.toHaveBeenCalled();
    expect(withTransactionMock).not.toHaveBeenCalled();
  });

  it("updates changed chapters and replaces chunks", async () => {
    getChapterBySourceRefMock.mockResolvedValue({
      id: 1,
      chapter_number: 1,
      title: chapter.title,
      source_name: chapter.sourceName,
      source_url: chapter.sourceUrl,
      source_chapter_ref: chapter.sourceChapterRef,
      content_hash: "stale-hash",
    });

    const summary = await ingestChapters(config, "readshadowslave", [chapter], {
      logger,
    });

    expect(summary).toMatchObject({
      processed: 1,
      inserted: 0,
      updated: 1,
      skipped: 0,
      errors: [],
    });
    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(upsertChapterMock).toHaveBeenCalledTimes(1);
    expect(replaceChunksMock).toHaveBeenCalledTimes(1);
  });

  it("records errors and continues when force is enabled", async () => {
    const failingChapter: ChapterInput = {
      ...chapter,
      sourceChapterRef: "/chapter/2",
    };

    getChapterBySourceRefMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    embedMock.mockResolvedValue([[0.1, 0.2]]);
    upsertChapterMock
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValueOnce(202);

    const summary = await ingestChapters(config, "readshadowslave", [chapter, failingChapter], {
      force: true,
      logger,
    });

    expect(summary.processed).toBe(2);
    expect(summary.inserted).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]?.message).toContain("write failed");
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
