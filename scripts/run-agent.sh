#!/usr/bin/env bash
# run-agent.sh — Launch the orchestrator detached from the editor session.
#
# Wraps `npm run agent:run` so a VS Code window reload, terminal close, or
# SSH disconnect doesn't take an in-flight feature run with it. Two modes:
#
#   1. systemd transient scope (preferred when systemd-run --user works)
#      — applies a MemoryMax cgroup cap (defaults to 2G; override via
#      DAGENT_MEMORY_MAX) and gives a clean `journalctl --user -u <unit>`
#      follow command.
#   2. setsid + nohup fallback — for environments without a user systemd
#      session (most devcontainers). Logs to .dagent/_runs/<slug>.log,
#      writes the PID to .dagent/_runs/<slug>.pid.
#
# Both modes share the same `.dagent/<slug>/_state.json`, so a foreground
# `npm run agent:run` for the same slug later resumes cleanly.
#
# Usage:
#   scripts/run-agent.sh --app apps/<app> --workflow <name> \
#     --spec-file <path> <feature-slug>
#
# All arguments are forwarded verbatim to the orchestrator CLI; see
# tools/autonomous-factory/src/entry/cli.ts.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat >&2 <<EOF
Usage: $0 [orchestrator-args...] <feature-slug>

Forwards arguments to \`npm run agent:run\` but launches it detached so
VS Code reloads / terminal closes don't kill the run.

Examples:
  $0 --app apps/sample-app --workflow full-stack \\
    --spec-file /path/to/spec.md my-feature

  $0 --app apps/commerce-storefront --workflow storefront \\
    --spec-file /path/to/spec.md my-feature

Environment:
  DAGENT_MEMORY_MAX  cgroup memory cap when systemd-run is available
                     (default: 2G). Ignored in the setsid fallback.

See tools/autonomous-factory/README.md ("Detached mode") for follow-log
commands and cleanup instructions.
EOF
}

if [ "$#" -eq 0 ] || [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 2
fi

# Derive the feature slug from the trailing positional argument. The
# orchestrator CLI (parseCli in src/entry/cli.ts) takes the slug as the
# first non-flag positional, but argv order in practice always trails it
# after the `--app` / `--workflow` / `--spec-file` flag pairs, so the
# last arg is the slug. Skip values that look like flags (start with `-`)
# in case the caller put the slug elsewhere; in that ambiguous case fall
# back to a timestamped placeholder so log/pid filenames are still safe.
SLUG="${!#}"
case "$SLUG" in
  -*|"") SLUG="dagent-$(date +%s)" ;;
esac

cd "$REPO_ROOT"

if command -v systemd-run >/dev/null 2>&1 \
  && systemd-run --user --version >/dev/null 2>&1; then
  UNIT="dagent-${SLUG}-$(date +%s)"
  echo "[run-agent] launching via systemd transient scope" >&2
  echo "[run-agent] unit: ${UNIT}" >&2
  echo "[run-agent] follow logs: journalctl --user -u ${UNIT} -f" >&2
  echo "[run-agent] stop:        systemctl --user stop ${UNIT}" >&2
  exec systemd-run --user --scope --quiet \
    --unit="${UNIT}" \
    -p "MemoryMax=${DAGENT_MEMORY_MAX:-2G}" \
    -- npm run agent:run -- "$@"
fi

# Fallback: setsid + nohup, disowned so the parent shell can exit.
RUNS_DIR="${REPO_ROOT}/.dagent/_runs"
mkdir -p "$RUNS_DIR"
LOG_FILE="${RUNS_DIR}/${SLUG}.log"
PID_FILE="${RUNS_DIR}/${SLUG}.pid"

setsid nohup npm run agent:run -- "$@" \
  >"$LOG_FILE" 2>&1 </dev/null &
RUN_PID=$!
disown "$RUN_PID" 2>/dev/null || true
echo "$RUN_PID" >"$PID_FILE"

echo "[run-agent] systemd-run --user unavailable; using setsid+nohup" >&2
echo "[run-agent] pid:         ${RUN_PID}" >&2
echo "[run-agent] log:         ${LOG_FILE}" >&2
echo "[run-agent] follow logs: tail -f ${LOG_FILE}" >&2
echo "[run-agent] stop:        kill \$(cat ${PID_FILE})" >&2
