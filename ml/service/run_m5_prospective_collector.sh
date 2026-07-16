#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h:h}"
ENV_FILE="${PROPULSE_ENV_FILE:-${ROOT}/.env.local}"

if [[ "$(/usr/bin/arch)" != "arm64" ]]; then
  print -u2 "Prospective collector must run on native Apple Silicon"
  exit 1
fi
if [[ ! -r "${ENV_FILE}" ]]; then
  print -u2 "Owner-only service environment is unavailable: ${ENV_FILE}"
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a
: "${VITE_SUPABASE_URL:?VITE_SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

export SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL}}"
export PATH="${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export COLLECTOR_ENABLED_SOURCES="pskreporter,rbn,dxcluster,solar"
export COLLECTOR_LOG_LEVEL="${COLLECTOR_LOG_LEVEL:-info}"
export POLL_PSKREPORTER="${POLL_PSKREPORTER:-300}"
export POLL_RBN="${POLL_RBN:-300}"
export POLL_DXCLUSTER="${POLL_DXCLUSTER:-120}"
export POLL_SOLAR="${POLL_SOLAR:-300}"
export POLL_AGGREGATOR="${POLL_AGGREGATOR:-300}"
export POLL_PRUNE="${POLL_PRUNE:-3600}"
export AGGREGATION_SETTLE_MINUTES="${AGGREGATION_SETTLE_MINUTES:-20}"
export RETENTION_SPOTS="${RETENTION_SPOTS:-7}"
export RETENTION_HEALTH="${RETENTION_HEALTH:-14}"
export PORT="${PROPULSE_COLLECTOR_HEALTH_PORT:-8091}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

NODE="$(command -v node)"
[[ "$(${NODE} -p 'process.arch')" == "arm64" ]] || {
  print -u2 "Collector Node runtime is not native arm64"
  exit 1
}
[[ -f "${ROOT}/collector/dist/index.js" ]] || {
  print -u2 "Build collector/dist/index.js before installing the schedule"
  exit 1
}

exec /usr/bin/caffeinate -dimsu "${NODE}" "${ROOT}/collector/dist/index.js"
