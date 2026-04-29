/**
 * src/temporal/activities/index.ts — Activity registry.
 *
 * The worker imports the namespace export from this module and passes
 * it to `Worker.create({ activities })`. Workflows reference the same
 * `typeof activities` to type-safe `proxyActivities<typeof activities>()`.
 */

export { sayHello } from "./hello.activity.js";
