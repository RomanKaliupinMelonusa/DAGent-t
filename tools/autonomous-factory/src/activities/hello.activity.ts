/**
 * src/activities/hello.activity.ts — Reference activity.
 *
 * Trivial sample used by `helloWorkflow` to prove the SDK plumbing works
 * end-to-end. Demonstrates:
 *   - Importing `Context.current()` to access activity primitives
 *   - Calling `heartbeat()` (no-op for fast activities, but documents
 *     the pattern that real activities must follow)
 *
 * Real activities (Session 3) follow the same shape but with substantially
 * more body — see `docs/temporal-migration/session-3-activities.md`.
 */

import { Context } from "@temporalio/activity";

export async function sayHello(name: string): Promise<string> {
  Context.current().heartbeat({ stage: "starting" });
  return `Hello, ${name}!`;
}
