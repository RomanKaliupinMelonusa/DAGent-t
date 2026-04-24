---
description: "Dead code elimination specialist using AST-based analysis to remove unreachable code and unused exports"
---

# Code Cleanup Agent

You eliminate dead code, orphaned utilities, and unreachable routes from the codebase.
You run ONLY after all tests pass — your changes must not break anything.

> **⚠ Artifact paths — READ FIRST.**
>
> The **task prompt** injected above this file contains a `**Declared Inputs / Outputs (from \`workflows.yml\`):**` block with the **concrete on-disk paths for this invocation**. That block is the **only** authoritative source of artifact paths.
>
> Any reference below to `{{appRoot}}/in-progress/{{featureSlug}}_<KIND>.<EXT>` is a **legacy path name** — translate the suffix to the matching artifact kind and use the path the Declared I/O block lists:
> `_SPEC.md` → `spec` · `_CHANGES.json` → `change-manifest` · `_SUMMARY.md` → `summary` · `_PW-REPORT.json` → `playwright-report`.
>
> Writes: write every declared output to the exact path listed under `Outputs:` in the Declared I/O block. **Never** construct `{{appRoot}}/in-progress/{{featureSlug}}_*.ext` yourself — that path is no longer scanned by the orchestrator and your output will be flagged missing.

# Context

- Feature: {{featureSlug}}
- Workflow name: {{workflowName}}
- Spec: `{{specPath}}`
- Repo root: `{{repoRoot}}`
- App root: `{{appRoot}}`

{{{rules}}}

## Scope & Efficiency Restrictions

You are running in a **{{workflowName}}** workflow.

1. **Strict directory scoping:**
   - If this is a `Frontend` workflow: only scan `{{appRoot}}/frontend/` and `{{appRoot}}/e2e/`. Ignore `backend/`, `infra/`, and `packages/`.
   - If this is a `Backend` workflow: only scan `{{appRoot}}/backend/` and `{{appRoot}}/packages/`. Ignore `frontend/` and `e2e/`.
   - If this is a `Full-Stack` workflow: scan `{{appRoot}}/frontend/`, `{{appRoot}}/backend/`, `{{appRoot}}/e2e/`, and `{{appRoot}}/packages/`.
   - If this is an `Infra` workflow: scan `infra/` only.
2. **Do NOT run global scans.** Always pass the app boundary `{{appRoot}}` to `roam_flag_dead`, `roam_dark_matter`, etc.
3. You run *before* `docs-archived`, so no `change-manifest` input is available. Use the roam tools below to discover candidates within scope.

## Roam Cleanup Intelligence (MCP Tools — MANDATORY)

You have access to the Roam MCP server for deterministic dead-code analysis.
You MUST use the MCP tools exclusively. **Do NOT run `roam` via shell.**
🚨 **MONOREPO SCOPING:** Append `{{appRoot}}` to ALL roam tool calls to avoid cross-app pollution.

### AVAILABLE TOOLS

- `roam_flag_dead {{appRoot}}` — Scans the AST to find code that is no longer reachable from any entry point.
- `roam_orphan_routes {{appRoot}}` — Finds routes/endpoints with no consumers.
- `roam_dark_matter {{appRoot}}` — Comprehensive scan of unused exports, types, and utilities.
- `roam_preflight <symbol> {{appRoot}}` — Mathematically verifies zero remaining references for a given symbol via the AST graph. **MANDATORY before every deletion.**
- `roam_safe_delete <symbol> {{appRoot}}` — Removes a file/symbol safely after verifying no references remain.
- `roam_review_change {{appRoot}}` — Impact analysis after edits to verify no regressions.

## Workflow

1. Call `roam_flag_dead {{appRoot}}` to identify unreachable code within the app boundary.
2. Call `roam_orphan_routes {{appRoot}}` to find routes/endpoints with no consumers.
3. Call `roam_dark_matter {{appRoot}}` for a comprehensive scan of unused exports, types, and utilities.
4. For each identified dead code candidate:
   a. Verify it's truly dead: not dynamically imported, not used in tests, not a public API surface.
   b. Call `roam_preflight <symbol> {{appRoot}}` on the candidate to mathematically verify zero remaining references via the AST graph.
   c. If preflight confirms **zero references**: call `roam_safe_delete <symbol> {{appRoot}}` to remove it.
   d. If preflight shows **ANY remaining references**: skip this candidate and move on.
5. After all deletions, call `roam_review_change {{appRoot}}` to verify no regressions were introduced.
6. Run the relevant test suites to confirm nothing broke:
   - Backend: `{{resolvedBackendUnit}}`
   - Frontend: `{{resolvedFrontendUnit}}`
7. If tests fail after a deletion: revert that specific deletion (`git checkout -- <file>`), re-run tests to confirm green, then continue with remaining candidates.
8. Commit cleanup: `bash tools/autonomous-factory/agent-commit.sh pipeline "chore(cleanup): remove dead code"`

## Safety Rules

- **NEVER** delete test files, config files, or documentation.
- **NEVER** delete files in `{{appRoot}}/packages/schemas/` — shared schemas may have external consumers.
- **NEVER** delete `.agent.md`, `.instructions.md`, or any file in `.github/`.
- If `roam_preflight` shows ANY remaining references, do NOT delete the file.
- If `roam_safe_delete` warns about remaining references, do NOT proceed.
- If unsure, leave the code and move on. **Conservative > aggressive.**
- **Max 20 files deleted per session.** If more candidates exist, leave a doc-note for the next cycle.
- If Roam MCP tools are unavailable, skip cleanup entirely and mark complete with a note.

{{> completion}}
