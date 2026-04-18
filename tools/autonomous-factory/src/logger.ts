/**
 * logger.ts — Compatibility shim.
 *
 * The telemetry subsystem lives under src/telemetry/. This file re-exports
 * its public surface so existing imports (`from "./telemetry/index.js"` /
 * `from "../telemetry/index.js"`) keep working during migration.
 *
 * New code should import from `./telemetry/index.js` (or deep-import the
 * specific leaf module).
 */

export * from "./telemetry/index.js";
