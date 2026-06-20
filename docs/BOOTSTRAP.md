# Bootstrap Guide

Use this guide to bring `ss-ragbot` up on a fresh machine or recover it on another system. Platforms covered here are macOS and Linux/WSL only.

## What You Need

- `git`
- `node` and `npm`
- PostgreSQL
- `pgvector`
- `psql` and `createdb`
- `age` for encrypted backups

## Sensitive Local Files

Treat `.env`, `.env.backup.*`, and decrypted `.pgcustom` files as sensitive
local files. Encrypted `.pgcustom.age` backups are intended for transfer or
cloud storage when protected by a strong passphrase stored in a password
manager.

## Pick A Path

- Restore from an encrypted backup when you have one. It is faster and keeps the already-ingested corpus, embeddings, and synced metadata.
- Rebuild from scratch when you do not have a backup. It takes longer because it re-scrapes, re-chunks, re-embeds, and re-syncs metadata.

## Install Native Postgres

### macOS

Use Homebrew:

```bash
brew install node postgresql@17 pgvector age
```

Start Postgres for this session:

```bash
/opt/homebrew/opt/postgresql@17/bin/pg_ctl \
  -D /opt/homebrew/var/postgresql@17 \
  -l /opt/homebrew/var/postgresql@17/server.log \
  start
```

Check that it is accepting connections:

```bash
/opt/homebrew/opt/postgresql@17/bin/pg_isready
```

For auto-start at login, run this from a normal Terminal window outside `tmux`:

```bash
brew services start postgresql@17
```

Homebrew refuses `brew services` inside `tmux` on macOS. Use `pg_ctl` inside `tmux`, or use `brew services` from a normal Terminal session.

### Linux/WSL

Install Node/npm, PostgreSQL, `pgvector`, `psql`, `createdb`, and `age` with your distro package manager. On WSL, do this inside the Linux distribution shell, not from Windows PowerShell.

The helper script [`scripts/setup-local-postgres.sh`](../scripts/setup-local-postgres.sh) is the quick path on Linux/WSL. It expects the local `postgres` system user because it runs `sudo -u postgres`.

## Clone And Install

```bash
git clone <repo-url>
cd ss-ragbot
npm install
```

## Create `.env`

Start from [`.env.example`](../.env.example):

```bash
cp .env.example .env
```

Set the Google API key with the helper:

```bash
./scripts/set-google-api-key.sh
```

The helper is interactive. It prompts for the key without echoing it, creates `.env` from `.env.example` when needed, backs up the current `.env` to `.env.backup.<timestamp>`, updates `GOOGLE_API_KEY` in place, and sets `.env` to mode `600`.

The important variables are:

- `DB_URL`
- `MIGRATOR_DB_URL`
- `GOOGLE_API_KEY`

## Set Up Local Postgres Roles

### Linux/WSL Quick Path

Use saved app and migrator passwords, or generate fresh local-only passwords.
The helper accepts only letters, numbers, dot, underscore, tilde, and hyphen so
passwords cannot break the setup SQL.

```bash
read -rsp "App DB password: " APP_DB_PASSWORD; echo
read -rsp "Migrator DB password: " MIGRATOR_DB_PASSWORD; echo
export APP_DB_PASSWORD MIGRATOR_DB_PASSWORD
./scripts/setup-local-postgres.sh
unset APP_DB_PASSWORD MIGRATOR_DB_PASSWORD
```

This script creates or updates `ss_ragbot_app`, creates or updates `ss_ragbot_migrator`, creates the `ss_ragbot` database if needed, enables `pgvector`, and updates local `.env` with `DB_URL` and `MIGRATOR_DB_URL`.

### macOS Manual Path

The Linux helper uses `sudo -u postgres`, so do not run it as-is on macOS. Use Homebrew's Postgres binaries directly.

Generate local-only role passwords:

```bash
APP_DB_PASSWORD="$(openssl rand -hex 24)"
MIGRATOR_DB_PASSWORD="$(openssl rand -hex 24)"
```

The examples below assume those generated hex passwords. If you reuse saved passwords that contain quotes, `#`, `&`, backslashes, or shell metacharacters, escape them carefully or use an interactive `psql` session instead.

Create roles:

```bash
/opt/homebrew/opt/postgresql@17/bin/psql -v ON_ERROR_STOP=1 -d postgres <<SQL
CREATE ROLE ss_ragbot_migrator LOGIN PASSWORD '${MIGRATOR_DB_PASSWORD}';
CREATE ROLE ss_ragbot_app LOGIN PASSWORD '${APP_DB_PASSWORD}';
SQL
```

Create the database:

```bash
/opt/homebrew/opt/postgresql@17/bin/createdb --owner=ss_ragbot_migrator ss_ragbot
```

Enable `pgvector` and set privileges:

```bash
/opt/homebrew/opt/postgresql@17/bin/psql -v ON_ERROR_STOP=1 -d ss_ragbot <<SQL
ALTER DATABASE ss_ragbot OWNER TO ss_ragbot_migrator;
REVOKE ALL ON DATABASE ss_ragbot FROM PUBLIC;
GRANT CONNECT ON DATABASE ss_ragbot TO ss_ragbot_migrator;
GRANT CONNECT ON DATABASE ss_ragbot TO ss_ragbot_app;

CREATE EXTENSION IF NOT EXISTS vector;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO ss_ragbot_migrator;
GRANT USAGE ON SCHEMA public TO ss_ragbot_app;

ALTER DEFAULT PRIVILEGES FOR ROLE ss_ragbot_migrator IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ss_ragbot_app;

ALTER DEFAULT PRIVILEGES FOR ROLE ss_ragbot_migrator IN SCHEMA public
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ss_ragbot_app;
SQL
```

Write the DB URLs into `.env`:

```bash
perl -0pi -e "s#^DB_URL=.*#DB_URL=postgres://ss_ragbot_app:${APP_DB_PASSWORD}\@localhost:5432/ss_ragbot#m" .env
perl -0pi -e "s#^MIGRATOR_DB_URL=.*#MIGRATOR_DB_URL=postgres://ss_ragbot_migrator:${MIGRATOR_DB_PASSWORD}\@localhost:5432/ss_ragbot#m" .env
chmod 600 .env
unset APP_DB_PASSWORD MIGRATOR_DB_PASSWORD
```

## Restore From An Encrypted Backup

Use this path when you already have a `.pgcustom.age` file from `./scripts/backup-db.sh`.

Decrypt the backup:

```bash
./scripts/decrypt-backup.sh ~/backups/ss-ragbot/ss-ragbot-123.pgcustom.age
```

If you pass only the encrypted file, the script writes the plaintext `.pgcustom` file next to it. You can choose a different output path if you want the decrypted file elsewhere. The plaintext file is sensitive and should be removed after restore or inspection.

Restore the decrypted backup:

```bash
set -a
source .env
set +a

pg_restore -d "$MIGRATOR_DB_URL" ~/backups/ss-ragbot/ss-ragbot-123.pgcustom
```

Use `MIGRATOR_DB_URL` for restore, not `DB_URL`.
On macOS, use `/opt/homebrew/opt/postgresql@17/bin/pg_restore` if `pg_restore`
is not on your PATH.

Sanity check the restore:

```bash
npm run build
node dist/interfaces/cli.js doctor
node dist/interfaces/cli.js ask "Who is Mordret?"
```

On macOS, if the restore needs to create the `vector` extension and the migrator role cannot do that, run the restore as your local Postgres admin user instead of `MIGRATOR_DB_URL`.

## Rebuild From Scratch

Use this only if you do not have a backup:

```bash
npm run build
node dist/interfaces/cli.js db migrate
node dist/interfaces/cli.js ingest scrape
node dist/interfaces/cli.js metadata sync-wiki
node dist/interfaces/cli.js doctor
```

This path takes longer because it re-scrapes, re-chunks, re-embeds, and re-syncs metadata.

## Helper Scripts

### `./scripts/setup-local-postgres.sh`

Linux/WSL helper for local Postgres setup. It expects `APP_DB_PASSWORD` and
`MIGRATOR_DB_PASSWORD` in the environment, validates that both are simple
setup-safe strings, creates or updates the roles, creates the database if
needed, enables `pgvector`, and rewrites the DB URLs in `.env`.

Example:

```bash
read -rsp "App DB password: " APP_DB_PASSWORD; echo
read -rsp "Migrator DB password: " MIGRATOR_DB_PASSWORD; echo
export APP_DB_PASSWORD MIGRATOR_DB_PASSWORD
./scripts/setup-local-postgres.sh
unset APP_DB_PASSWORD MIGRATOR_DB_PASSWORD
```

### `./scripts/set-google-api-key.sh`

Interactive helper for `GOOGLE_API_KEY`. It creates `.env` from `.env.example` if needed, backs up the current `.env` to `.env.backup.<timestamp>`, updates the key, and sets the file mode to `600`.

Example:

```bash
./scripts/set-google-api-key.sh
```

### `./scripts/backup-db.sh [output-directory]`

Creates a compressed PostgreSQL custom-format dump, encrypts it with `age -p`, and removes the temporary plaintext dump. The default output directory is `~/backups/ss-ragbot`.

Examples:

```bash
./scripts/backup-db.sh
./scripts/backup-db.sh ~/Downloads/ss-ragbot-backups
```

### `./scripts/decrypt-backup.sh <encrypted-backup.age> [output-file]`

Decrypts an `age`-encrypted backup. If you do not pass an output file, it writes the plaintext `.pgcustom` file next to the encrypted file.

Examples:

```bash
./scripts/decrypt-backup.sh ~/backups/ss-ragbot/ss-ragbot-123.pgcustom.age
./scripts/decrypt-backup.sh ~/backups/ss-ragbot/ss-ragbot-123.pgcustom.age ~/tmp/ss-ragbot-restore.pgcustom
```

## Sanity Checks

Run these after setup, restore, or rebuild:

```bash
npm run build
node dist/interfaces/cli.js db migrate
node dist/interfaces/cli.js doctor
node dist/interfaces/cli.js ask "When was Nephis first introduced?"
```

Expected results:

- build succeeds
- migrations are clean
- `doctor` reports healthy config and database access
- `ask` returns an answer with citations
