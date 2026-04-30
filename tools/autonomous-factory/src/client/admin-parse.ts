/**
 * src/client/admin-parse.ts — Pure CLI argument parser for the
 * admin verb surface. Extracted from `admin.ts` so tests can import the
 * parser without triggering the module-level `main()` invocation that
 * connects to Temporal.
 *
 * `failHook` is dependency-injected so tests can capture failure
 * messages without `process.exit`. Production callers pass a closure
 * that prints to stderr and exits 1.
 */

import { parseArgs } from "node:util";

export interface ParsedArgs {
  readonly verb: string;
  readonly slug: string;
  readonly workflowName: string;
  readonly gate?: string;
  readonly reason?: string;
  readonly category?: string;
  readonly error?: string;
  readonly maxCycles?: number;
  readonly maxFailCount?: number;
  readonly maxDevCycles?: number;
}

export type FailHook = (msg: string) => never;

function parsePositiveInt(
  name: string,
  raw: string | undefined,
  fail: FailHook,
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    fail(`${name} must be a positive integer (got '${raw}')`);
  }
  return n;
}

/**
 * Parse `argv` (post-`process.argv.slice(2)`) into a structured
 * `ParsedArgs`. Returns `null` when argv requests help (`--help` /
 * `-h` / empty) so the caller can print help text and exit 0.
 */
export function parseAdminArgs(
  argv: readonly string[],
  fail: FailHook,
): ParsedArgs | null {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    return null;
  }
  const [verb, ...rest] = argv;
  if (!verb) return null;
  const { values, positionals } = parseArgs({
    args: rest as string[],
    options: {
      workflow: { type: "string", default: "storefront" },
      gate: { type: "string" },
      reason: { type: "string" },
      category: { type: "string" },
      error: { type: "string" },
      "max-cycles": { type: "string" },
      "max-fail-count": { type: "string" },
      "max-dev-cycles": { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });
  const slug = positionals[0];
  if (!slug) fail(`verb '${verb}' requires <slug> as positional argument`);
  const maxCycles = parsePositiveInt("--max-cycles", values["max-cycles"] as string | undefined, fail);
  const maxFailCount = parsePositiveInt("--max-fail-count", values["max-fail-count"] as string | undefined, fail);
  const maxDevCycles = parsePositiveInt("--max-dev-cycles", values["max-dev-cycles"] as string | undefined, fail);
  return {
    verb,
    slug: slug as string,
    workflowName: values.workflow as string,
    ...(values.gate ? { gate: values.gate as string } : {}),
    ...(values.reason ? { reason: values.reason as string } : {}),
    ...(values.category ? { category: values.category as string } : {}),
    ...(values.error ? { error: values.error as string } : {}),
    ...(maxCycles !== undefined ? { maxCycles } : {}),
    ...(maxFailCount !== undefined ? { maxFailCount } : {}),
    ...(maxDevCycles !== undefined ? { maxDevCycles } : {}),
  };
}
