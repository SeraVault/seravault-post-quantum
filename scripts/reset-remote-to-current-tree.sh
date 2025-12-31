#!/usr/bin/env bash
# Force-replace a remote branch with the current working tree as a single commit.
# Usage: ./scripts/reset-remote-to-current-tree.sh <branch-name>

set -euo pipefail

TARGET_BRANCH="${1:-}"
if [[ -z "${TARGET_BRANCH}" ]]; then
  echo "Usage: $0 <branch-name>"
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
TMP_BRANCH="orphan-reset-${TARGET_BRANCH}-$(date +%s)"

echo "Creating orphan commit from current tree to replace remote branch '${TARGET_BRANCH}'..."
git checkout --orphan "${TMP_BRANCH}"
git add -A
git commit -m "Snapshot current tree"

echo "Force-pushing orphan commit to origin/${TARGET_BRANCH}..."
git push --force origin "${TMP_BRANCH}:${TARGET_BRANCH}"

echo "Restoring original branch '${CURRENT_BRANCH}'..."
git checkout "${CURRENT_BRANCH}"
git branch -D "${TMP_BRANCH}"

echo "Done. Remote branch '${TARGET_BRANCH}' now matches this snapshot. Local branch unchanged."
