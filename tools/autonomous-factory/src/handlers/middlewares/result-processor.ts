/**
 * handlers/middlewares/result-processor.ts — Script output sanitizer.
 *
 * When a node fails and the handler produced a `scriptOutput` blob, this
 * middleware condenses it (truncates to a fixed byte budget and extracts
 * test summary stats) so the error message sent to triage is bounded and
 * stack-agnostic. Agent handlers are untouched — their reportedOutcome
 * already carries a structured summary.
 *
 * Historically this lived inline in `local-exec.ts`. Extracting it here
 * keeps handlers unaware of downstream triage formatting and makes the
 * sanitization behaviour swappable (e.g. apps can replace it via a custom
 * middleware registered before this one).
 */

import type { NodeMiddleware, MiddlewareNext } from "../middleware.js";
import type { NodeContext, NodeResult } from "../types.js";
import { sanitizeOutput } from "../support/result-processor-regex.js";

export const resultProcessorMiddleware: NodeMiddleware = {
  name: "result-processor",

  async run(_ctx: NodeContext, next: MiddlewareNext): Promise<NodeResult> {
    const result = await next();
    if (result.outcome !== "failed") return result;

    const scriptOutput = result.handlerOutput?.scriptOutput;
    if (typeof scriptOutput !== "string" || scriptOutput.length === 0) return result;

    // Prefer condensed scriptOutput as the triage message. Preserve any
    // existing errorMessage as a prefix when it adds signal (timeout notes,
    // exit-code headers, etc. set by the handler).
    const sanitized = sanitizeOutput(scriptOutput);
    const existing = result.errorMessage;
    const needsPrefix = typeof existing === "string" && existing.length > 0 && !existing.includes(sanitized.condensed);
    const errorMessage = needsPrefix ? `${existing}\n\n${sanitized.condensed}` : sanitized.condensed;

    return {
      ...result,
      errorMessage,
    };
  },
};
