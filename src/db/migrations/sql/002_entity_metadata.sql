CREATE TABLE IF NOT EXISTS wiki_pages (
  id BIGSERIAL PRIMARY KEY,
  page_title TEXT NOT NULL UNIQUE,
  page_id BIGINT NOT NULL,
  revision_id BIGINT NOT NULL,
  source_url TEXT NOT NULL,
  raw_wikitext TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entities (
  id BIGSERIAL PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL UNIQUE,
  wiki_page_id BIGINT REFERENCES wiki_pages(id) ON DELETE SET NULL,
  wiki_page_title TEXT,
  first_appearance_chapter INTEGER,
  first_appearance_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entity_terms (
  id BIGSERIAL PRIMARY KEY,
  entity_id BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  term_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  term_kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT entity_terms_unique UNIQUE (entity_id, normalized_text, term_kind)
);

CREATE INDEX IF NOT EXISTS entity_terms_normalized_idx ON entity_terms (normalized_text);
