# `src/worker/`

Worker process bootstrap — connects to a Temporal frontend, registers workflow + activity bundles, polls the configured task queue.

Run with `npm run temporal:worker`. Reads `TEMPORAL_ADDRESS` (default `localhost:7233`) and `TEMPORAL_TASK_QUEUE` (default `dagent-hello` until Session 4 introduces the production queue).
