## Hard Limits

- **10 retry attempts** per failing command. After 10 failures, signal failure via the `report_outcome` tool (`status: "failed"`) and stop.
- **10 test suite invocations** max per session. If tests fail 10 times, halt.
- **20 total exploratory commands** max per session (`read_file`, `view`, `roam_explore`,
  `roam_context`, read-only `bash`, `grep`). If you exceed 20 reads without completing
  your task, you are loitering — begin writing code immediately with what you have.
- **Monorepo Roam scoping:** ALL roam tool calls MUST include the app boundary path (e.g., `apps/commerce-storefront`). Unscoped roam calls risk cross-app symbol pollution. See Roam Tool Rules.
- Never invoke other agents. Complete your work and exit.
