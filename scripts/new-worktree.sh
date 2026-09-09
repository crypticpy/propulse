#!/usr/bin/env bash
set -euo pipefail

# scripts/new-worktree.sh <slug> [<branch>]
#
# One-command worktree bootstrap (see issue #739). Creates (or repairs) a
# worktree at <primary-checkout>/.worktrees/<slug>, installs root/bridge/
# collector dependencies with `npm ci`, links the shared ml/.venv when one
# exists, and makes sure git hooks are configured.
#
# Safe to re-run against an existing worktree: it will not error on things
# that are already done, and it will fill in anything that is missing
# (dependencies, the venv symlink, hooks). This is the case an agent hits
# most often: it already failed mid-bootstrap once and is retrying.
#
# Usage:
#   npm run worktree:new -- <slug> [<branch>]
#   scripts/new-worktree.sh <slug> [<branch>]
#
# <branch> defaults to feat/<slug> when omitted.

usage() {
  echo "Usage: npm run worktree:new -- <slug> [<branch>]" >&2
  echo "   or: scripts/new-worktree.sh <slug> [<branch>]" >&2
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

SLUG="$1"
BRANCH="${2:-feat/${SLUG}}"

if [[ ! "$SLUG" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || [[ "$SLUG" == *".."* ]]; then
  echo "[worktree:new] Invalid slug '${SLUG}': use letters, digits, '.', '_', '-', and don't start with one or contain '..'." >&2
  exit 1
fi

# Resolve the primary checkout instead of hardcoding a path: `git
# rev-parse --git-common-dir` always points at the shared .git directory
# no matter which worktree (or the primary checkout itself) this script is
# run from; its parent is the primary working tree.
GIT_COMMON_DIR="$(git rev-parse --git-common-dir)"
GIT_COMMON_DIR="$(cd "$GIT_COMMON_DIR" && pwd)"
PRIMARY_ROOT="$(dirname "$GIT_COMMON_DIR")"
WORKTREE_PATH="${PRIMARY_ROOT}/.worktrees/${SLUG}"

echo "[worktree:new] Primary checkout: ${PRIMARY_ROOT}"
echo "[worktree:new] Target worktree:  ${WORKTREE_PATH}"

cd "$PRIMARY_ROOT"

echo "[worktree:new] Fetching origin..."
git fetch origin

REGISTERED_WORKTREES="$(git worktree list --porcelain | awk '/^worktree /{ $1=""; sub(/^ /, ""); print }')"

if [[ -d "$WORKTREE_PATH" ]]; then
  if ! grep -Fxq "$WORKTREE_PATH" <<<"$REGISTERED_WORKTREES"; then
    echo "[worktree:new] ${WORKTREE_PATH} exists on disk but is not a registered git worktree. Refusing to touch it." >&2
    exit 1
  fi
  echo "[worktree:new] Worktree already exists; repairing/updating rather than creating."
else
  echo "[worktree:new] Creating worktree on branch ${BRANCH} from origin/main..."
  git worktree add -b "$BRANCH" "$WORKTREE_PATH" origin/main
fi

WORKTREE_COUNT="$(git worktree list | wc -l | tr -d ' ')"
WORKTREE_WARN_THRESHOLD=50
if (( WORKTREE_COUNT > WORKTREE_WARN_THRESHOLD )); then
  echo "[worktree:new] WARNING: ${WORKTREE_COUNT} worktrees are registered (warn threshold ${WORKTREE_WARN_THRESHOLD})." >&2
  echo "[worktree:new]          Abandoned worktrees hide unpushed work from the issue board. Run 'git worktree list' and remove ones that are done." >&2
fi

cd "$WORKTREE_PATH"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "[worktree:new] Worktree is on branch ${CURRENT_BRANCH}."

echo "[worktree:new] Installing root dependencies (npm ci)..."
npm ci

if [[ -f bridge/package-lock.json ]]; then
  echo "[worktree:new] Installing bridge dependencies (npm ci)..."
  (cd bridge && npm ci)
else
  echo "[worktree:new] Skipping bridge install: no bridge/package-lock.json."
fi

if [[ -f collector/package-lock.json ]]; then
  echo "[worktree:new] Installing collector dependencies (npm ci)..."
  (cd collector && npm ci)
else
  echo "[worktree:new] Skipping collector install: no collector/package-lock.json."
fi

# The ML venv symlink is conditional (only when a source venv exists) and
# verified with exactly the import check scripts/pre-push-checks.mjs runs,
# so a drifted venv is reported now instead of failing at push time.
ML_VENV_SRC="${PRIMARY_ROOT}/ml/.venv"
ML_VENV_DEST="ml/.venv"

if [[ -e "$ML_VENV_DEST" && ! -L "$ML_VENV_DEST" ]]; then
  echo "[worktree:new] ml/.venv already exists here as a real directory (not a symlink); leaving it alone."
elif [[ -d "$ML_VENV_SRC" ]]; then
  if [[ -L "$ML_VENV_DEST" && "$(readlink "$ML_VENV_DEST")" == "$ML_VENV_SRC" ]]; then
    echo "[worktree:new] ml/.venv already symlinked to ${ML_VENV_SRC}."
  else
    echo "[worktree:new] Symlinking ml/.venv -> ${ML_VENV_SRC}"
    ln -sfn "$ML_VENV_SRC" "$ML_VENV_DEST"
  fi
else
  echo "[worktree:new] No ml/.venv found at ${ML_VENV_SRC}; skipping symlink (ML/DB changes will need a venv provisioned separately)."
fi

if [[ -x "${ML_VENV_DEST}/bin/python" ]]; then
  if "${ML_VENV_DEST}/bin/python" -c "import joblib, polars, psycopg, pyarrow, xgboost" >/dev/null 2>&1; then
    echo "[worktree:new] ml/.venv verified: joblib, polars, psycopg, pyarrow, xgboost import cleanly."
  else
    echo "[worktree:new] WARNING: ${ML_VENV_DEST} is present but failed to import one of joblib/polars/psycopg/pyarrow/xgboost." >&2
    echo "[worktree:new]          That is exactly what scripts/pre-push-checks.mjs checks; ML/DB pushes from this worktree will fail until the venv matches the M5 environment." >&2
  fi
fi

# core.hooksPath is stored in the shared .git/config (git rev-parse
# --git-common-dir), not per-worktree, so once any worktree has run this the
# setting is already global. Running it again is a cheap, idempotent no-op
# (git config set + chmod +x on already-executable files) -- the script does
# not skip it based on assuming a fresh worktree has never set it.
echo "[worktree:new] Configuring git hooks..."
npm run hooks:install

echo "[worktree:new] Done. ${WORKTREE_PATH} is ready on branch $(git rev-parse --abbrev-ref HEAD)."
