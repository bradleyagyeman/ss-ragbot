#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${APP_DB_PASSWORD:-}" ]]; then
  echo "APP_DB_PASSWORD is required" >&2
  exit 1
fi

if [[ -z "${MIGRATOR_DB_PASSWORD:-}" ]]; then
  echo "MIGRATOR_DB_PASSWORD is required" >&2
  exit 1
fi

validate_password() {
  local name="$1"
  local value="$2"
  if [[ ! "${value}" =~ ^[A-Za-z0-9._~-]+$ ]]; then
    echo "${name} may only contain letters, numbers, dot, underscore, tilde, and hyphen." >&2
    exit 1
  fi
}

validate_password "APP_DB_PASSWORD" "${APP_DB_PASSWORD}"
validate_password "MIGRATOR_DB_PASSWORD" "${MIGRATOR_DB_PASSWORD}"

sudo -u postgres psql -v ON_ERROR_STOP=1 postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ss_ragbot_migrator') THEN
    CREATE ROLE ss_ragbot_migrator LOGIN PASSWORD '${MIGRATOR_DB_PASSWORD}';
  ELSE
    ALTER ROLE ss_ragbot_migrator WITH LOGIN PASSWORD '${MIGRATOR_DB_PASSWORD}';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ss_ragbot_app') THEN
    CREATE ROLE ss_ragbot_app LOGIN PASSWORD '${APP_DB_PASSWORD}';
  ELSE
    ALTER ROLE ss_ragbot_app WITH LOGIN PASSWORD '${APP_DB_PASSWORD}';
  END IF;
END
\$\$;
SQL

if ! sudo -u postgres psql -Atqc "SELECT 1 FROM pg_database WHERE datname = 'ss_ragbot'" postgres | grep -q 1; then
  sudo -u postgres createdb --owner=ss_ragbot_migrator ss_ragbot
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 ss_ragbot <<SQL
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

if [[ -f .env ]]; then
  cp .env ".env.backup.$(date +%s)"
else
  cp .env.example .env
fi

tmp_env="$(mktemp)"
awk \
  -v app_pw="${APP_DB_PASSWORD}" \
  -v migrator_pw="${MIGRATOR_DB_PASSWORD}" \
  '
  BEGIN {
    wrote_db = 0;
    wrote_migrator = 0;
  }
  /^DB_URL=/ {
    print "DB_URL=postgres://ss_ragbot_app:" app_pw "@localhost:5432/ss_ragbot";
    wrote_db = 1;
    next;
  }
  /^MIGRATOR_DB_URL=/ {
    print "MIGRATOR_DB_URL=postgres://ss_ragbot_migrator:" migrator_pw "@localhost:5432/ss_ragbot";
    wrote_migrator = 1;
    next;
  }
  {
    print;
  }
  END {
    if (!wrote_db) {
      print "DB_URL=postgres://ss_ragbot_app:" app_pw "@localhost:5432/ss_ragbot";
    }
    if (!wrote_migrator) {
      print "MIGRATOR_DB_URL=postgres://ss_ragbot_migrator:" migrator_pw "@localhost:5432/ss_ragbot";
    }
  }
  ' .env > "${tmp_env}"
mv "${tmp_env}" .env

echo "Local Postgres setup complete."
echo "Next:"
echo "  1. Run: npm run build"
echo "  2. Run: node dist/interfaces/cli.js db migrate"
