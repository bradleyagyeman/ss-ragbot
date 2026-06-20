#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/backup-db.sh [output-directory]

Create a compressed PostgreSQL custom-format backup of ss-ragbot, encrypt it
with age, and remove the temporary plaintext dump.

Default output directory:
  ~/backups/ss-ragbot

The script reads MIGRATOR_DB_URL from .env in the project root.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 1 ]]; then
  usage >&2
  exit 2
fi

if [[ ! -f .env ]]; then
  echo ".env not found; run this from the project root after setup." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  if [[ -x /opt/homebrew/opt/postgresql@17/bin/pg_dump ]]; then
    PG_DUMP=/opt/homebrew/opt/postgresql@17/bin/pg_dump
  else
    echo "pg_dump not found. Install PostgreSQL tools first." >&2
    exit 1
  fi
else
  PG_DUMP=pg_dump
fi

if ! command -v age >/dev/null 2>&1; then
  echo "age not found. Install age first." >&2
  exit 1
fi

set -a
source .env
set +a

if [[ -z "${MIGRATOR_DB_URL:-}" ]]; then
  echo "MIGRATOR_DB_URL is missing from .env." >&2
  exit 1
fi

output_dir="${1:-${HOME}/backups/ss-ragbot}"
mkdir -p "${output_dir}"

timestamp="$(date +%Y-%m-%d-%H%M%S)"
name="ss-ragbot-${timestamp}.pgcustom"
plain_dump="$(mktemp "${TMPDIR:-/tmp}/${name}.XXXXXX")"
encrypted_dump="${output_dir}/${name}.age"

cleanup() {
  rm -f "${plain_dump}"
}
trap cleanup EXIT

echo "Creating compressed PostgreSQL backup..."
"${PG_DUMP}" -Fc --dbname="${MIGRATOR_DB_URL}" --file="${plain_dump}"

echo "Encrypting backup with age."
echo "Use a strong passphrase stored in Bitwarden or another password manager."
age -p -o "${encrypted_dump}" "${plain_dump}"

chmod 600 "${encrypted_dump}"
cleanup
trap - EXIT

echo
echo "Backup complete:"
echo "  ${encrypted_dump}"
echo
echo "Plaintext temporary dump removed."
