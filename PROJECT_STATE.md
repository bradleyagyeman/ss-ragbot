# Project State

## Current status
Public-ready snapshot of `ss-ragbot`, a TypeScript-first, CLI-oriented
canon-grounded RAG system.

## Last completed
- Scrubbed legacy identity references for the public repository namespace.
- Completed the scraper User-Agent project URL.
- Hardened the local Postgres setup helper's password validation.

## In progress
- Fresh public repository preparation.

## Next action
Run full tests/build checks in a dependency-installed environment.

## Blockers / questions
- None in the source tree.

## Important decisions
- Publish from a fresh git history.
- Keep secrets, local databases, generated corpora, and backups outside git.
- Keep provider API keys in environment variables or local `.env` files only.

## How to run / verify
```bash
npm install
npm test
npm run build
npm run typecheck
```

## Notes for future sessions
- Node dependencies and local corpus data are intentionally not vendored.
