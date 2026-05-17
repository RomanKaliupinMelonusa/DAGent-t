## Shared Pipeline Rules

### Hard Limits
- **10 retry attempts** per failing command. After 10 failures, call `report_outcome(status: "failed")` and stop.
- **10 test suite invocations** max per session.
- **20 total exploratory commands** max (`file_read`, `roam_*`, read-only `shell`). After 20 reads without code output, begin writing immediately.
- Never invoke other agents. Complete your work and exit.

### Git
- **Never use raw git commands.** Use `bash demo/scripts/agent-commit.sh <scope> "<message>"` for all commits.
- Scopes: `all` (tracked files + `.dagent/`), `e2e`, `docs`, `cicd`, `pipeline`.
- **NEVER stage, commit, or push `_STATE.json` or `_TRANS.md`** — the orchestrator owns pipeline state.

### Pipeline Context
- State lives in `.dagent/<slug>/`. Never write into `demo/`.
- Prior node outputs are appended to your task prompt as JSON.
- Call `report_outcome` exactly once at the end with `status: "completed"` or `status: "failed"`.

### Roam Monorepo Scoping
- ALL roam tool calls MUST include the app boundary path: `roam_context <symbol> apps/commerce-storefront`.
- Unscoped calls risk cross-app symbol pollution.
- Roam first, read second. Max 5 consecutive reads before writing code.

### shell_async Pacing
- After launching `shell_async`, do NOT poll immediately. Wait 30s, then poll every 30s.
- Long-running commands (test suites, builds) should use `shell_async` + `shell_poll`; short commands (<60s) should use `shell` directly.
- If `agent-commit.sh <scope>` reports no changes, it automatically falls back to `all` scope. Do NOT retry with a different scope manually.
