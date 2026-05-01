/**
 * handlers/support/node-contract-prompt.ts — Recovery-prompt builder for
 * the node-contract gate.
 *
 * Given a list of contract gaps, render a focused recovery prompt that
 * the runner sends back into the SAME live SDK session. Tone matches the
 * other in-session nudges (write-density, pre-timeout) emitted from
 * `session/session-events.ts`: directive, path-explicit, no chit-chat.
 */

import type { MissingItem } from "./node-contract-gate.js";

/**
 * Build the recovery prompt. `attempt` is 1-based — the first nudge is
 * attempt 1, the third (and last under the runner's budget) is attempt 3.
 */
export function buildContractRecoveryPrompt(
  itemKey: string,
  missing: readonly MissingItem[],
  attempt: number,
): string {
  const lines: string[] = [];
  lines.push(
    `[node-contract] You ended your turn for \`${itemKey}\` without honouring the node's output contract (recovery attempt ${attempt} of 3).`,
  );
  lines.push("");
  lines.push("Inline text in your final assistant message is NOT persisted. The orchestrator only reads files on disk and the structured `report_outcome` SDK tool result. Fix the gaps below and finish your turn.");
  lines.push("");
  lines.push("Required actions:");

  let n = 0;
  for (const item of missing) {
    n += 1;
    if (item.kind === "report_outcome") {
      lines.push(
        `${n}. Call the \`report_outcome\` SDK tool with \`status: "completed"\` (or \`"failed"\` with a diagnostic \`message\` if you genuinely cannot finish). This MUST be the last tool call of your turn.`,
      );
    } else if (item.kind === "artifact-missing") {
      lines.push(
        `${n}. Write the declared artifact \`${item.declaredKind}\` using the \`write_file\` tool with the EXACT path: ${item.expectedPath}`,
      );
    } else {
      lines.push(
        `${n}. Re-write the declared artifact \`${item.declaredKind}\` at ${item.expectedPath} — current contents fail envelope validation: ${item.reason}`,
      );
    }
  }

  lines.push("");
  lines.push("Order matters: write every required file FIRST, then call `report_outcome` LAST. Do not respond with prose only — emit tool calls.");
  return lines.join("\n");
}
