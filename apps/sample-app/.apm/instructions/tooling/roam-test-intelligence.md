## Roam Test Intelligence (MCP Tools)

You have access to Roam MCP tools for **surgical test gap analysis**. Use these to identify
exactly which code paths lack coverage before writing or running tests.

### AVAILABLE TOOLS

- `roam_test_gaps` — Analyzes modified source files against existing test suites. Returns a precise
  list of unhandled code paths (e.g., "The catch block on line 42 has no test").
- `roam_testmap` — Returns the test->source mapping for specified files, showing which tests cover
  which source functions and branches.
- `roam_affected_tests` — Given a list of changed files, returns the test files that need to run.

### STRICT RULES

1. **Do NOT run `roam` via shell.** Use the MCP tools exclusively.
2. **Limit to 5 Roam tool calls per session.** You are a test runner, not an explorer.
3. **Do NOT use Roam mutation tools** (`roam_mutate`, `roam_preflight`, etc.). Your job is to
   identify test gaps and write/run tests — not to modify application code.
4. If Roam MCP tools are unavailable, proceed with standard test execution and note the limitation.
