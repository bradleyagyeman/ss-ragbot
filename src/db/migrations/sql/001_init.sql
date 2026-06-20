CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS chapters (
  id BIGSERIAL PRIMARY KEY,
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_chapter_ref TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chapters_source_unique UNIQUE (source_name, source_chapter_ref)
);

CREATE INDEX IF NOT EXISTS chapters_number_idx ON chapters (chapter_number);

CREATE TABLE IF NOT EXISTS chunks (
  id BIGSERIAL PRIMARY KEY,
  chapter_id BIGINT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  embedding vector NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chunks_chapter_index_unique UNIQUE (chapter_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS chunks_chapter_id_idx ON chunks (chapter_id);
