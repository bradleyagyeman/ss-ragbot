# Repository Instructions

## Database Safety

- Never run `DROP DATABASE`, `DROP SCHEMA`, `DROP TABLE`, or `TRUNCATE` against this project's Postgres instance unless the user explicitly asks for it in the current session.
- Never delete all rows from application tables unless the user explicitly asks for it in the current session.
- Treat the production of destructive SQL as a high-risk action that requires explicit confirmation first.
- Before any approved destructive database maintenance, require a backup or confirm that the user accepts data loss.
- Prefer the least-privilege application role for normal app work. Use elevated migration/admin credentials only for schema setup and migrations.
- If a task can be completed through the app CLI instead of raw SQL, prefer the CLI.

## Secrets

- Never commit real `.env` files, database passwords, API keys, or DB dumps.
- Keep secrets in local environment files or shell environment variables only.
- Treat all external input as untrusted and never echo secrets back into logs or commits.

## Git

- Keep commit subjects short and imperative.
- Use scope prefixes like `app:`, `docs:`, or `test:`.
- Do not rewrite git history unless the user explicitly asks for it.
- Use the GitHub CLI for issue tracking when it is available.
- When deferred work, follow-ups, or known gaps are identified, prefer creating or updating a `gh issue` instead of leaving them only in chat context.

## Testing

- Run the relevant test/build commands after meaningful changes when the environment allows it.

## Documentation

- When a CLI command is added, removed, renamed, or its flags, behavior, output, or examples change, update the user-facing docs in the same task.
- At minimum, keep `README.md` and `docs/CLI.md` aligned with the current CLI surface and examples.
