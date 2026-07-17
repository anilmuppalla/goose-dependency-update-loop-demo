#!/usr/bin/env bash
set -euo pipefail

: "${TARGET_SHA:?TARGET_SHA is required}"

normalized_target="$(printf '%s' "$TARGET_SHA" | tr 'A-F' 'a-f')"
test "$(git rev-parse HEAD)" = "$normalized_target"

changed="$(git diff --name-only "$TARGET_SHA")"
test -n "$changed"

protected='^(\.github/|\.goose/|AGENTS\.md$|package\.json$|package-lock\.json$|scripts/validate-upgrade\.mjs$|scripts/check-repair-boundary\.sh$|test/validate-upgrade\.test\.js$|test/workflow-contract\.test\.js$|tsconfig\.json$)'
if printf '%s\n' "$changed" | grep -Eq "$protected"; then
  printf '%s\n' "Protected repair file changed:" >&2
  printf '%s\n' "$changed" | grep -E "$protected" >&2
  exit 1
fi

untracked="$(git ls-files --others --exclude-standard)"
if [ -n "$untracked" ]; then
  printf '%s\n' "Unexpected nonignored untracked files:" "$untracked" >&2
  exit 1
fi
