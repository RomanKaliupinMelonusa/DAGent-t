## Git Operations

**Never use raw git commands.** Always use:
- `bash tools/autonomous-factory/agent-commit.sh <scope> "<message>"` for commits
- `npm run pipeline:complete/fail` for state updates

`agent-commit.sh` auto-stages `package-lock.json` whenever any `package.json` is in the staged changeset. Do not manually stage lockfiles.

### Commit Scope Reference

| Scope | Stages these paths |
|---|---|
| `all` | all tracked files + `in-progress/` |
| `e2e` | `e2e/`, `in-progress/` |
| `docs` | `docs/`, `archive/`, `in-progress/`, READMEs |
| `cicd` | `.github/`, `in-progress/` |
| `pipeline` | `in-progress/` |

### Cross-Scope Commits

If your changes span multiple directories, use `all` scope or make separate commits:
1. `agent-commit.sh all "feat(storefront): <description>"` for storefront changes
2. `agent-commit.sh cicd "fix(ci): ..."` for `.github/` changes

**CI/CD files (`.github/workflows/`) are NOT covered by `all` scope in some configurations.** If you modify any workflow file, verify it is staged or use the `cicd` scope explicitly.

> **CRITICAL: You are strictly forbidden from staging, committing, or pushing `_STATE.json` or `_TRANS.md`. The orchestrator handles pipeline state commits automatically. If `agent-commit.sh` excludes these files, that is correct and by design. Do not attempt to override, work around, or "fix" this behavior.**
