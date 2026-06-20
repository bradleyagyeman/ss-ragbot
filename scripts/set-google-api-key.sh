#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  if [[ ! -f .env.example ]]; then
    echo ".env.example not found; run this from the project root." >&2
    exit 1
  fi

  cp .env.example .env
fi

read -rsp "Google API key: " GOOGLE_API_KEY
echo

if [[ -z "${GOOGLE_API_KEY}" ]]; then
  echo "GOOGLE_API_KEY cannot be empty." >&2
  exit 1
fi

cp .env ".env.backup.$(date +%s)"

tmp_env="$(mktemp)"
awk \
  -v google_api_key="${GOOGLE_API_KEY}" \
  '
  BEGIN {
    wrote_key = 0;
  }
  /^GOOGLE_API_KEY=/ {
    print "GOOGLE_API_KEY=" google_api_key;
    wrote_key = 1;
    next;
  }
  {
    print;
  }
  END {
    if (!wrote_key) {
      print "GOOGLE_API_KEY=" google_api_key;
    }
  }
  ' .env > "${tmp_env}"

mv "${tmp_env}" .env
chmod 600 .env
unset GOOGLE_API_KEY

echo "Updated GOOGLE_API_KEY in .env."
