/**
 * src/workflow/hello.workflow.ts — Reference workflow.
 *
 * Trivial sample used to prove the SDK plumbing works end-to-end and
 * to anchor the lint determinism rule. Real pipeline workflow lands
 * in Session 4 (`pipeline.workflow.ts`).
 *
 * Note the import shape:
 *   - `proxyActivities<typeof activities>()` is the *only* way workflow
 *     code touches activity logic.
 *   - `import type` is required so the activity module's runtime code
 *     never enters the workflow bundle.
 */

import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities/index.js";

const { sayHello } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 seconds",
});

export async function helloWorkflow(name: string): Promise<string> {
  return await sayHello(name);
}
