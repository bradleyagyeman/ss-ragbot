# ss-ragbot CLI Spec

Use `node dist/interfaces/cli.js ...` from this repo after `npm run build`.
Do not use a global `npm link` command for this project.

Fresh machine setup, restore-from-backup, and rebuild steps live in [BOOTSTRAP.md](BOOTSTRAP.md).

## Command Tree

```text
node dist/interfaces/cli.js [global-options] <command> [command-options]

Commands:
  ask [question...]
  search [query...]
  ingest scrape
  ingest import [directory]
  db migrate
  db status
  metadata sync-wiki [entities...]
  doctor
  completions <shell>
  help [command]
```

## Global Flags

| Short | Long | Type | Default | Required | Meaning |
| --- | --- | --- | --- | --- | --- |
| `-h` | `--help` | boolean | `false` | optional | Show help and ignore the rest. |
|  | `--version` | boolean | `false` | optional | Print the version. |
| `-q` | `--quiet` | boolean | `false` | optional | Reduce normal output. |
| `-v` | `--verbose` | boolean | `false` | optional | Add more diagnostics. |
|  | `--json` | boolean | `false` | optional | Emit machine-readable JSON. |
|  | `--plain` | boolean | `false` | optional | Emit stable plain text. |
|  | `--no-color` | boolean | `false` | optional | Turn off color. |
|  | `--config <path>` | string | auto-discovered | optional | Use one JSON config file. |
|  | `--no-input` | boolean | `false` | optional | Disable prompts. |

Use either `--json` or `--plain`, not both.

## Command Options

### `ask`

| Short | Long | Type | Default | Required | Meaning |
| --- | --- | --- | --- | --- | --- |
|  | `--top-k <n>` | number | config `RETRIEVAL_LIMIT` | optional | Number of chunks to retrieve. |
|  | `--spoiler-safe <phrase>` | string | unset | optional | Limit retrieval to one spoiler-safe boundary. Quote multi-word values like `--spoiler-safe "before second nightmare"` or `--spoiler-safe "before chapter 1729"`, or use slug forms like `before-second-nightmare` and `before-chapter-1729`. |
|  | `--chapter-from <n>` | number | unset | optional | Advanced: only use chapters at or after this number. |
|  | `--chapter-to <n>` | number | unset | optional | Advanced: only use chapters at or before this number. |
|  | `--citations-only` | boolean | `false` | optional | Return evidence without generating an answer. |
|  | `--stdin` | boolean | `false` | optional | Read the question from stdin. |

### `search`

| Short | Long | Type | Default | Required | Meaning |
| --- | --- | --- | --- | --- | --- |
|  | `--top-k <n>` | number | config `RETRIEVAL_LIMIT` | optional | Number of chunks to return. |
|  | `--spoiler-safe <phrase>` | string | unset | optional | Limit retrieval to one spoiler-safe boundary. Quote multi-word values like `--spoiler-safe "before second nightmare"` or `--spoiler-safe "before chapter 1729"`, or use slug forms like `before-second-nightmare` and `before-chapter-1729`. |
|  | `--chapter-from <n>` | number | unset | optional | Advanced: only use chapters at or after this number. |
|  | `--chapter-to <n>` | number | unset | optional | Advanced: only use chapters at or before this number. |

### `ingest scrape`

| Short | Long | Type | Default | Required | Meaning |
| --- | --- | --- | --- | --- | --- |
| `-n` | `--dry-run` | boolean | `false` | optional | Show what would change without writing. |
|  | `--limit <n>` | number | unset | optional | Stop after this many chapter pages. |
|  | `--start-at <n>` | number | unset | optional | Skip earlier chapters. |
|  | `--reembed` | boolean | `false` | optional | Rebuild embeddings even when text is unchanged. |
| `-f` | `--force` | boolean | `false` | optional | Keep going past recoverable warnings. |

### `ingest import`

| Short | Long | Type | Default | Required | Meaning |
| --- | --- | --- | --- | --- | --- |
| `-n` | `--dry-run` | boolean | `false` | optional | Show what would change without writing. |
|  | `--glob <pattern>` | string | `*.md` | optional | Change the Markdown file pattern inside the directory. |
|  | `--reembed` | boolean | `false` | optional | Rebuild embeddings even when text is unchanged. |
| `-f` | `--force` | boolean | `false` | optional | Keep going past recoverable warnings. |

### `db migrate`

| Short | Long | Type | Default | Required | Meaning |
| --- | --- | --- | --- | --- | --- |
| `-n` | `--dry-run` | boolean | `false` | optional | Show pending migrations only. |

### `db status`

Read-only. Reports chapter count, chunk count, and the last ingestion time.

### `metadata sync-wiki`

| Short | Long | Type | Default | Required | Meaning |
| --- | --- | --- | --- | --- | --- |
| `-n` | `--dry-run` | boolean | `false` | optional | Show what would change without writing. |
|  | `[entities...]` | string[] | seeded defaults | optional | Sync only the named wiki pages or surface forms. |

### `doctor`

Reports required config values, database connectivity, and migration status. Read-only.

### `completions`

| Short | Long | Type | Default | Required | Meaning |
| --- | --- | --- | --- | --- | --- |
|  | `<shell>` | string | none | required | `bash`, `zsh`, or `fish`. |

## Subcommand Semantics

- `ask` answers canon questions from retrieved chapter evidence. It can also use synced wiki-backed entity metadata for first appearance, alias resolution, True Name resolution, and deterministic alias-equivalence answers while keeping the novel corpus as the primary citation source.
- `search` retrieves relevant chunks and chapter metadata without answer generation. If the query matches a synced entity alias or True Name, it can use exact entity-term retrieval instead of semantic search.
- `ingest scrape` fetches the source site, parses chapters, chunks text, generates embeddings, and upserts changed content. It is idempotent for unchanged chapters through `content_hash`.
- `ingest import` reads local Markdown files and sends them through the same ingestion pipeline. It is idempotent for unchanged chapters through `content_hash`.
- `db migrate` applies SQL migrations in order and records them in `_migrations`. It is idempotent once all migrations are applied.
- `db status` reports chapter count, chunk count, and last ingestion timestamp.
- `metadata sync-wiki` fetches wiki-backed entity pages through the configured MediaWiki API and refreshes local metadata tables. It is idempotent for unchanged synced pages.
- `doctor` reports required config values, app and migrator database connectivity, and migration status.
- `completions` prints a shell completion script to stdout.

## Output Contract

- stdout is for primary data
- stderr is for diagnostics, warnings, progress, and errors
- human formatting only appears when stdout is a TTY and neither `--json` nor `--plain` is set
- color is disabled for `NO_COLOR`, `TERM=dumb`, non-TTY stdout, or `--no-color`

| Mode | Shape |
| --- | --- |
| `--json` | `ask`: `{ "question", "answer", "citations", "chunks", "model", "appliedSpoilerBoundary?" }`; `search`: `{ "query", "results", "appliedSpoilerBoundary?" }`; `ingest`: `{ "source", "processed", "inserted", "updated", "skipped", "errors" }`; `db migrate`: `{ "applied", "pending" }`; `db status`: `{ "chapters", "chunks", "lastIngestedAt" }`; `metadata sync-wiki`: `{ "kind", "source", "processed", "inserted", "updated", "skipped", "errors" }`; `doctor`: `{ "ok", "checks" }` |
| `--plain` | `ask` and `search` emit stable line-oriented summaries; when a named spoiler boundary is applied, `ask` includes a `spoiler_safe` line after the question and `search` includes one before the results; `ingest` and `metadata sync-wiki` emit tab-separated summary lines; `doctor` emits one line per check; commands without a plain renderer fall back to compact JSON |

## Error Codes

- `0`: success
- `1`: generic failure
- `2`: invalid usage or argument parse error
- `3`: configuration error
- `4`: database error
- `5`: provider error
- `6`: scrape or import parse error

## Safety Rules

- `--dry-run` is supported for all state-changing commands in v1.
- No destructive commands are exposed in v1, so confirmation prompts are not part of the normal flow.
- `--force` suppresses early aborts on recoverable ingest warnings.
- `--no-input` disables prompts; v1 commands should still work headlessly.
- Ctrl-C exits quickly, attempts bounded cleanup, and does not leave partial chapter upserts inside an open transaction.
- `--spoiler-safe` applies either a named story boundary or a chapter-based cutoff before retrieval. If the scope removes all relevant evidence, `ask` refuses with a spoiler-safe empty-result message rather than guessing.
- Because shells split unquoted multi-word values, use either a quoted phrase like `--spoiler-safe "before second nightmare"` or `--spoiler-safe "before chapter 1729"`, or a slug like `--spoiler-safe before-second-nightmare` or `--spoiler-safe before-chapter-1729`.
- `--chapter-from` and `--chapter-to` remain available for advanced/manual use and are intersected with `--spoiler-safe` when both are present.
- alias-equivalence questions such as `Are Sunny and Sunless the same person?` use deterministic entity resolution plus ranked novel evidence instead of generic semantic retrieval.
- identity, title, and True Name questions such as `Who is Lost from Light?` use local entity metadata first. If the entity is missing locally, `ask` performs one bounded wiki-backed metadata refresh, stores it locally, and retries once before refusing conservatively.

## Config And Env

`flags > env vars > project config > user config > system config`

Env vars:

- `DB_URL`
- `MIGRATOR_DB_URL`
- `ANSWER_PROVIDER`
- `ANSWER_MODEL`
- `GOOGLE_API_KEY`
- `EMBEDDING_PROVIDER`
- `EMBEDDING_MODEL`
- `EMBEDDING_CACHE_DIR`
- `SOURCE_BASE_URL`
- `SOURCE_INDEX_URL`
- `REQUEST_TIMEOUT_MS`
- `CHUNK_SIZE_CHARS`
- `CHUNK_OVERLAP_CHARS`
- `RETRIEVAL_LIMIT`
- `WIKI_API_URL`
- `LOG_LEVEL`
- `SS_RAGBOT_PROJECT_CONFIG`
- `SS_RAGBOT_USER_CONFIG`
- `SS_RAGBOT_SYSTEM_CONFIG`

Config files:

- project: `./ss-ragbot.config.json`
- user: `$XDG_CONFIG_HOME/ss-ragbot/config.json` or `~/.config/ss-ragbot/config.json`
- system: `/etc/ss-ragbot/config.json`

## Shell Completion

Use the generated completion scripts only if you intentionally install or link
the package binary. For normal repo-local use, skip shell completion.

```bash
ss-ragbot completions bash > ~/.local/share/bash-completion/completions/ss-ragbot
ss-ragbot completions zsh > "${fpath[1]}/_ss-ragbot"
ss-ragbot completions fish > ~/.config/fish/completions/ss-ragbot.fish
```

## Examples

Examples use repo-local commands.

```bash
node dist/interfaces/cli.js doctor
node dist/interfaces/cli.js ask "Who is Mordret?"
node dist/interfaces/cli.js search "Mordret"
node dist/interfaces/cli.js db migrate
node dist/interfaces/cli.js doctor --json
node dist/interfaces/cli.js metadata sync-wiki
node dist/interfaces/cli.js metadata sync-wiki Sunny Kai
node dist/interfaces/cli.js ingest import data/chapters
node dist/interfaces/cli.js ingest scrape --limit 20
node dist/interfaces/cli.js ask "Who is Mordret?"
printf '%s\n' "When was Nephis first introduced?" | node dist/interfaces/cli.js ask --stdin --json
node dist/interfaces/cli.js ask "Who is Song of the Fallen and when was she introduced?"
node dist/interfaces/cli.js ask "Are Sunny and Sunless the same person?"
node dist/interfaces/cli.js ask "Who is Mordret?" --spoiler-safe "volume 2"
node dist/interfaces/cli.js ask "Who are the Fire Keepers?" --spoiler-safe before-second-nightmare
node dist/interfaces/cli.js ask "What is the name of Effie's son?" --spoiler-safe "before chapter 1729"
node dist/interfaces/cli.js ask "What is the name of Effie's son?" --spoiler-safe before-chapter-1729
node dist/interfaces/cli.js ask "Who is Nephis?" --spoiler-safe chapter-95
node dist/interfaces/cli.js ask "What happened at the Forgotten Shore?" --chapter-from 1 --chapter-to 400
node dist/interfaces/cli.js search "Mordret" --spoiler-safe "before second nightmare" --json
node dist/interfaces/cli.js search "Mordret" --spoiler-safe second-nightmare --json
node dist/interfaces/cli.js search "Spellbreaker" --top-k 5 --plain
node dist/interfaces/cli.js ask "Which chapters mention the Weave?" --citations-only --json
node dist/interfaces/cli.js completions bash
```
