# Shadow Slave RAG Bot

CLI-first, canon-grounded retrieval for *Shadow Slave*.

For a fresh machine, restore, or rebuild, start with [docs/BOOTSTRAP.md](docs/BOOTSTRAP.md).
For the command surface, flags, and examples, use [docs/CLI.md](docs/CLI.md).
For product and architecture context, use [docs/PRD.md](docs/PRD.md).

## What It Does

- answers canon questions from chapter evidence
- ingests chapters from `readshadowslave.com` or local Markdown files
- stores chapters, chunks, and vectors in native Postgres with `pgvector`
- syncs wiki-backed entity metadata for first appearance, aliases, and True Names
- supports spoiler-safe questions and chapter-cutoff searches

## Daily Use

After `npm run build`, run the local CLI entry point directly:

```bash
node dist/interfaces/cli.js doctor
node dist/interfaces/cli.js ask "Who is Mordret?"
node dist/interfaces/cli.js search "Forgotten Shore"
```

Run these commands from this repo. Do not use a global `npm link` command for
this project.

Refresh the corpus only when needed:

```bash
node dist/interfaces/cli.js db migrate
node dist/interfaces/cli.js ingest scrape
node dist/interfaces/cli.js ingest import data/chapters
node dist/interfaces/cli.js metadata sync-wiki
```

Keep `.env`, `.env.backup.*`, and decrypted `.pgcustom` files on your machine only.
Encrypted `.pgcustom.age` backups are safe to transfer when protected by a strong
passphrase stored in a password manager.

## Configuration

Configuration precedence is `flags > env vars > project config > user config > system config`.

Supported config file paths:

- project: `./ss-ragbot.config.json`
- user: `$XDG_CONFIG_HOME/ss-ragbot/config.json` or `~/.config/ss-ragbot/config.json`
- system: `/etc/ss-ragbot/config.json`

For the full config and environment-variable list, see [docs/CLI.md](docs/CLI.md).

## Development

```bash
npm install
npm test
npm run build
```
