#!/usr/bin/env bash
# e2e-runner-pre.sh — Bring up a local PWA Kit dev server before running
# Playwright E2E specs.
#
# Thin shim over the shared dev-server lifecycle library. The body-aware
# readiness probe is selected automatically because the lifecycle-hooks
# middleware injects $E2E_READINESS_URL (declared in
# `.apm/apm.yml → apm.e2e.readiness.url`).
#
# Contract:
#   exit 0 = readiness probe returned ready.
#   exit 1 = dev server failed to come up; lib tails the server log.
#
# Env (provided by the orchestrator's lifecycle-hooks middleware):
#   SLUG, APP_ROOT, REPO_ROOT, BASE_BRANCH, ITEM_KEY,
#   E2E_READINESS_URL (+ optional READY_TIMEOUT_S / READY_MIN_BYTES /
#   READY_DENY_RE).

set -uo pipefail

if [[ -z "${E2E_READINESS_URL:-}" ]]; then
  echo "Pre: E2E_READINESS_URL not injected — declare apm.e2e.readiness.url in .apm/apm.yml" >&2
  exit 1
fi

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/dev-server-lifecycle.sh"
exec bash "$LIB" start
