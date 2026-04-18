/**
 * tool-harness.ts — Back-compat barrel.
 *
 * Implementation moved to `./harness/`. This file re-exports the full
 * public surface so existing imports keep working without migration.
 */

export * from "./harness/index.js";
