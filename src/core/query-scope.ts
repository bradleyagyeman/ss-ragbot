import type { AppliedSpoilerBoundary, SearchFilters } from "../types/index.js";
import { resolveQueryFilters } from "./query-filters.js";
import { resolveSpoilerBoundary } from "./spoiler-boundaries.js";

export interface QueryScope {
  filters: SearchFilters;
  appliedSpoilerBoundary?: AppliedSpoilerBoundary | undefined;
  emptyResultMessage?: string | undefined;
}

export function resolveQueryScope(
  query: string,
  explicit: SearchFilters,
  spoilerSafe?: string | undefined,
): QueryScope {
  const filters = resolveQueryFilters(query, explicit);

  if (!spoilerSafe) {
    return { filters };
  }

  const boundary = resolveSpoilerBoundary(spoilerSafe);
  const chapterTo = filters.chapterTo === undefined ? boundary.chapterTo : Math.min(filters.chapterTo, boundary.chapterTo);

  return {
    filters: {
      ...filters,
      chapterTo,
    },
    appliedSpoilerBoundary: boundary,
    emptyResultMessage: `Not enough spoiler-safe evidence was found within ${boundary.label}.`,
  };
}
