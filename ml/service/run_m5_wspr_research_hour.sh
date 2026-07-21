#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h:h}"
ENV_FILE="${PROPULSE_ENV_FILE:-${ROOT}/.env.local}"
ARTIFACT_ROOT="${PROPULSE_ML_ARTIFACT_ROOT:-/Volumes/Projects/PropulseML}"
KEYCHAIN_SERVICE="${PROPULSE_WSPR_KEYCHAIN_SERVICE:-propulse-wspr-completion-v1}"
SECRET_FILE="${PROPULSE_WSPR_SECRET_FILE:-${ARTIFACT_ROOT}/secrets/wspr_completion_secret}"

if [[ ! -r "${ENV_FILE}" ]]; then
  print -u2 "Untracked service environment is unavailable: ${ENV_FILE}"
  exit 1
fi
if [[ "${PROPULSE_WSPR_LIVE_RESEARCH_ENABLED:-}" != "true" ]]; then
  print -u2 "Research ingest requires PROPULSE_WSPR_LIVE_RESEARCH_ENABLED=true"
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

: "${VITE_SUPABASE_URL:?VITE_SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

export PROPULSE_FEATURE_STORE_URL="${PROPULSE_FEATURE_STORE_URL:-${VITE_SUPABASE_URL}}"
export PROPULSE_FEATURE_STORE_SERVICE_KEY="${PROPULSE_FEATURE_STORE_SERVICE_KEY:-${SUPABASE_SERVICE_ROLE_KEY}}"
if [[ -z "${PROPULSE_WSPR_COMPLETION_SECRET:-}" ]]; then
  if keychain_secret=$(/usr/bin/security find-generic-password \
    -a "${USER}" -s "${KEYCHAIN_SERVICE}" -w 2>/dev/null); then
    export PROPULSE_WSPR_COMPLETION_SECRET="${keychain_secret}"
  elif [[ -r "${SECRET_FILE}" ]]; then
    export PROPULSE_WSPR_COMPLETION_SECRET="$(<"${SECRET_FILE}")"
  fi
fi

: "${PROPULSE_WSPR_COMPLETION_SECRET:?completion signing secret is required}"

unset SUPABASE_SERVICE_ROLE_KEY VITE_SUPABASE_ANON_KEY

SPOOL_DIR="${ARTIFACT_ROOT}/live_wspr_spool"
MANIFEST_DIR="${ARTIFACT_ROOT}/live_wspr_manifests"
MANIFEST="${MANIFEST_DIR}/latest.json"
RECEIPT_DIR="${ARTIFACT_ROOT}/live_wspr_receipts"
COMPLETED_MANIFEST_DIR="${MANIFEST_DIR}/completed"
mkdir -p "${SPOOL_DIR}" "${MANIFEST_DIR}" "${RECEIPT_DIR}" \
  "${COMPLETED_MANIFEST_DIR}"
RUN_DIR="$(mktemp -d "${ARTIFACT_ROOT}/live_wspr_run.XXXXXX")"
CONNECTOR_RESULT="${RUN_DIR}/connector.json"
SCHEDULER_RESULT="${RUN_DIR}/scheduler.json"
RUN_STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cleanup_run_dir() {
  rm -f "${CONNECTOR_RESULT}" "${SCHEDULER_RESULT}" 2>/dev/null || true
  rmdir "${RUN_DIR}" 2>/dev/null || true
}
trap cleanup_run_dir EXIT

TARGET_ARGUMENTS=()
if [[ -n "${PROPULSE_WSPR_TARGET_HOUR:-}" ]]; then
  TARGET_ARGUMENTS=(--target-hour "${PROPULSE_WSPR_TARGET_HOUR}")
fi

/usr/bin/caffeinate -dimsu "${ROOT}/ml/.venv/bin/python" \
  "${ROOT}/ml/service/wspr_live_connector.py" \
  --acknowledge-research-only \
  "${TARGET_ARGUMENTS[@]}" \
  --spool-dir "${SPOOL_DIR}" \
  --manifest-output "${MANIFEST}" \
  --result-output "${CONNECTOR_RESULT}" \
  --page-size 100

/usr/bin/caffeinate -dimsu "${ROOT}/ml/.venv/bin/python" \
  "${ROOT}/ml/service/wspr_scheduler.py" \
  --completion-manifest "${MANIFEST}" \
  --workers 2 \
  --threads-per-band 9 \
  --page-size 100 \
  --retention-hours 30 \
  --result-output "${SCHEDULER_RESULT}"

"${ROOT}/ml/.venv/bin/python" \
  "${ROOT}/ml/service/write_wspr_run_receipt.py" \
  --connector-result "${CONNECTOR_RESULT}" \
  --scheduler-result "${SCHEDULER_RESULT}" \
  --manifest "${MANIFEST}" \
  --receipt-dir "${RECEIPT_DIR}" \
  --completed-manifest-dir "${COMPLETED_MANIFEST_DIR}" \
  --started-at "${RUN_STARTED}" \
  --cleanup-dir "${RUN_DIR}"
