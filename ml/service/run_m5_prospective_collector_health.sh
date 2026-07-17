#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h:h}"
ENV_FILE="${PROPULSE_ENV_FILE:-${ROOT}/.env.local}"
ARTIFACT_ROOT="${PROPULSE_ML_ARTIFACT_ROOT:-${HOME}/Library/Application Support/PropulseML}"
RUNTIME_ROOT="${ARTIFACT_ROOT}/prospective_capture"

if [[ "$(/usr/bin/arch)" != "arm64" ]]; then
  print -u2 "Prospective health check must run on native Apple Silicon"
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

mkdir -p "${RUNTIME_ROOT}/receipts"
chmod 700 "${RUNTIME_ROOT}" "${RUNTIME_ROOT}/receipts"

exec "${ROOT}/ml/.venv/bin/python" \
  "${ROOT}/ml/service/check_m5_prospective_capture_health.py" \
  --receipt-dir "${RUNTIME_ROOT}/receipts" \
  --status-output "${RUNTIME_ROOT}/prospective_capture_readiness.json" \
  --state-output "${RUNTIME_ROOT}/prospective_capture_alert_state.json" \
  --minimum-continuity-hours 24 \
  --notify-local
