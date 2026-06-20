import type { SearchFilters } from "../types/index.js";

export function resolveQueryFilters(query: string, explicit: SearchFilters): SearchFilters {
  if (explicit.chapterFrom !== undefined || explicit.chapterTo !== undefined) {
    return explicit;
  }

  const inferred = inferChapterFilter(query);
  if (!inferred) {
    return explicit;
  }

  return inferred;
}

function inferChapterFilter(query: string): SearchFilters | undefined {
  const normalized = query.trim().toLowerCase();

  const exact = normalized.match(/\bchapter\s+(\d{1,5})\b/);
  if (exact?.[1]) {
    const chapter = Number.parseInt(exact[1], 10);
    if (Number.isFinite(chapter)) {
      return {
        chapterFrom: chapter,
        chapterTo: chapter,
      };
    }
  }

  const range = normalized.match(/\bchapters\s+(\d{1,5})\s*(?:to|-)\s*(\d{1,5})\b/);
  if (range?.[1] && range?.[2]) {
    const start = Number.parseInt(range[1], 10);
    const end = Number.parseInt(range[2], 10);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return {
        chapterFrom: Math.min(start, end),
        chapterTo: Math.max(start, end),
      };
    }
  }

  return undefined;
}
