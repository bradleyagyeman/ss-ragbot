import type { Pool, PoolClient } from "pg";

import type {
  ChapterInput,
  ChunkRecord,
  DbStatus,
  EntityTerm,
  EntityTermKind,
  RetrievedChunk,
  SearchFilters,
} from "../types/index.js";

export interface ChapterRow {
  id: number;
  chapter_number: number;
  title: string;
  source_name: string;
  source_url: string;
  source_chapter_ref: string;
  content_hash: string;
}

export interface ChapterLookupRow {
  chapter_number: number;
  title: string;
  source_url: string;
}

export interface WikiPageInput {
  pageTitle: string;
  pageId: number;
  revisionId: number;
  sourceUrl: string;
  rawWikitext: string;
}

export interface EntityInput {
  canonicalName: string;
  normalizedName: string;
  wikiPageId: number;
  wikiPageTitle: string;
  firstAppearanceChapter: number | null;
  firstAppearanceLabel: string | null;
}

export interface EntityRow {
  id: number;
  canonicalName: string;
  wikiPageTitle: string | null;
  wikiSourceUrl: string | null;
  firstAppearanceChapter: number | null;
  firstAppearanceLabel: string | null;
  matchedKind: EntityTermKind;
}

export interface AliasEvidenceChunk extends RetrievedChunk {
  hasLeftTerm: boolean;
  hasRightTerm: boolean;
  hasCanonicalTerm: boolean;
  hasIdentityPhrase: boolean;
  evidenceScore: number;
}

export async function getChapterBySourceRef(
  client: Pool | PoolClient,
  sourceName: string,
  sourceChapterRef: string,
): Promise<ChapterRow | undefined> {
  const result = await client.query<ChapterRow>(
    `
      SELECT id, chapter_number, title, source_name, source_url, source_chapter_ref, content_hash
      FROM chapters
      WHERE source_name = $1 AND source_chapter_ref = $2
    `,
    [sourceName, sourceChapterRef],
  );

  return result.rows[0];
}

export async function getChapterByNumber(
  client: Pool | PoolClient,
  chapterNumber: number,
): Promise<ChapterLookupRow | undefined> {
  const result = await client.query<ChapterLookupRow>(
    `
      SELECT chapter_number, title, source_url
      FROM chapters
      WHERE chapter_number = $1
      LIMIT 1
    `,
    [chapterNumber],
  );

  return result.rows[0];
}

export async function upsertChapter(
  client: PoolClient,
  chapter: ChapterInput,
  contentHash: string,
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `
      INSERT INTO chapters (
        chapter_number,
        title,
        source_name,
        source_url,
        source_chapter_ref,
        content_hash,
        raw_text,
        ingested_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (source_name, source_chapter_ref)
      DO UPDATE SET
        chapter_number = EXCLUDED.chapter_number,
        title = EXCLUDED.title,
        source_url = EXCLUDED.source_url,
        content_hash = EXCLUDED.content_hash,
        raw_text = EXCLUDED.raw_text,
        ingested_at = NOW(),
        updated_at = NOW()
      RETURNING id
    `,
    [
      chapter.chapterNumber,
      chapter.title,
      chapter.sourceName,
      chapter.sourceUrl,
      chapter.sourceChapterRef,
      contentHash,
      chapter.rawText,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to upsert chapter");
  }

  return row.id;
}

export async function replaceChunks(
  client: PoolClient,
  chapterId: number,
  chunks: ChunkRecord[],
  embeddings: number[][],
): Promise<void> {
  await client.query("DELETE FROM chunks WHERE chapter_id = $1", [chapterId]);

  for (const [index, chunk] of chunks.entries()) {
    const currentEmbedding = embeddings[index];
    if (!currentEmbedding) {
      throw new Error(`Missing embedding for chunk ${chunk.chunkIndex}`);
    }

    const embedding = vectorLiteral(currentEmbedding);
    await client.query(
      `
        INSERT INTO chunks (chapter_id, chunk_index, chunk_text, char_count, embedding)
        VALUES ($1, $2, $3, $4, $5::vector)
      `,
      [chapterId, chunk.chunkIndex, chunk.chunkText, chunk.charCount, embedding],
    );
  }
}

export async function retrieveChunks(
  pool: Pool,
  queryEmbedding: number[],
  limit: number,
  filters: SearchFilters,
): Promise<RetrievedChunk[]> {
  const conditions: string[] = [];
  const values: Array<number | string> = [vectorLiteral(queryEmbedding), limit];
  let parameter = 3;

  if (filters.chapterFrom !== undefined) {
    conditions.push(`chapters.chapter_number >= $${parameter++}`);
    values.push(filters.chapterFrom);
  }

  if (filters.chapterTo !== undefined) {
    conditions.push(`chapters.chapter_number <= $${parameter++}`);
    values.push(filters.chapterTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query<RetrievedChunk>(
    `
      SELECT
        chapters.id AS "chapterId",
        chapters.chapter_number AS "chapterNumber",
        chapters.title AS "chapterTitle",
        chapters.source_url AS "sourceUrl",
        chunks.id AS "chunkId",
        chunks.chunk_index AS "chunkIndex",
        chunks.chunk_text AS "chunkText",
        chunks.char_count AS "charCount",
        (chunks.embedding <=> $1::vector) AS distance
      FROM chunks
      INNER JOIN chapters ON chapters.id = chunks.chapter_id
      ${whereClause}
      ORDER BY chunks.embedding <=> $1::vector ASC, chapters.chapter_number ASC, chunks.chunk_index ASC
      LIMIT $2
    `,
    values,
  );

  return result.rows;
}

export async function getDbStatus(pool: Pool): Promise<DbStatus> {
  const result = await pool.query<DbStatus>(
    `
      SELECT
        (SELECT COUNT(*)::int FROM chapters) AS chapters,
        (SELECT COUNT(*)::int FROM chunks) AS chunks,
        (SELECT MAX(ingested_at)::text FROM chapters) AS "lastIngestedAt"
    `,
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Unable to read database status");
  }

  return row;
}

export async function getWikiPageByTitle(
  client: Pool | PoolClient,
  pageTitle: string,
): Promise<{ id: number; revision_id: number } | undefined> {
  const result = await client.query<{ id: number; revision_id: number }>(
    `
      SELECT id, revision_id
      FROM wiki_pages
      WHERE page_title = $1
    `,
    [pageTitle],
  );

  return result.rows[0];
}

export async function upsertWikiPage(
  client: PoolClient,
  page: WikiPageInput,
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `
      INSERT INTO wiki_pages (
        page_title,
        page_id,
        revision_id,
        source_url,
        raw_wikitext,
        fetched_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (page_title)
      DO UPDATE SET
        page_id = EXCLUDED.page_id,
        revision_id = EXCLUDED.revision_id,
        source_url = EXCLUDED.source_url,
        raw_wikitext = EXCLUDED.raw_wikitext,
        fetched_at = NOW(),
        updated_at = NOW()
      RETURNING id
    `,
    [page.pageTitle, page.pageId, page.revisionId, page.sourceUrl, page.rawWikitext],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to upsert wiki page");
  }

  return row.id;
}

export async function upsertEntity(
  client: PoolClient,
  entity: EntityInput,
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `
      INSERT INTO entities (
        canonical_name,
        normalized_name,
        wiki_page_id,
        wiki_page_title,
        first_appearance_chapter,
        first_appearance_label,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (canonical_name)
      DO UPDATE SET
        normalized_name = EXCLUDED.normalized_name,
        wiki_page_id = EXCLUDED.wiki_page_id,
        wiki_page_title = EXCLUDED.wiki_page_title,
        first_appearance_chapter = EXCLUDED.first_appearance_chapter,
        first_appearance_label = EXCLUDED.first_appearance_label,
        updated_at = NOW()
      RETURNING id
    `,
    [
      entity.canonicalName,
      entity.normalizedName,
      entity.wikiPageId,
      entity.wikiPageTitle,
      entity.firstAppearanceChapter,
      entity.firstAppearanceLabel,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to upsert entity");
  }

  return row.id;
}

export async function replaceEntityTerms(
  client: PoolClient,
  entityId: number,
  terms: EntityTerm[],
): Promise<void> {
  await client.query("DELETE FROM entity_terms WHERE entity_id = $1", [entityId]);

  for (const term of terms) {
    await client.query(
      `
        INSERT INTO entity_terms (entity_id, term_text, normalized_text, term_kind)
        VALUES ($1, $2, $3, $4)
      `,
      [entityId, term.text, normalizeTerm(term.text), term.kind],
    );
  }
}

export async function findEntityBySurfaceForm(
  client: Pool | PoolClient,
  normalizedText: string,
): Promise<EntityRow | undefined> {
  const result = await client.query<EntityRow>(
    `
      SELECT
        entities.id AS "id",
        entities.canonical_name AS "canonicalName",
        entities.wiki_page_title AS "wikiPageTitle",
        wiki_pages.source_url AS "wikiSourceUrl",
        entities.first_appearance_chapter AS "firstAppearanceChapter",
        entities.first_appearance_label AS "firstAppearanceLabel",
        entity_terms.term_kind AS "matchedKind"
      FROM entity_terms
      INNER JOIN entities ON entities.id = entity_terms.entity_id
      LEFT JOIN wiki_pages ON wiki_pages.id = entities.wiki_page_id
      WHERE entity_terms.normalized_text = $1
      ORDER BY
        CASE entity_terms.term_kind
          WHEN 'wiki_true_name' THEN 0
          WHEN 'manual_alias' THEN 1
          WHEN 'canonical' THEN 2
          WHEN 'wiki_alias' THEN 3
          WHEN 'manual_descriptor' THEN 4
          ELSE 5
        END
      LIMIT 1
    `,
    [normalizedText],
  );

  return result.rows[0];
}

export async function getEntityTerms(
  client: Pool | PoolClient,
  entityId: number,
): Promise<EntityTerm[]> {
  const result = await client.query<{ text: string; kind: EntityTermKind }>(
    `
      SELECT term_text AS "text", term_kind AS "kind"
      FROM entity_terms
      WHERE entity_id = $1
      ORDER BY term_text ASC
    `,
    [entityId],
  );

  return result.rows;
}

export async function findFirstChunkMention(
  pool: Pool,
  term: string,
  filters: SearchFilters = {},
): Promise<RetrievedChunk | undefined> {
  return findFirstChunkMentionForTerms(pool, [term], filters);
}

export async function findFirstChunkMentionForTerms(
  pool: Pool,
  terms: string[],
  filters: SearchFilters = {},
): Promise<RetrievedChunk | undefined> {
  const result = await pool.query<RetrievedChunk>(
    `
      SELECT
        chapters.id AS "chapterId",
        chapters.chapter_number AS "chapterNumber",
        chapters.title AS "chapterTitle",
        chapters.source_url AS "sourceUrl",
        chunks.id AS "chunkId",
        chunks.chunk_index AS "chunkIndex",
        chunks.chunk_text AS "chunkText",
        chunks.char_count AS "charCount",
        0::float AS distance
      FROM chunks
      INNER JOIN chapters ON chapters.id = chunks.chapter_id
      ${buildFilterClause(1, terms, filters)}
      ORDER BY chapters.chapter_number ASC, chunks.chunk_index ASC
      LIMIT 1
    `,
    buildFilterValues(terms, filters),
  );

  return result.rows[0];
}

export async function findChunksByExactMention(
  pool: Pool,
  term: string,
  limit: number,
  filters: SearchFilters = {},
): Promise<RetrievedChunk[]> {
  return findChunksByExactMentionTerms(pool, [term], limit, filters);
}

export async function findChunksByExactMentionTerms(
  pool: Pool,
  terms: string[],
  limit: number,
  filters: SearchFilters = {},
): Promise<RetrievedChunk[]> {
  const result = await pool.query<RetrievedChunk>(
    `
      SELECT
        chapters.id AS "chapterId",
        chapters.chapter_number AS "chapterNumber",
        chapters.title AS "chapterTitle",
        chapters.source_url AS "sourceUrl",
        chunks.id AS "chunkId",
        chunks.chunk_index AS "chunkIndex",
        chunks.chunk_text AS "chunkText",
        chunks.char_count AS "charCount",
        0::float AS distance
      FROM chunks
      INNER JOIN chapters ON chapters.id = chunks.chapter_id
      ${buildFilterClause(1, terms, filters)}
      ORDER BY chapters.chapter_number ASC, chunks.chunk_index ASC
      LIMIT $${buildLimitParameter(filters)}
    `,
    [...buildFilterValues(terms, filters), limit],
  );

  return result.rows;
}

export async function findAliasEquivalenceEvidence(
  pool: Pool,
  leftTerms: string[],
  rightTerms: string[],
  canonicalTerms: string[],
  limit: number,
  filters: SearchFilters = {},
): Promise<AliasEvidenceChunk[]> {
  const leftPattern = buildAnyPhrasePattern(leftTerms);
  const rightPattern = buildAnyPhrasePattern(rightTerms);
  const canonicalPattern = buildAnyPhrasePattern(canonicalTerms);
  const identityPattern = buildAliasIdentityPhrasePattern();

  const values: Array<number | string> = [
    leftPattern,
    rightPattern,
    canonicalPattern,
    identityPattern,
  ];

  const conditions = [
    `(chunks.chunk_text ~* $1 OR chunks.chunk_text ~* $2 OR chunks.chunk_text ~* $3)`,
  ];
  let parameter = 5;

  if (filters.chapterFrom !== undefined) {
    conditions.push(`chapters.chapter_number >= $${parameter++}`);
    values.push(filters.chapterFrom);
  }

  if (filters.chapterTo !== undefined) {
    conditions.push(`chapters.chapter_number <= $${parameter++}`);
    values.push(filters.chapterTo);
  }

  values.push(limit);
  const limitParameter = parameter;

  const result = await pool.query<AliasEvidenceChunk>(
    `
      SELECT
        chapters.id AS "chapterId",
        chapters.chapter_number AS "chapterNumber",
        chapters.title AS "chapterTitle",
        chapters.source_url AS "sourceUrl",
        chunks.id AS "chunkId",
        chunks.chunk_index AS "chunkIndex",
        chunks.chunk_text AS "chunkText",
        chunks.char_count AS "charCount",
        0::float AS distance,
        (chunks.chunk_text ~* $1) AS "hasLeftTerm",
        (chunks.chunk_text ~* $2) AS "hasRightTerm",
        (chunks.chunk_text ~* $3) AS "hasCanonicalTerm",
        (chunks.chunk_text ~* $4) AS "hasIdentityPhrase",
        (
          CASE WHEN chunks.chunk_text ~* $1 AND chunks.chunk_text ~* $2 THEN 100 ELSE 0 END +
          CASE
            WHEN (chunks.chunk_text ~* $1 AND chunks.chunk_text ~* $3)
              OR (chunks.chunk_text ~* $2 AND chunks.chunk_text ~* $3)
            THEN 40
            ELSE 0
          END +
          CASE WHEN chunks.chunk_text ~* $4 THEN 20 ELSE 0 END +
          CASE WHEN chunks.chunk_text ~* $1 THEN 8 ELSE 0 END +
          CASE WHEN chunks.chunk_text ~* $2 THEN 8 ELSE 0 END +
          CASE WHEN chunks.chunk_text ~* $3 THEN 4 ELSE 0 END
        ) AS "evidenceScore"
      FROM chunks
      INNER JOIN chapters ON chapters.id = chunks.chapter_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY "evidenceScore" DESC, chapters.chapter_number ASC, chunks.chunk_index ASC
      LIMIT $${limitParameter}
    `,
    values,
  );

  return result.rows;
}

export function buildWholePhrasePattern(term: string): string {
  return buildAnyPhrasePattern([term]);
}

export function scoreAliasEvidenceText(
  chunkText: string,
  leftTerms: string[],
  rightTerms: string[],
  canonicalTerms: string[],
): number {
  const hasLeft = hasAnyWholePhrase(chunkText, leftTerms);
  const hasRight = hasAnyWholePhrase(chunkText, rightTerms);
  const hasCanonical = hasAnyWholePhrase(chunkText, canonicalTerms);
  const hasIdentityPhrase = hasAliasIdentityPhrase(chunkText);

  return (
    (hasLeft && hasRight ? 100 : 0) +
    ((hasLeft && hasCanonical) || (hasRight && hasCanonical) ? 40 : 0) +
    (hasIdentityPhrase ? 20 : 0) +
    (hasLeft ? 8 : 0) +
    (hasRight ? 8 : 0) +
    (hasCanonical ? 4 : 0)
  );
}

function buildFilterClause(patternParameter: number, terms: string[], filters: SearchFilters): string {
  const conditions = [`chunks.chunk_text ~* $${patternParameter}`];
  let parameter = patternParameter + 1;

  if (filters.chapterFrom !== undefined) {
    conditions.push(`chapters.chapter_number >= $${parameter++}`);
  }

  if (filters.chapterTo !== undefined) {
    conditions.push(`chapters.chapter_number <= $${parameter++}`);
  }

  return `WHERE ${conditions.join(" AND ")}`;
}

function buildFilterValues(terms: string[], filters: SearchFilters): Array<number | string> {
  const values: Array<number | string> = [buildAnyPhrasePattern(terms)];

  if (filters.chapterFrom !== undefined) {
    values.push(filters.chapterFrom);
  }

  if (filters.chapterTo !== undefined) {
    values.push(filters.chapterTo);
  }

  return values;
}

function buildLimitParameter(filters: SearchFilters): number {
  let parameter = 2;

  if (filters.chapterFrom !== undefined) {
    parameter += 1;
  }

  if (filters.chapterTo !== undefined) {
    parameter += 1;
  }

  return parameter;
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAnyPhrasePattern(terms: string[]): string {
  const normalized = [...new Set(terms.map((term) => term.trim()).filter((term) => term.length > 0))];
  if (normalized.length === 0) {
    throw new Error("Search term must not be empty");
  }

  if (normalized.length === 1) {
    return buildBoundedPattern(normalized[0]!);
  }

  const patterns = normalized
    .sort((left, right) => right.length - left.length)
    .map((term) => buildTermPattern(term));

  return `(^|[^[:alnum:]_])(${patterns.join("|")})($|[^[:alnum:]_])`;
}

function hasAnyWholePhrase(chunkText: string, terms: string[]): boolean {
  return terms.some((term) => {
    const pattern = buildJavaScriptWholePhrasePattern(term);
    return pattern.test(chunkText);
  });
}

function hasAliasIdentityPhrase(chunkText: string): boolean {
  return new RegExp(buildJavaScriptAliasIdentityPhrasePattern(), "iu").test(chunkText);
}

function normalizeTerm(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^the\s+/i, "")
    .trim();
}

function buildBoundedPattern(term: string): string {
  return `(^|[^[:alnum:]_])${buildTermPattern(term)}($|[^[:alnum:]_])`;
}

function buildJavaScriptWholePhrasePattern(term: string): RegExp {
  const escapedParts = term
    .trim()
    .split(/\s+/)
    .map((part) => escapeRegex(part))
    .filter((part) => part.length > 0);

  if (escapedParts.length === 0) {
    throw new Error("Search term must not be empty");
  }

  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapedParts.join("\\s+")}($|[^\\p{L}\\p{N}_])`, "iu");
}

function buildTermPattern(term: string): string {
  const escapedParts = term
    .trim()
    .split(/\s+/)
    .map((part) => escapeRegex(part))
    .filter((part) => part.length > 0);

  if (escapedParts.length === 0) {
    throw new Error("Search term must not be empty");
  }

  return escapedParts.join("[[:space:]]+");
}

function buildAliasIdentityPhrasePattern(): string {
  const phrases = [
    "you can call me",
    "call me",
    "my name is",
    "known as",
    "referred to as",
  ];

  return `(${phrases.map((phrase) => phrase.split(/\s+/).map((part) => escapeRegex(part)).join("[[:space:]]+")).join("|")})`;
}

function buildJavaScriptAliasIdentityPhrasePattern(): string {
  const phrases = [
    "you can call me",
    "call me",
    "my name is",
    "known as",
    "referred to as",
  ];

  return `(${phrases.map((phrase) => phrase.split(/\s+/).map((part) => escapeRegex(part)).join("\\s+")).join("|")})`;
}
