export type OutputMode = "human" | "json" | "plain";

export interface ChapterInput {
  chapterNumber: number;
  title: string;
  sourceName: string;
  sourceUrl: string;
  sourceChapterRef: string;
  rawText: string;
}

export interface ChunkRecord {
  chunkIndex: number;
  chunkText: string;
  charCount: number;
}

export interface Citation {
  chapterNumber: number;
  title: string;
  sourceUrl: string;
}

export interface AppliedSpoilerBoundary {
  input: string;
  id: string;
  label: string;
  chapterTo: number;
  kind?: "named" | "chapter";
}

export type EntityTermKind =
  | "canonical"
  | "manual_alias"
  | "wiki_true_name"
  | "wiki_alias"
  | "manual_descriptor";

export interface EntityTerm {
  text: string;
  kind: EntityTermKind;
}

export interface ResolvedEntity {
  id: number;
  canonicalName: string;
  wikiPageTitle: string | null;
  wikiSourceUrl: string | null;
  firstAppearanceChapter: number | null;
  firstAppearanceLabel: string | null;
  matchedText: string;
  matchedKind: EntityTermKind;
  terms: EntityTerm[];
}

export interface RetrievedChunk {
  chapterId: number;
  chapterNumber: number;
  chapterTitle: string;
  sourceUrl: string;
  chunkId: number;
  chunkIndex: number;
  chunkText: string;
  charCount: number;
  distance: number;
}

export interface SearchFilters {
  chapterFrom?: number | undefined;
  chapterTo?: number | undefined;
}

export interface AskResult {
  question: string;
  answer: string;
  citations: Citation[];
  chunks: RetrievedChunk[];
  model: string;
  appliedSpoilerBoundary?: AppliedSpoilerBoundary | undefined;
}

export interface SearchResult {
  query: string;
  results: RetrievedChunk[];
  appliedSpoilerBoundary?: AppliedSpoilerBoundary | undefined;
}

export interface MetadataSyncSummary {
  kind: "metadata_sync";
  source: string;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ ref: string; message: string }>;
}

export interface IngestSummary {
  source: string;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ ref: string; message: string }>;
}

export interface DbStatus {
  chapters: number;
  chunks: number;
  lastIngestedAt: string | null;
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  details: string;
}

export interface DoctorResult {
  ok: boolean;
  checks: DoctorCheck[];
}

export interface AppConfig {
  dbUrl: string;
  migratorDbUrl: string;
  answer: {
    provider: string;
    model: string;
    googleApiKey: string | undefined;
  };
  embedding: {
    provider: string;
    model: string;
    cacheDir: string;
  };
  source: {
    baseUrl: string;
    indexUrl: string;
    requestTimeoutMs: number;
  };
  chunking: {
    sizeChars: number;
    overlapChars: number;
  };
  retrieval: {
    limit: number;
  };
  wiki: {
    apiUrl: string;
  };
  logLevel: "debug" | "info" | "warn" | "error";
  configPaths: {
    project: string;
    user: string;
    system: string;
    explicit: string | undefined;
  };
}

export interface AppContext {
  config: AppConfig;
  logger: Logger;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}
