#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/decrypt-backup.sh <encrypted-backup.age> [output-file]

Decrypt an age-encrypted ss-ragbot database backup.

If output-file is omitted, the script writes next to the encrypted backup and
removes the final .age suffix:

  backup.pgcustom.age -> backup.pgcustom
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 2
fi

encrypted_backup="$1"
output_file="${2:-}"

if [[ ! -f "${encrypted_backup}" ]]; then
  echo "Encrypted backup not found: ${encrypted_backup}" >&2
  exit 1
fi

if [[ "${encrypted_backup}" != *.age && -z "${output_file}" ]]; then
  echo "Output file is required when the encrypted backup does not end in .age." >&2
  exit 1
fi

if ! command -v age >/dev/null 2>&1; then
  echo "age not found. Install age first." >&2
  exit 1
fi

if [[ -z "${output_file}" ]]; then
  output_file="${encrypted_backup%.age}"
fi

if [[ -e "${output_file}" ]]; then
  echo "Output file already exists: ${output_file}" >&2
  echo "Choose a different output path or move the existing file first." >&2
  exit 1
fi

echo "Decrypting backup..."
age -d -o "${output_file}" "${encrypted_backup}"
chmod 600 "${output_file}"

echo
echo "Decrypted backup:"
echo "  ${output_file}"
echo
echo "This plaintext file is sensitive. Remove it after restore or inspection."
