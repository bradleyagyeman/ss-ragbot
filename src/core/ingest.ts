import { getPool } from "../db/connection.js";
import { getChapterBySourceRef, replaceChunks, upsertChapter } from "../db/queries.js";
import { withTransaction } from "../db/migrations.js";
import { createEmbeddingsProvider } from "../providers/embeddings.js";
import type { AppConfig, ChapterInput, IngestSummary, Logger } from "../types/index.js";
import { hashContent } from "../utils/hashing.js";
import { chunkText } from "./chunk.js";
import { importMarkdownDirectory } from "./import-files.js";
import { scrapeChapters } from "./scrape.js";

export interface IngestOptions {
  dryRun?: boolean;
  force?: boolean;
  globPattern?: string;
  limit?: number;
  startAt?: number;
  reembed?: boolean;
  logger: Logger;
}

export async function ingestFromMarkdown(
  config: AppConfig,
  directory: string,
  options: IngestOptions,
): Promise<IngestSummary> {
  const chapters = await importMarkdownDirectory(directory, options.globPattern ?? "*.md");
  return ingestChapters(config, "markdown", chapters, options);
}

export async function ingestFromScrape(
  config: AppConfig,
  options: IngestOptions,
): Promise<IngestSummary> {
  const chapters = await scrapeChapters(config, {
    logger: options.logger,
    limit: options.limit,
    startAt: options.startAt,
  });
  return ingestChapters(config, "readshadowslave", chapters, options);
}

export async function ingestChapters(
  config: AppConfig,
  sourceName: string,
  chapters: ChapterInput[],
  options: IngestOptions,
): Promise<IngestSummary> {
  const pool = getPool(config);
  const embeddings = options.dryRun ? undefined : createEmbeddingsProvider(config);
  const summary: IngestSummary = {
    source: sourceName,
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (const chapter of chapters) {
    summary.processed += 1;
    const contentHash = hashContent(chapter.rawText);

    try {
      const existing = await getChapterBySourceRef(pool, chapter.sourceName, chapter.sourceChapterRef);
      if (existing && existing.content_hash === contentHash && !options.reembed) {
        summary.skipped += 1;
        continue;
      }

      const chunks = chunkText(chapter.rawText, {
        sizeChars: config.chunking.sizeChars,
        overlapChars: config.chunking.overlapChars,
      });

      if (options.dryRun) {
        if (existing) {
          summary.updated += 1;
        } else {
          summary.inserted += 1;
        }
        continue;
      }

      const chunkEmbeddings = await embeddings!.embed(chunks.map((chunk) => chunk.chunkText));
      await withTransaction(pool, async (client) => {
        const chapterId = await upsertChapter(client, chapter, contentHash);
        await replaceChunks(client, chapterId, chunks, chunkEmbeddings);
      });

      if (existing) {
        summary.updated += 1;
      } else {
        summary.inserted += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push({
        ref: `${chapter.sourceName}:${chapter.sourceChapterRef}`,
        message,
      });

      if (!options.force) {
        throw error;
      }

      options.logger.warn("ingest item failed", {
        ref: `${chapter.sourceName}:${chapter.sourceChapterRef}`,
        message,
      });
    }
  }

  return summary;
}
