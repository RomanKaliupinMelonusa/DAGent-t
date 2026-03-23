## Git Operations

**Never use raw git commands.** Always use:
- `bash tools/autonomous-factory/agent-commit.sh <scope> "<message>"` for commits
- `npm run pipeline:complete/fail` for state updates

`agent-commit.sh` auto-stages `package-lock.json` whenever any `package.json` is in the staged changeset. Do not manually stage lockfiles.
