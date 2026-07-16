#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h:h}"
ENV_FILE="${PROPULSE_ENV_FILE:-${ROOT}/.env.local}"
ARTIFACT_ROOT="${PROPULSE_ML_ARTIFACT_ROOT:-${HOME}/Library/Application Support/PropulseML}"
RUNTIME_ROOT="${ARTIFACT_ROOT}/forecast_archive"
RECEIPT_DIR="${RUNTIME_ROOT}/receipts"
LOCK_DIR="${RUNTIME_ROOT}/run.lock"

if [[ "$(/usr/bin/arch)" != "arm64" ]]; then
  print -u2 "Forecast archive must run on native Apple Silicon"
  exit 1
fi
if [[ ! -r "${ENV_FILE}" ]]; then
  print -u2 "Untracked service environment is unavailable: ${ENV_FILE}"
  exit 1
fi

mkdir -p "${RUNTIME_ROOT}" "${RECEIPT_DIR}"
chmod 700 "${RUNTIME_ROOT}" "${RECEIPT_DIR}"
if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  if [[ -r "${LOCK_DIR}/pid" ]] && kill -0 "$(<"${LOCK_DIR}/pid")" 2>/dev/null; then
    print -u2 "Forecast archive is already running"
    exit 75
  fi
  rm -f "${LOCK_DIR}/pid"
  rmdir "${LOCK_DIR}"
  mkdir "${LOCK_DIR}"
fi
print -r -- "$$" > "${LOCK_DIR}/pid"
cleanup_lock() {
  rm -f "${LOCK_DIR}/pid" 2>/dev/null || true
  rmdir "${LOCK_DIR}" 2>/dev/null || true
}
trap cleanup_lock EXIT

set -a
source "${ENV_FILE}"
set +a
: "${VITE_SUPABASE_URL:?VITE_SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
export SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL}}"
export PATH="${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

NODE="$(command -v node)"
PYTHON="${ROOT}/ml/.venv/bin/python"
[[ -x "${PYTHON}" ]] || { print -u2 "M5 Python environment is unavailable"; exit 1; }
[[ -f "${ROOT}/collector/dist/forecastArchive.js" ]] || {
  print -u2 "Build collector/dist/forecastArchive.js before installing the schedule"
  exit 1
}

/usr/bin/caffeinate -dimsu "${NODE}" \
  "${ROOT}/collector/dist/forecastArchive.js" \
  --receipt-dir "${RECEIPT_DIR}"

"${PYTHON}" "${ROOT}/ml/service/summarize_forecast_archive.py" \
  --receipt-dir "${RECEIPT_DIR}" \
  --status-output "${RUNTIME_ROOT}/forecast_archive_status.json" \
  --readiness-output "${RUNTIME_ROOT}/futurecast_readiness.json" \
  --minimum-days 90
