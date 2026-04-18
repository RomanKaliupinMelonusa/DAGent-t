/**
 * domain/batch-interpreter.ts — Pure batch outcome interpretation.
 *
 * Extracts actionable signals from a batch of settled session promises.
 * Moved from watchdog.ts — already a pure function.
 */

/** Minimal outcome shape. Mirrors kernel-types SessionOutcome. */
export type BatchOutcome =
  | { readonly kind: "continue" }
  | { readonly kind: "halt" }
  | { readonly kind: "create-pr" }
  | { readonly kind: "approval-pending"; readonly gateKey: string }
  | { readonly kind: "triage"; readonly activation: unknown };

/** Signals extracted from a batch of outcomes. */
export interface BatchSignals {
  readonly shouldHalt: boolean;
  readonly createPr: boolean;
  readonly approvalPendingKeys: readonly string[];
  readonly triageActivations: readonly unknown[];
  readonly unexpectedErrors: readonly Error[];
}

/**
 * Interpret a batch of settled promises into actionable signals.
 * Pure function — no side effects, no state mutation.
 */
export function interpretBatch(
  results: readonly PromiseSettledResult<BatchOutcome>[],
): BatchSignals {
  let shouldHalt = false;
  let createPr = false;
  const approvalPendingKeys: string[] = [];
  const triageActivations: unknown[] = [];
  const unexpectedErrors: Error[] = [];

  for (const result of results) {
    if (result.status === "rejected") {
      unexpectedErrors.push(
        result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
      );
      shouldHalt = true;
      continue;
    }

    const outcome = result.value;
    switch (outcome.kind) {
      case "halt":
        shouldHalt = true;
        break;
      case "create-pr":
        createPr = true;
        break;
      case "approval-pending":
        approvalPendingKeys.push(outcome.gateKey);
        break;
      case "triage":
        triageActivations.push(outcome.activation);
        break;
      case "continue":
        break;
    }
  }

  return { shouldHalt, createPr, approvalPendingKeys, triageActivations, unexpectedErrors };
}
