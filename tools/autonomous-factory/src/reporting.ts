/**
 * reporting.ts — Compatibility shim.
 *
 * The reporting subsystem lives under src/reporting/. This file re-exports
 * its public surface so existing imports (`from "./reporting/index.js"` /
 * `from "../reporting/index.js"`) keep working during migration.
 *
 * New code should import from `./reporting/index.js` (or deep-import the
 * specific leaf module).
 */

export * from "./reporting/index.js";
