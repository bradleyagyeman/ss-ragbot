import type { AskResult, DoctorResult, IngestSummary, MetadataSyncSummary, SearchResult } from "../types/index.js";

export function formatJson(payload: unknown): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function formatPlain(payload: unknown): string {
  return `${toPlain(payload)}\n`;
}

export function formatHuman(payload: unknown): string {
  return `${toHuman(payload)}\n`;
}

function toPlain(payload: unknown): string {
  if (isAskResult(payload)) {
    return [
      `question\t${payload.question}`,
      ...(payload.appliedSpoilerBoundary
        ? [
            `spoiler_safe\t${payload.appliedSpoilerBoundary.id}\t${payload.appliedSpoilerBoundary.label}\t${payload.appliedSpoilerBoundary.chapterTo}`,
          ]
        : []),
      `answer\t${payload.answer.replace(/\s+/g, " ").trim()}`,
      ...payload.citations.map((citation) => `citation\t${citation.chapterNumber}\t${citation.title}\t${citation.sourceUrl}`),
    ].join("\n");
  }

  if (isSearchResult(payload)) {
    const header = payload.appliedSpoilerBoundary
      ? [`spoiler_safe\t${payload.appliedSpoilerBoundary.id}\t${payload.appliedSpoilerBoundary.label}\t${payload.appliedSpoilerBoundary.chapterTo}`]
      : [];

    return [
      ...header,
      ...payload.results.map(
        (result) =>
          `${result.chapterNumber}\t${result.chapterTitle}\t${result.chunkIndex}\t${result.distance.toFixed(4)}\t${result.sourceUrl}`,
      ),
    ].join("\n");
  }

  if (isMetadataSyncSummary(payload)) {
    return [
      `source\t${payload.source}`,
      `processed\t${payload.processed}`,
      `inserted\t${payload.inserted}`,
      `updated\t${payload.updated}`,
      `skipped\t${payload.skipped}`,
      `errors\t${payload.errors.length}`,
    ].join("\n");
  }

  if (isIngestSummary(payload)) {
    return [
      `source\t${payload.source}`,
      `processed\t${payload.processed}`,
      `inserted\t${payload.inserted}`,
      `updated\t${payload.updated}`,
      `skipped\t${payload.skipped}`,
      `errors\t${payload.errors.length}`,
    ].join("\n");
  }

  return JSON.stringify(payload);
}

function toHuman(payload: unknown): string {
  if (isAskResult(payload)) {
    const citations = payload.citations.length
      ? payload.citations.map((citation) => `- Chapter ${citation.chapterNumber}: ${citation.title} (${citation.sourceUrl})`).join("\n")
      : "No citations.";
    return [
      `Question: ${payload.question}`,
      ...(payload.appliedSpoilerBoundary
        ? [`Spoiler Safe: ${payload.appliedSpoilerBoundary.label} (through Chapter ${payload.appliedSpoilerBoundary.chapterTo})`]
        : []),
      "",
      payload.answer,
      "",
      "Citations:",
      citations,
    ].join("\n");
  }

  if (isSearchResult(payload)) {
    const heading = payload.appliedSpoilerBoundary
      ? `Spoiler Safe: ${payload.appliedSpoilerBoundary.label} (through Chapter ${payload.appliedSpoilerBoundary.chapterTo})`
      : undefined;

    if (payload.results.length === 0) {
      return [heading, `No results for: ${payload.query}`].filter(Boolean).join("\n");
    }

    return [
      ...(heading ? [heading, ""] : []),
      payload.results
        .map(
          (result) =>
            [
              `Chapter ${result.chapterNumber}: ${result.chapterTitle}`,
              `Chunk ${result.chunkIndex} | distance ${result.distance.toFixed(4)}`,
              result.chunkText,
              result.sourceUrl,
            ].join("\n"),
        )
        .join("\n\n"),
    ].join("\n");
  }

  if (isMetadataSyncSummary(payload)) {
    const base = [
      `Source: ${payload.source}`,
      `Processed: ${payload.processed}`,
      `Inserted: ${payload.inserted}`,
      `Updated: ${payload.updated}`,
      `Skipped: ${payload.skipped}`,
      `Errors: ${payload.errors.length}`,
    ];
    const errors = payload.errors.map((error) => `- ${error.ref}: ${error.message}`);
    return [...base, ...(errors.length > 0 ? ["", "Errors:", ...errors] : [])].join("\n");
  }

  if (isIngestSummary(payload)) {
    const base = [
      `Source: ${payload.source}`,
      `Processed: ${payload.processed}`,
      `Inserted: ${payload.inserted}`,
      `Updated: ${payload.updated}`,
      `Skipped: ${payload.skipped}`,
      `Errors: ${payload.errors.length}`,
    ];
    const errors = payload.errors.map((error) => `- ${error.ref}: ${error.message}`);
    return [...base, ...(errors.length > 0 ? ["", "Errors:", ...errors] : [])].join("\n");
  }

  if (isDoctorResult(payload)) {
    return payload.checks.map((check) => `${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.details}`).join("\n");
  }

  return JSON.stringify(payload, null, 2);
}

function isAskResult(value: unknown): value is AskResult {
  return value !== null && typeof value === "object" && "question" in value && "answer" in value && "chunks" in value;
}

function isSearchResult(value: unknown): value is SearchResult {
  return value !== null && typeof value === "object" && "query" in value && "results" in value;
}

function isIngestSummary(value: unknown): value is IngestSummary {
  return (
    value !== null &&
    typeof value === "object" &&
    "processed" in value &&
    "source" in value &&
    (!("kind" in value) || (value as { kind?: string }).kind !== "metadata_sync")
  );
}

function isDoctorResult(value: unknown): value is DoctorResult {
  return value !== null && typeof value === "object" && "checks" in value;
}

function isMetadataSyncSummary(value: unknown): value is MetadataSyncSummary {
  return value !== null && typeof value === "object" && "kind" in value && (value as { kind?: string }).kind === "metadata_sync";
}
