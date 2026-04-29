/**
 * src/temporal/workflow/__fixtures__/forbidden.fixture.ts
 *
 * Deliberate determinism violations. The `npm run lint:test` script
 * runs ESLint against this file and asserts the determinism rule
 * fires on every offending line. This guards against silent rule
 * disablement.
 *
 * DO NOT EXECUTE THIS FILE. It is excluded from the workflow bundle
 * (filename pattern `__fixtures__/**`) and from production tsc builds.
 */

// eslint-disable-next-line no-restricted-imports -- exempt: fixture
// (No actual import — keeping a no-op example to keep the rule scope focused.)

// Violation 1: Date constructor.
const _now = new Date();

// Violation 2: Date.now().
const _t = Date.now();

// Violation 3: Math.random().
const _r = Math.random();

// Violation 4: setTimeout.
setTimeout(() => undefined, 100);

// Violation 5: forbidden import (filesystem).
//   This must be at module scope so the linter can flag it; using a
//   `require`-style dynamic import would bypass `no-restricted-imports`.
import * as _fs from "node:fs";

// Reference the imports so TS doesn't strip them and so lint is forced
// to walk the module graph.
export const _bundle = { _now, _t, _r, _fs };
