#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h:h}"
MODE="${1:---dry-run}"
ACKNOWLEDGEMENT="${2:-}"
ENV_FILE="${PROPULSE_ENV_FILE:-${ROOT}/.env.local}"
POOLER_FILE="${ROOT}/supabase/.temp/pooler-url"

if [[ "$(/usr/bin/uname -m)" != "arm64" ]]; then
  print -u2 "Research-health migration commands are M5-only"
  exit 1
fi
if [[ ! -r "${ENV_FILE}" || ! -r "${POOLER_FILE}" ]]; then
  print -u2 "Untracked target database configuration is unavailable"
  exit 1
fi
if [[ "${MODE}" != "--dry-run" && "${MODE}" != "--apply" ]]; then
  print -u2 "Usage: $0 [--dry-run | --apply --acknowledge-private-migration]"
  exit 1
fi
if [[ "${MODE}" == "--apply" && "${ACKNOWLEDGEMENT}" != "--acknowledge-private-migration" ]]; then
  print -u2 "Apply requires --acknowledge-private-migration"
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"

POOLER_URL="$(
  cd "${ROOT}"
  PYTHONPATH="${ROOT}/ml/src/archive_v4_2" \
    "${ROOT}/ml/.venv/bin/python" -c \
    'from pathlib import Path; from validate_live_feature_migration import current_project_pooler_url, read_env; root = Path.cwd(); print(current_project_pooler_url(read_env(root / ".env.local"), (root / "supabase/.temp/pooler-url").read_text().strip()))'
)"

export PGPASSWORD="${SUPABASE_DB_PASSWORD}"
unset SUPABASE_DB_PASSWORD
trap 'unset PGPASSWORD' EXIT

cd "${ROOT}"
/opt/homebrew/bin/supabase migration list --db-url "${POOLER_URL}"
if [[ "${MODE}" == "--dry-run" ]]; then
  /opt/homebrew/bin/supabase db push --db-url "${POOLER_URL}" --dry-run
else
  /opt/homebrew/bin/supabase db push --db-url "${POOLER_URL}" --yes
fi
