/**
 * src/activities/hello.activity.ts — Reference activity factory.
 *
 * Trivial sample used by `helloWorkflow` to prove the SDK plumbing works
 * end-to-end. The factory takes (and ignores) the `ActivityDeps`
 * registry to match the createActivities-shaped wiring used by every
 * other activity in this folder.
 */

import { Context } from "@temporalio/activity";
import type { ActivityDeps } from "./deps.js";

export function makeSayHello(_deps: ActivityDeps): (name: string) => Promise<string> {
  return async function sayHello(name: string): Promise<string> {
    Context.current().heartbeat({ stage: "starting" });
    return `Hello, ${name}!`;
  };
}
