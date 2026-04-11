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
