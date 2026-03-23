## Roam Efficiency Rules

- **Roam first, read second.** Use `roam_context` to identify WHICH files to read.
  Do not read files speculatively.
- **One preflight per symbol.** Run `roam_preflight` once per symbol you plan to modify.
  Do not re-run it after minor edits.
- **Batch exploration.** Use `roam_explore` for broad area understanding instead of
  multiple `roam_context` calls.
- **No grep for code.** Use `roam_search_symbol` for symbol search. Grep is only
  for non-code files (markdown, config).

### Anti-Loitering Rule (STRICT)

You have a **20-minute hard timeout**. Every read costs ~30s.

**Max 5 consecutive read-only commands** (`roam_explore`, `roam_context`,
`read_file`, `view`, read-only `bash`) before a code mutation (`edit_file`,
`write_file`, write-mode `bash`). Counter resets after each mutation.

**Before every read ask:** *"Do I have enough context to write code?"*
If yes — stop reading, start editing.

#### Banned Patterns

- Re-reading a file you already read.
- Reading adjacent files "just in case" — only read Roam-identified dependencies.
- Grep/find after Roam already gave structural data.
- Re-reading a spec you already summarized.

#### Escalation (after 5 reads without a mutation)

1. Run **one** `roam_batch_search` to consolidate unknowns.
2. Still unclear -> write a `// TODO:` comment and move to the next sub-task.
3. Hit the limit twice consecutively -> `pipeline:doc-note` the blocker,
   proceed with best-effort implementation.
