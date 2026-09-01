#!/usr/bin/env bash
# Stable hash of "all open changes vs origin/main" — committed-not-merged + staged + unstaged
# + untracked file contents.
#
# Used by BOTH the review (to stamp .pr-self-review.json) and the PreToolUse hook (to detect
# that the diff moved since the last PASS). Always go through this one script: two
# implementations of "has the diff moved?" drift apart, and then the freshness check is
# theatre rather than a check.
set -euo pipefail

BASE="$(git merge-base origin/main HEAD 2>/dev/null || git rev-parse HEAD)"

{
  git diff "$BASE"
  # Untracked files: name + contents, so a brand-new file invalidates a stale PASS.
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    printf '\n--- untracked: %s ---\n' "$f"
    cat -- "$f" 2>/dev/null || true
  done < <(git ls-files --others --exclude-standard | sort)
} | shasum -a 256 | awk '{print $1}'
