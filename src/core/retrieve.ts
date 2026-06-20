import { getPool } from "../db/connection.js";
import { findChunksByExactMentionTerms, retrieveChunks } from "../db/queries.js";
import { createEmbeddingsProvider } from "../providers/embeddings.js";
import type { AppConfig, RetrievedChunk, SearchFilters } from "../types/index.js";
import { getEntityMentionTerms, resolveEntityReference } from "./wiki-entities.js";

export async function searchChunks(
  config: AppConfig,
  query: string,
  limit: number,
  filters: SearchFilters,
): Promise<RetrievedChunk[]> {
  const pool = getPool(config);
  const resolvedEntity = await resolveEntityReference(config, query);
  const entityTerms = resolvedEntity ? getEntityMentionTerms(resolvedEntity) : [];

  if (entityTerms.length > 0) {
    return findChunksByExactMentionTerms(pool, entityTerms, limit, filters);
  }

  const embeddings = createEmbeddingsProvider(config);
  const queryEmbedding = await embeddings.embedOne(query);
  return retrieveChunks(pool, queryEmbedding, limit, filters);
}
