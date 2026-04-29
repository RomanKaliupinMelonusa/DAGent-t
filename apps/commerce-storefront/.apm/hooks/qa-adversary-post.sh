#!/usr/bin/env bash
# qa-adversary-post.sh — Tear down the dev server started by the pre-hook
# and remove the transient Playwright artefacts that the qa-adversary
# agent emits during its run.
#
# The qa-adversary prompt promises the orchestrator deletes its
# transient `e2e/_qa_<slug>.spec.ts` after the run. Historically that
# cleanup lived in `e2e-runner-post.sh`, which fires BEFORE qa-adversary
# in the DAG and was therefore a no-op. Meanwhile the agent itself ran
# `agent-commit.sh e2e ...` mid-session, so the transient spec landed in
# the feature branch and the PR (real incident on
# product-quick-view-plp run, 2026-04-28).
#
# This hook now owns the cleanup. It deletes the file from the working
# tree, unstages it from git, and rewrites the qa-adversary commit so
# the spec never reaches `origin`:
#   - If HEAD is qa-adversary's own commit (subject starts with
#     `test(qa)` per the conventional-commits style the agent uses), we
#     amend it (`git commit --amend --no-edit`) — the diff in the PR
#     remains truthful (qa-adversary never actually authored the spec
#     for permanent record).
#   - Otherwise we add a single `chore(qa): drop transient qa-adversary
#     spec` commit so we don't tamper with someone else's work.
#
# Server lifecycle and Playwright reap mirror `e2e-runner-post.sh`;
# qa-adversary brings the dev server up via the shared pre-hook and
# tears it down here.
#
# Contract:
#   exit 0 = cleanup attempted (failures are non-fatal by design).
#
# Env (provided by the orchestrator's lifecycle-hooks middleware):
#   SLUG, APP_ROOT, REPO_ROOT, BASE_BRANCH, ITEM_KEY

set -uo pipefail

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/dev-server-lifecycle.sh"
bash "$LIB" stop || true

# ─── Playwright browsers — clean up after the test run ──────────────────
# CRITICAL: scope to the Playwright binary path only. A broad
# `pkill -f 'chromium|chrome'` kills VS Code remote-server helpers in the
# devcontainer and forces a window reload (real incident, 2026-04-19).
pkill -f '\.cache/ms-playwright/.*/(chrome|headless_shell)(\s|$)' 2>/dev/null || true
rm -rf /tmp/.org.chromium.Chromium.* 2>/dev/null || true

# ─── QA-adversary transient artefacts ───────────────────────────────────
# The orchestrator's lifecycle middleware passes APP_ROOT and REPO_ROOT
# as ABSOLUTE paths (see src/handlers/middlewares/lifecycle-hooks.ts:
# `APP_ROOT: ctx.appRoot, REPO_ROOT: ctx.repoRoot`, both resolved by
# entry/cli.ts via path.resolve). cwd at hook entry == APP_ROOT.
REPO_ROOT_ABS="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
APP_ROOT_ABS="${APP_ROOT:-${REPO_ROOT_ABS}/apps/commerce-storefront}"

# Operate from the repo root so git pathspecs and globs resolve
# uniformly. Using `git -C` would also work, but `cd` keeps the
# follow-up `git ls-files`/`git rm`/`git commit` invocations terse.
cd "${REPO_ROOT_ABS}" || exit 0

# Compute APP_ROOT relative to REPO_ROOT for nicer git pathspecs and
# log lines. Falls back to absolute on cross-mount surprises (still
# valid pathspecs for git as long as the path is inside the worktree).
if [[ "${APP_ROOT_ABS}" == "${REPO_ROOT_ABS}/"* ]]; then
  APP_ROOT_REL="${APP_ROOT_ABS#${REPO_ROOT_ABS}/}"
else
  APP_ROOT_REL="${APP_ROOT_ABS}"
fi

# Glob of transient artefacts qa-adversary may leave behind. Adding a
# new entry here is the only change needed if the agent emits more.
declare -a TRANSIENTS
TRANSIENTS=(
  "${APP_ROOT_REL}/e2e/_qa_"*.spec.ts
  "${APP_ROOT_REL}/qa-pw-report.json"
  "${APP_ROOT_REL}/qa-stderr.log"
)

removed_any=false
for rel in "${TRANSIENTS[@]}"; do
  # Glob may not match anything — bash leaves the pattern literal in
  # that case. Skip patterns that contain a literal `*`.
  if [[ "$rel" == *"*"* ]]; then
    continue
  fi
  abs="${REPO_ROOT_ABS}/${rel}"
  # Untrack from git index (handles both tracked + cached). Falls back
  # to plain rm for files git never knew about.
  if git ls-files --error-unmatch -- "$rel" >/dev/null 2>&1; then
    git rm -f --quiet -- "$rel" 2>/dev/null || rm -f "$abs" 2>/dev/null || true
    removed_any=true
  elif [[ -e "$abs" ]]; then
    rm -f "$abs" 2>/dev/null || true
  fi
done

# Anything to commit?
if [[ "$removed_any" == true ]] && ! git diff --cached --quiet 2>/dev/null; then
  # Detect HEAD ownership: if the most recent commit looks like a
  # qa-adversary commit (conventional-commits `test(qa):` prefix), the
  # transient came from that commit and we want to rewrite it.
  head_subject="$(git log -1 --pretty=%s 2>/dev/null || true)"
  if [[ "$head_subject" =~ ^test\(qa\) ]]; then
    # Edge case: if the qa-adversary commit ONLY introduced the
    # transient (very common — the agent's mid-session commit was just
    # the spec), `--amend` would leave it empty and git refuses. In
    # that case drop the commit entirely so the spec never appears in
    # history at all. The deletion is already staged, but we need a
    # clean working tree relative to HEAD^.
    if git diff --cached --quiet HEAD^ 2>/dev/null; then
      # Staged state == HEAD^ tree. Drop the qa-adversary commit.
      git reset --hard HEAD^ >/dev/null 2>&1 || true
    else
      # Real changes remain — amend keeps them under the original
      # `test(qa)` subject so PR history is honest.
      git commit --amend --no-edit --no-verify >/dev/null 2>&1 || true
    fi
  else
    git commit --no-verify -m "chore(qa): drop transient qa-adversary spec" >/dev/null 2>&1 || true
  fi
fi

exit 0
