#!/usr/bin/env bash
set -euo pipefail

endpoint="${AI_USAGE_METER_URL:-http://localhost:8787}/api/limits/snapshot"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_file="${CODEX_LIMIT_SNAPSHOT_FILE:-$repo_root/.codex/limit-snapshots/codex.json}"
mode="${1:-}"

if [[ "$mode" == "--sample" ]]; then
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  payload="$(mktemp)"
  cat >"$payload" <<JSON
{
  "provider": "codex",
  "source": "sample-local-script",
  "capturedAt": "$now",
  "windows": [
    { "window": "5h", "usedPercent": 42 },
    { "window": "7d", "usedPercent": 18 }
  ]
}
JSON
elif [[ -f "$state_file" ]]; then
  payload="$state_file"
else
  exit 0
fi

curl -fsS -X POST "$endpoint" \
  -H "Content-Type: application/json" \
  --data @"$payload" >/dev/null

if [[ "$mode" == "--sample" ]]; then
  rm -f "$payload"
fi
