/**
 * lifecycle/spec-compiler-validator.ts — Pure pre-`report_outcome`
 * validator for the spec-compiler node.
 *
 * Mirrors the post-completion middleware chain
 * (`acceptance-integrity` + `fixture-validation`) but is invoked by the
 * `report_outcome` SDK tool BEFORE the outcome is recorded — so a
 * validation failure surfaces inline as a tool-call error, allowing the
 * agent to repair within the same session instead of being killed by
 * the idle watchdog.
 *
 * Side-effect-free except for filesystem reads via the supplied probes.
 * The post-completion middlewares remain as a defense-in-depth backstop
 * for nodes not gated by this validator.
 */

import { loadAcceptanceContract, AcceptanceParseError } from "../apm/acceptance-schema.js";
import { validateFixtures, formatViolationsError } from "./fixture-validator.js";
import type { BaselineProfile } from "../ports/baseline-loader.js";

export type SpecCompilerValidationCode =
  | "envelope-missing"
  | "schema-violation"
  | "fixture-violation";

export type SpecCompilerValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: SpecCompilerValidationCode;
      readonly error: string;
    };

export interface SpecCompilerValidatorParams {
  /** Candidate acceptance file paths in priority order. The first that
   *  exists is read. Typically `[nodeScopePath, kickoffFallbackPath]`. */
  readonly candidatePaths: readonly string[];
  /** Filesystem existence probe — typically `ctx.filesystem.existsSync`. */
  readonly existsSync: (p: string) => boolean;
  /** Loader for the kickoff baseline profile. May return null when the
   *  baseline is absent (which is a valid state — the URL/baseline
   *  checks are then skipped, but bad-assert-kind checks still run). */
  readonly loadBaseline: () => BaselineProfile | null;
}

/**
 * Run the deterministic acceptance + fixture validation pipeline against
 * the on-disk artifact the spec-compiler just wrote. Designed to be
 * called from the `report_outcome` tool handler immediately before
 * recording a `completed` outcome.
 */
export function validateSpecCompilerOutput(
  params: SpecCompilerValidatorParams,
): SpecCompilerValidationResult {
  const { candidatePaths, existsSync, loadBaseline } = params;

  const acceptancePath = candidatePaths.find((p) => existsSync(p));
  if (!acceptancePath) {
    return {
      ok: false,
      code: "envelope-missing",
      error:
        "[envelope-missing] spec-compiler reported completion but no " +
        `acceptance.yml exists at any of: ${candidatePaths.join(", ")}. ` +
        "Write the contract to $OUTPUTS_DIR/acceptance.yml, then call " +
        "report_outcome again.",
    };
  }

  let contract: ReturnType<typeof loadAcceptanceContract>;
  try {
    contract = loadAcceptanceContract(acceptancePath);
  } catch (err) {
    const detail =
      err instanceof AcceptanceParseError ? err.message : (err as Error).message;
    return {
      ok: false,
      code: "schema-violation",
      error:
        `[schema-violation] acceptance contract at ${acceptancePath} is ` +
        `invalid: ${detail}\n\n` +
        "Repair the YAML (the schema rejects unknown keys / missing required " +
        "fields), then call report_outcome again.",
    };
  }

  // Fixture validation is a no-op when the contract has no fixtures.
  if (contract.test_fixtures.length === 0) {
    return { ok: true };
  }

  let baseline: BaselineProfile | null = null;
  try {
    baseline = loadBaseline();
  } catch {
    baseline = null;
  }

  const verdict = validateFixtures(contract, baseline);
  if (verdict.ok) return { ok: true };

  return {
    ok: false,
    code: "fixture-violation",
    error: formatViolationsError(verdict.violations),
  };
}
