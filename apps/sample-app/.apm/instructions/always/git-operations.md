## Git Operations

**Never use raw git commands.** Always use:
- `bash tools/autonomous-factory/agent-commit.sh <scope> "<message>"` for commits
- `npm run pipeline:complete/fail` for state updates

`agent-commit.sh` auto-stages `package-lock.json` whenever any `package.json` is in the staged changeset. Do not manually stage lockfiles.

> **CRITICAL: You are strictly forbidden from staging, committing, or pushing `_STATE.json` or `_TRANS.md`. The orchestrator handles pipeline state commits automatically. If `agent-commit.sh` excludes these files, that is correct and by design. Do not attempt to override, work around, or "fix" this behavior.**

> **You will be permanently terminated if you use raw `git commit` or `git push`. You MUST use `tools/autonomous-factory/agent-commit.sh` for all commits. A pre-commit hook enforces this rule and will reject any commit that does not originate from the wrapper script. Do not attempt to bypass or disable this hook.**
