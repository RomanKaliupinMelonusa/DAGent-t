/**
 * src/temporal/workflow/index.ts — Workflow bundle entry point.
 *
 * Re-exports every workflow function the worker should register. Keep
 * this file pure re-exports so the workflow bundler can statically
 * analyse the module graph.
 */

export { helloWorkflow } from "./hello.workflow.js";
