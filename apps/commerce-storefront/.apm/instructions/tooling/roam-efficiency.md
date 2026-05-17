## Roam Efficiency Rules

- **Roam first, read second.** Use `roam_context` to identify WHICH files to read.
  Do not read files speculatively.
- **One preflight per symbol.** Run `roam_preflight` once per symbol you plan to modify.
  Do not re-run it after minor edits.
- **Batch exploration.** Use `roam_explore` for broad area understanding instead of
  multiple `roam_context` calls.
- **No grep for code.** Use `roam_search_symbol` for symbol search. Grep is only
  for non-code files (markdown, config).

### Roam vs Shell Priority (MANDATORY)

Roam tools are **always preferred** over shell-based alternatives for code
exploration. The roam index provides semantic understanding (call graphs,
dependency chains, symbol resolution) that text search cannot match.

| Task | Use this | NOT this |
|------|----------|----------|
| Find symbol definition / usage | `roam_context <symbol>` | `grep -r "symbol"` |
| Understand a module / area | `roam_explore <path>` | multiple `file_read` calls |
| Search for a symbol by name | `roam_search_symbol <name>` | `grep -rn` / `find` |
| Trace call graph / callers | `roam_trace <symbol>` | manual import-following |
| Check dependencies | `roam_deps <path>` | reading `import` statements |
| Validate syntax after edits | `roam_syntax_check <paths>` | running the full build |
| Pre-change impact analysis | `roam_preflight <symbol>` | guessing impact |

**Use shell (`grep`, `find`, `cat`) only for:**
- Non-code files (markdown, JSON config, YAML, logs)
- When roam returns no results for a symbol (rare — try alternate names first)
- Text-level searches where semantic understanding is not needed (e.g. string literals)

### Anti-Loitering Rule (STRICT)

You have a **20-minute hard timeout**. Every read costs ~30s.

**Max 5 consecutive read-only commands** (`roam_explore`, `roam_context`,
`read_file`, `view`, read-only `bash`) before a code mutation (`edit_file`,
`write_file`, write-mode `bash`). Counter resets after each mutation.

**Before every read ask:** *"Do I have enough context to write code?"*
