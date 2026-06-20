import { getPool } from "../db/connection.js";
import {
  findEntityBySurfaceForm,
  getEntityTerms,
  getWikiPageByTitle,
  replaceEntityTerms,
  upsertEntity,
  upsertWikiPage,
} from "../db/queries.js";
import { withTransaction } from "../db/migrations.js";
import type { AppConfig, EntityTerm, MetadataSyncSummary, ResolvedEntity } from "../types/index.js";
import { normalizeEntityText } from "./entity-normalize.js";
import { ENTITY_SEEDS, type EntitySeed } from "./entity-seeds.js";

interface WikiRevision {
  revid: number;
  slots: {
    main: {
      content: string;
    };
  };
}

interface WikiPagePayload {
  pageid: number;
  title: string;
  revisions?: WikiRevision[] | undefined;
  missing?: boolean | undefined;
}

interface WikiSearchHit {
  title: string;
}

export interface ParsedWikiEntity {
  canonicalName: string;
  firstAppearanceChapter: number | null;
  firstAppearanceLabel: string | null;
  trueNames: string[];
  wikiAliases: string[];
}

interface SyncTarget {
  canonicalName: string;
  wikiTitle: string;
  manualAliases: string[];
  manualDescriptors: string[];
}

const HYDRATION_MISS_TTL_MS = 60 * 60 * 1000;
const hydrationMissCache = new Map<string, number>();

export async function resolveEntityReference(
  config: AppConfig,
  input: string,
): Promise<ResolvedEntity | undefined> {
  const normalized = normalizeEntityText(input);
  if (!normalized) {
    return undefined;
  }

  return resolveEntityReferenceByNormalized(config, normalized, input);
}

export async function hydrateEntityMetadataIfMissing(
  config: AppConfig,
  input: string,
): Promise<ResolvedEntity | undefined> {
  const normalized = normalizeEntityText(input);
  if (!normalized) {
    return undefined;
  }

  const cachedMissAt = hydrationMissCache.get(normalized);
  if (cachedMissAt && (Date.now() - cachedMissAt) < HYDRATION_MISS_TTL_MS) {
    return undefined;
  }

  const existing = await resolveEntityReferenceByNormalized(config, normalized, input);
  if (existing) {
    hydrationMissCache.delete(normalized);
    return existing;
  }

  let candidates: string[];
  try {
    candidates = await buildHydrationCandidates(config, input);
  } catch (error) {
    if (isRecoverableHydrationError(error)) {
      hydrationMissCache.set(normalized, Date.now());
      return undefined;
    }

    throw error;
  }
  let bestMatch:
    | {
        priority: number;
        target: SyncTarget;
        page: WikiPagePayload;
        parsed: ParsedWikiEntity;
      }
    | undefined;

  for (const candidateTitle of candidates) {
    try {
      const page = await fetchWikiPage(config, candidateTitle);
      const parsed = parseWikiEntity(page.revisions?.[0]?.slots.main.content ?? "", page.title);
      const target = buildHydratedSyncTarget(page.title, parsed, input);
      const terms = buildEntityTerms(target, parsed);
      const matchPriority = findHydrationMatchPriority(terms, normalized);

      if (matchPriority === undefined) {
        continue;
      }

      if (!bestMatch || matchPriority < bestMatch.priority) {
        bestMatch = {
          priority: matchPriority,
          target,
          page,
          parsed,
        };
      }
    } catch (error) {
      if (isMissingWikiPage(error)) {
        continue;
      }

      if (isRecoverableHydrationError(error)) {
        hydrationMissCache.set(normalized, Date.now());
        return undefined;
      }

      throw error;
    }
  }

  if (bestMatch) {
    await persistEntityMetadata(config, bestMatch.target, bestMatch.page, bestMatch.parsed);
    hydrationMissCache.delete(normalized);
    return resolveEntityReferenceByNormalized(config, normalized, input);
  }

  hydrationMissCache.set(normalized, Date.now());
  return undefined;
}

async function resolveEntityReferenceByNormalized(
  config: AppConfig,
  normalized: string,
  input: string,
): Promise<ResolvedEntity | undefined> {
  const pool = getPool(config);
  let match;
  try {
    match = await findEntityBySurfaceForm(pool, normalized);
  } catch (error) {
    if (isMissingEntityMetadataTable(error)) {
      return undefined;
    }

    throw error;
  }
  if (!match) {
    return undefined;
  }

  const terms = await getEntityTerms(pool, match.id);
  return {
    ...match,
    matchedText: input,
    terms,
  };
}

export function getEntityMentionTerms(entity: ResolvedEntity): string[] {
  return entity.terms
    .filter((term) => term.kind !== "manual_descriptor")
    .filter((term) => term.kind !== "wiki_alias" || normalizeEntityText(term.text).split(" ").length > 1)
    .map((term) => term.text);
}

export function canUseEntityForEquivalence(entity: ResolvedEntity): boolean {
  if (entity.matchedKind === "manual_descriptor") {
    return false;
  }

  if (entity.matchedKind === "wiki_alias" && normalizeEntityText(entity.matchedText).split(" ").length <= 1) {
    return false;
  }

  return true;
}

export async function syncWikiEntities(
  config: AppConfig,
  inputs: string[],
  dryRun = false,
): Promise<MetadataSyncSummary> {
  const targets = buildSyncTargets(inputs);
  const pool = getPool(config);
  const summary: MetadataSyncSummary = {
    kind: "metadata_sync",
    source: "shadow-slave-wiki",
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (const target of targets) {
    summary.processed += 1;

    try {
      const page = await fetchWikiPage(config, target.wikiTitle);
      const sourceUrl = buildWikiSourceUrl(config, page.title);
      const existingPage = await getWikiPageByTitle(pool, page.title);
      const revisionId = page.revisions?.[0]?.revid ?? 0;
      const parsed = parseWikiEntity(page.revisions?.[0]?.slots.main.content ?? "", page.title);
      const terms = buildEntityTerms(target, parsed);

      if (!dryRun) {
        await withTransaction(pool, async (client) => {
          const wikiPageId = await upsertWikiPage(client, {
            pageTitle: page.title,
            pageId: page.pageid,
            revisionId,
            sourceUrl,
            rawWikitext: page.revisions?.[0]?.slots.main.content ?? "",
          });

          const entityId = await upsertEntity(client, {
            canonicalName: target.canonicalName,
            normalizedName: normalizeEntityText(target.canonicalName),
            wikiPageId,
            wikiPageTitle: page.title,
            firstAppearanceChapter: parsed.firstAppearanceChapter,
            firstAppearanceLabel: parsed.firstAppearanceLabel,
          });

          await replaceEntityTerms(client, entityId, terms);
        });
      }

      if (existingPage) {
        summary.updated += 1;
      } else {
        summary.inserted += 1;
      }
    } catch (error) {
      summary.errors.push({
        ref: target.canonicalName,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}

function buildHydratedSyncTarget(
  pageTitle: string,
  parsed: ParsedWikiEntity,
  input: string,
): SyncTarget {
  const seed = ENTITY_SEEDS.find((candidate) => {
    const terms = [candidate.canonicalName, candidate.wikiTitle, ...candidate.manualAliases];
    return terms.some((term) => normalizeEntityText(term) === normalizeEntityText(pageTitle))
      || terms.some((term) => normalizeEntityText(term) === normalizeEntityText(parsed.canonicalName))
      || terms.some((term) => normalizeEntityText(term) === normalizeEntityText(input));
  });

  if (seed) {
    return {
      canonicalName: seed.canonicalName,
      wikiTitle: seed.wikiTitle,
      manualAliases: seed.manualAliases,
      manualDescriptors: seed.manualDescriptors,
    };
  }

  return {
    canonicalName: parsed.canonicalName,
    wikiTitle: pageTitle,
    manualAliases: [],
    manualDescriptors: [],
  };
}

export function parseWikiEntity(wikitext: string, fallbackTitle: string): ParsedWikiEntity {
  const canonicalName = stripMarkup(parseInfoboxField(wikitext, "name") ?? fallbackTitle);
  const aliases = parseAliases(parseInfoboxField(wikitext, "alias"));
  const novelField = stripMarkup(parseInfoboxField(wikitext, "novel") ?? "");
  const firstAppearance = parseChapterReference(novelField);

  return {
    canonicalName: canonicalName || fallbackTitle,
    firstAppearanceChapter: firstAppearance?.chapterNumber ?? null,
    firstAppearanceLabel: firstAppearance?.label ?? null,
    trueNames: parseTrueNames(wikitext),
    wikiAliases: aliases.filter((alias) => alias.length > 0),
  };
}

function buildSyncTargets(inputs: string[]): SyncTarget[] {
  if (inputs.length === 0) {
    return ENTITY_SEEDS.map((seed) => ({
      canonicalName: seed.canonicalName,
      wikiTitle: seed.wikiTitle,
      manualAliases: seed.manualAliases,
      manualDescriptors: seed.manualDescriptors,
    }));
  }

  return inputs.map((input) => {
    const seed = ENTITY_SEEDS.find((candidate) => {
      const terms = [candidate.canonicalName, candidate.wikiTitle, ...candidate.manualAliases];
      return terms.some((term) => normalizeEntityText(term) === normalizeEntityText(input));
    });

    return fromSeedOrInput(seed, input);
  });
}

function fromSeedOrInput(seed: EntitySeed | undefined, input: string): SyncTarget {
  if (seed) {
    return {
      canonicalName: seed.canonicalName,
      wikiTitle: seed.wikiTitle,
      manualAliases: seed.manualAliases,
      manualDescriptors: seed.manualDescriptors,
    };
  }

  return {
    canonicalName: input,
    wikiTitle: input,
    manualAliases: [],
    manualDescriptors: [],
  };
}

async function fetchWikiPage(config: AppConfig, title: string): Promise<WikiPagePayload> {
  const url = new URL(config.wiki.apiUrl);
  url.search = new URLSearchParams({
    action: "query",
    prop: "revisions",
    titles: title,
    rvprop: "ids|content",
    rvslots: "main",
    format: "json",
    formatversion: "2",
  }).toString();

  const response = await fetch(url, {
    headers: {
      "user-agent": "ss-ragbot/1.1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Wiki API request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    query?: {
      pages?: WikiPagePayload[];
    };
  };

  const page = payload.query?.pages?.[0];
  if (!page || page.missing) {
    throw new Error(`Wiki page not found: ${title}`);
  }

  return page;
}

async function searchWikiTitles(config: AppConfig, query: string): Promise<string[]> {
  const url = new URL(config.wiki.apiUrl);
  url.search = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "5",
    format: "json",
    formatversion: "2",
  }).toString();

  const response = await fetch(url, {
    headers: {
      "user-agent": "ss-ragbot/1.3.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Wiki API search request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    query?: {
      search?: WikiSearchHit[];
    };
  };

  return payload.query?.search?.map((hit) => hit.title).filter((title) => title.trim().length > 0) ?? [];
}

async function buildHydrationCandidates(config: AppConfig, input: string): Promise<string[]> {
  const trimmed = input.trim();
  const directCandidates = [
    trimmed,
    toTitleCase(trimmed),
  ].filter((candidate) => candidate.length > 0);
  const searchedTitles = await searchWikiTitles(config, trimmed);

  return [...new Set([...directCandidates, ...searchedTitles])];
}

async function persistEntityMetadata(
  config: AppConfig,
  target: SyncTarget,
  page: WikiPagePayload,
  parsed: ParsedWikiEntity,
): Promise<void> {
  const pool = getPool(config);
  const revisionId = page.revisions?.[0]?.revid ?? 0;
  const sourceUrl = buildWikiSourceUrl(config, page.title);
  const rawWikitext = page.revisions?.[0]?.slots.main.content ?? "";
  const terms = buildEntityTerms(target, parsed);

  await withTransaction(pool, async (client) => {
    const wikiPageId = await upsertWikiPage(client, {
      pageTitle: page.title,
      pageId: page.pageid,
      revisionId,
      sourceUrl,
      rawWikitext,
    });

    const entityId = await upsertEntity(client, {
      canonicalName: target.canonicalName,
      normalizedName: normalizeEntityText(target.canonicalName),
      wikiPageId,
      wikiPageTitle: page.title,
      firstAppearanceChapter: parsed.firstAppearanceChapter,
      firstAppearanceLabel: parsed.firstAppearanceLabel,
    });

    await replaceEntityTerms(client, entityId, terms);
  });
}

function buildEntityTerms(target: SyncTarget, parsed: ParsedWikiEntity): EntityTerm[] {
  const terms = new Map<string, EntityTerm>();

  const addTerm = (text: string, kind: EntityTerm["kind"]) => {
    const normalized = normalizeEntityText(text);
    if (!normalized) {
      return;
    }

    const existing = terms.get(normalized);
    if (!existing || termKindPriority(kind) < termKindPriority(existing.kind)) {
      terms.set(normalized, {
        text: text.trim(),
        kind,
      });
    }
  };

  addTerm(target.canonicalName, "canonical");
  addTerm(parsed.canonicalName, "canonical");

  for (const alias of parsed.wikiAliases) {
    addTerm(alias, "wiki_alias");
  }

  for (const trueName of parsed.trueNames) {
    addTerm(trueName, "wiki_true_name");
  }

  for (const alias of target.manualAliases) {
    addTerm(alias, "manual_alias");
  }

  for (const descriptor of target.manualDescriptors) {
    addTerm(descriptor, "manual_descriptor");
  }

  return [...terms.values()].sort((left, right) => left.text.localeCompare(right.text));
}

function termKindPriority(kind: EntityTerm["kind"]): number {
  switch (kind) {
    case "canonical":
      return 0;
    case "manual_alias":
      return 1;
    case "wiki_true_name":
      return 2;
    case "wiki_alias":
      return 3;
    case "manual_descriptor":
      return 4;
  }
}

function findHydrationMatchPriority(
  terms: EntityTerm[],
  normalizedInput: string,
): number | undefined {
  let best: number | undefined;

  for (const term of terms) {
    if (normalizeEntityText(term.text) !== normalizedInput) {
      continue;
    }

    const priority = hydrationMatchPriority(term.kind);
    if (priority === undefined) {
      continue;
    }

    if (best === undefined || priority < best) {
      best = priority;
    }
  }

  return best;
}

function hydrationMatchPriority(kind: EntityTerm["kind"]): number | undefined {
  switch (kind) {
    case "wiki_true_name":
      return 0;
    case "manual_alias":
      return 1;
    case "wiki_alias":
      return 2;
    case "canonical":
      return 3;
    case "manual_descriptor":
      return undefined;
  }
}

function parseInfoboxField(wikitext: string, fieldName: string): string | undefined {
  const match = wikitext.match(
    new RegExp(`\\|\\s*${fieldName}\\s*=([\\s\\S]*?)(?=\\n\\s*\\|\\s*[A-Za-z0-9_]+\\s*=|\\n\\}\\})`, "i"),
  );

  return match?.[1]?.trim();
}

function parseAliases(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  const cleaned = stripMarkup(raw.replace(/\{\{c\|[^}]*\}\}/gi, ""));
  return cleaned
    .split("\n")
    .flatMap((line) => line.split("*"))
    .map((line) => line.trim())
    .map((line) => line.replace(/\s+\(.*$/, "").trim())
    .filter((line) => line.length > 0);
}

function parseTrueNames(wikitext: string): string[] {
  const matches = [...wikitext.matchAll(/^\s*\|\s*true_name\d*\s*=(.+)$/gim)];
  return matches
    .map((match) => stripMarkup(match[1] ?? ""))
    .map((name) => name.replace(/\s*\*+\s*$/, "").trim())
    .filter((name) => name.length > 0);
}

function parseChapterReference(raw: string): { chapterNumber: number; label: string } | undefined {
  const match = raw.match(/Chapter\s+(\d{1,5})(?:\s+([^\n]+))?/i);
  if (!match?.[1]) {
    return undefined;
  }

  const chapterNumber = Number.parseInt(match[1], 10);
  if (!Number.isFinite(chapterNumber)) {
    return undefined;
  }

  return {
    chapterNumber,
    label: match[2]?.trim() || `Chapter ${chapterNumber}`,
  };
}

function stripMarkup(input: string): string {
  return input
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^/>]*\/>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\{c\|([^}]*)\}\}/gi, "$1")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''+/g, "")
    .replace(/''/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildWikiSourceUrl(config: AppConfig, title: string): string {
  const apiUrl = new URL(config.wiki.apiUrl);
  return new URL(`/wiki/${title.replace(/\s+/g, "_")}`, apiUrl.origin).toString();
}

function toTitleCase(input: string): string {
  return input
    .split(/\s+/)
    .map((part) => part.length > 0 ? `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}` : part)
    .join(" ")
    .trim();
}

function isMissingEntityMetadataTable(error: unknown): boolean {
  return (
    error instanceof Error &&
    /entity_terms|entities|wiki_pages/i.test(error.message) &&
    /does not exist/i.test(error.message)
  );
}

function isMissingWikiPage(error: unknown): boolean {
  return error instanceof Error && /Wiki page not found/i.test(error.message);
}

function isRecoverableHydrationError(error: unknown): boolean {
  return (
    error instanceof Error
    && (
      /fetch failed/i.test(error.message)
      || /Wiki API request failed/i.test(error.message)
      || /Wiki API search request failed/i.test(error.message)
    )
  );
}
