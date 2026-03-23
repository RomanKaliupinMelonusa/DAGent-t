## Roam Structural Intelligence (MANDATORY)

You have access to the Roam MCP server, which provides structural code intelligence
via a pre-indexed semantic graph. You MUST use Roam tools as your PRIMARY method
for code exploration and pre-change analysis.

### MONOREPO SCOPING (MANDATORY)

This is a monorepo. Roam indexes the **entire repository**. You MUST append your app
boundary path to **ALL** roam tool calls to avoid cross-application symbol pollution.

- **Do NOT run:** `roam_context apiClient`
- **You MUST run:** `roam_context apiClient apps/sample-app`

This applies to ALL roam tools: `roam_understand`, `roam_context`, `roam_search_symbol`,
`roam_explore`, `roam_preflight`, `roam_prepare_change`, `roam_review_change`,
`roam_check_rules`, `roam_affected_tests`, `roam_test_gaps`, `roam_testmap`,
`roam_flag_dead`, `roam_orphan_routes`, `roam_dark_matter`, `roam_safe_delete`,
`roam_pr_diff`, `roam_pr_risk`, `roam_suggest_reviewers`.

**Exception:** `roam_index` operates on the full graph and does not accept a path boundary.

### STRICT RULES

1. **FORBIDDEN:** Do NOT use `grep_search`, `find`, `fd`, `ag`, `rg`, or `ls -R` to discover
   code structure. These are probabilistic text searches that waste tokens and miss
   structural relationships.

2. **MANDATORY before ANY code change:**
   - Call `roam_preflight` on the symbol(s) you plan to modify. This returns blast radius,
     affected tests, complexity, and architecture-rule violations.
   - If preflight shows >10 affected files, call `roam_prepare_change` for the full
     compound analysis (context + preflight + affected tests in one call).

3. **MANDATORY for code exploration:**
   - Use `roam_context` to find files and line ranges for a symbol (replaces grep).
   - Use `roam_search_symbol` for pattern-based symbol search (replaces grep_search).
   - Use `roam_explore` for broad codebase exploration (replaces list_dir + read_file loops).
   - Use `roam_understand` on first entry into an unfamiliar area of the codebase.

4. **MANDATORY after code changes:**
   - Call `roam_review_change` to verify the change's impact and identify regressions.
   - Call `roam_affected_tests` to identify which tests need to pass.

5. **For AST-level mutations (move/rename/extract):**
   - Use the `roam_mutate` MCP tool with the `dry_run: true` parameter to preview the mutation.
   - Verify the dry-run output is correct.
   - Use the `roam_mutate` MCP tool with `dry_run: false` to execute the mutation.
   - Run `roam_syntax_check` after mutation to verify no syntax errors were introduced.

### PERMITTED EXCEPTIONS

- `read_file` is still permitted for reading file contents AFTER Roam identifies the file.
- `grep_search` is permitted ONLY for searching within non-code files (markdown, config, JSON)
  where Roam has no structural data.
- Shell `grep` is permitted ONLY inside test output parsing (e.g., filtering Jest results).

### TOOL DECISION TREE

```
Need to find a symbol/function/class?
  -> roam_search_symbol (NOT grep_search)

Need to understand what a symbol does and who uses it?
  -> roam_context (NOT read_file on random files)

Need to understand the full codebase?
  -> roam_understand (NOT list_dir on every directory)

About to modify a file?
  -> roam_preflight first (NOT just edit_file)

Need to move/rename/extract code?
  -> roam_mutate MCP tool with dry_run: true, then dry_run: false (NOT manual cut-paste)

Just made changes, need to verify?
  -> roam_review_change (NOT re-running grep to check)
```

### PRE-COMPLETION GATE (MANDATORY)

Before calling `pipeline:complete`, you MUST run `roam_check_rules` on all files you modified
in this session. This performs a deterministic security, performance, and correctness audit.

- **SEC** (security), **PERF** (performance), **COR** (correctness) violations are **BLOCKING** — you must fix them before proceeding.
- **ARCH** (architecture) violations are **advisory** — fix if straightforward, otherwise note in your doc-note.
- If `roam_check_rules` is unavailable, skip this step and note the limitation in your completion message.

### ANTI-SHELL RULE

Do NOT run `roam` via shell (`bash`, `write_bash`). Use the MCP tools exclusively.
The MCP interface provides structured input/output and eliminates hallucinated CLI flags.

### EFFICIENCY

- Limit total Roam tool calls to 15 per session. If you need more, you're over-exploring.
- Use `roam_explore` for broad area understanding instead of multiple `roam_context` calls.
- If Roam tools are unavailable (MCP connection failed), fall back to standard tools and
  note this in your completion message.
