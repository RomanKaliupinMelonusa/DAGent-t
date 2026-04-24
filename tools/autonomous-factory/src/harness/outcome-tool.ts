/**
 * harness/outcome-tool.ts — Custom `report_outcome` SDK tool.
 *
 * Phase A migration: replaces the agent-facing bash CLI verbs
 * `pipeline:complete | pipeline:fail`
 * with a single typed SDK tool. The session runner observes the latest
 * call via `telemetry.reportedOutcome` and the `copilot-agent` handler
 * translates it into a kernel Command — making the kernel the sole
 * writer of pipeline state.
 *
 * Phase 5 cutover: the optional `docNote` / `deployedUrl` / `projectNote`
 * fields have been removed. Their replacements are declared artifacts:
 *   - `docNote` (and `projectNote`) → `summary` artifact written to
 *     `outputs/summary.md` (declared via `produces_artifacts: ["summary"]`).
 *   - `deployedUrl` → `deployment-url` artifact written to
 *     `outputs/deployment-url.json` (declared via
 *     `produces_artifacts: ["deployment-url"]`).
 * This keeps the SDK surface small and routes all rich content through
 * the same artifact tree the rest of the pipeline already inspects.
 *
 * The tool is idempotent — only the LAST call wins. Agents are expected
 * to call it exactly once at the end of their session.
 */

import { defineTool } from "@github/copilot-sdk";
import type { Tool } from "@github/copilot-sdk";
import type { ItemSummary } from "../types.js";

/**
 * Structured outcome reported by an agent at session end.
 * Status + (on failure) a diagnostic message — nothing else. Rich content
 * (notes, URLs, …) flows through declared artifacts in `outputs/`.
 */
export type ReportedOutcome =
  | { status: "completed" }
  | {
      status: "failed";
      /** REQUIRED diagnostic message — usually a TriageDiagnostic JSON. */
      message: string;
    };

/**
 * Build the `report_outcome` tool. The handler writes the latest call into
 * `telemetry.reportedOutcome`; later calls overwrite earlier ones.
 *
 * The tool returns a brief acknowledgement string so the SDK message
 * stream contains a clear marker, but the source of truth for outcome
 * routing is the telemetry field, not the message text.
 */
export function buildReportOutcomeTool(telemetry: ItemSummary): Tool<any> {
  return defineTool("report_outcome", {
    description:
      "Report the final outcome of this session. Call exactly once, " +
      "as the LAST action before you stop. The orchestrator uses this " +
      "to mutate pipeline state — do NOT also call any `pipeline:*` " +
      "bash command. Set status='completed' on success, status='failed' " +
      "with a diagnostic `message` on failure. " +
      "Notes, URLs, and other rich content go in declared artifacts " +
      "(write `outputs/summary.md` or `outputs/deployment-url.json` " +
      "instead of passing them here).",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["completed", "failed"],
          description: "Final status of this work item.",
        },
        message: {
          type: "string",
          description:
            "REQUIRED when status='failed'. Diagnostic message — preferably " +
            "a TriageDiagnostic JSON object describing root cause, blame, " +
            "and suggested next agent.",
        },
      },
      required: ["status"],
    },
    handler: (args: {
      status: "completed" | "failed";
      message?: string;
    }) => {
      if (args.status === "failed") {
        const message = (args.message ?? "").trim();
        if (!message) {
          return (
            "ERROR: report_outcome with status='failed' requires a non-empty " +
            "`message` (preferably a TriageDiagnostic JSON). Outcome NOT recorded — " +
            "call again with a diagnostic message."
          );
        }
        telemetry.reportedOutcome = { status: "failed", message };
        return `Outcome recorded: failed. ${message.length > 120 ? message.slice(0, 117) + "..." : message}`;
      }

      telemetry.reportedOutcome = { status: "completed" };
      return "Outcome recorded: completed.";
    },
  });
}
