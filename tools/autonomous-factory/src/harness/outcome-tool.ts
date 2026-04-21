/**
 * harness/outcome-tool.ts — Custom `report_outcome` SDK tool.
 *
 * Phase A migration: replaces the agent-facing bash CLI verbs
 * `pipeline:complete | pipeline:fail | pipeline:doc-note | pipeline:set-url
 *  | pipeline:set-note | pipeline:handoff-artifact`
 * with a single typed SDK tool. The session runner observes the latest
 * call via `telemetry.reportedOutcome` and the `copilot-agent` handler
 * translates it into a kernel Command — making the kernel the sole
 * writer of pipeline state.
 *
 * The tool is idempotent — only the LAST call wins. Agents are expected
 * to call it exactly once at the end of their session.
 */

import { defineTool } from "@github/copilot-sdk";
import type { Tool } from "@github/copilot-sdk";
import type { ItemSummary } from "../types.js";

/**
 * Structured outcome reported by an agent at session end.
 * Mirrors the verbs that previously required a bash CLI invocation.
 */
export type ReportedOutcome =
  | {
      status: "completed";
      /** Optional documented decision/note recorded against the item. */
      docNote?: string;
      /** Optional JSON string handed to downstream items (e.g. spec → dev). */
      handoffArtifact?: string;
      /** Optional URL recorded against the feature (deploy nodes only). */
      deployedUrl?: string;
      /** Optional free-form project-level note appended to feature state. */
      projectNote?: string;
    }
  | {
      status: "failed";
      /** REQUIRED diagnostic message — usually a TriageDiagnostic JSON. */
      message: string;
      /** Optional doc-note recorded against the item even on failure. */
      docNote?: string;
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
      "with a diagnostic `message` on failure.",
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
        docNote: {
          type: "string",
          description:
            "OPTIONAL. Short documented decision/insight to record against " +
            "this item (e.g. 'skipped flaky test pending upstream fix #123').",
        },
        handoffArtifact: {
          type: "string",
          description:
            "OPTIONAL. JSON string handed to downstream items (e.g. spec → " +
            "backend-dev contract, integration test results).",
        },
        deployedUrl: {
          type: "string",
          description:
            "OPTIONAL. Deployed URL to record against the feature. Only " +
            "meaningful for deploy nodes (frontend/backend).",
        },
        projectNote: {
          type: "string",
          description:
            "OPTIONAL. Free-form note appended to feature-level " +
            "implementation notes (rare — prefer docNote).",
        },
      },
      required: ["status"],
    },
    handler: (args: {
      status: "completed" | "failed";
      message?: string;
      docNote?: string;
      handoffArtifact?: string;
      deployedUrl?: string;
      projectNote?: string;
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
        telemetry.reportedOutcome = {
          status: "failed",
          message,
          ...(args.docNote ? { docNote: args.docNote } : {}),
        };
        return `Outcome recorded: failed. ${message.length > 120 ? message.slice(0, 117) + "..." : message}`;
      }

      telemetry.reportedOutcome = {
        status: "completed",
        ...(args.docNote ? { docNote: args.docNote } : {}),
        ...(args.handoffArtifact ? { handoffArtifact: args.handoffArtifact } : {}),
        ...(args.deployedUrl ? { deployedUrl: args.deployedUrl } : {}),
        ...(args.projectNote ? { projectNote: args.projectNote } : {}),
      };
      return "Outcome recorded: completed.";
    },
  });
}
