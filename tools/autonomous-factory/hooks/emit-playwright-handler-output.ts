#!/usr/bin/env -S node --import tsx
/**
 * emit-playwright-handler-output.ts — Bridge a Playwright JSON reporter
 * file into the symmetric `handler-output` envelope.
 *
 * This hook is shipped with the orchestrator and invoked as a `post:`
 * step on local-exec nodes that run Playwright against the live app
 * (`live-ui`, `frontend-unit-test`, e2e gates).
 *
 * Contract (env vars supplied by the orchestrator):
 *   - PLAYWRIGHT_JSON_OUTPUT_NAME — absolute path to the JSON reporter file.
 *     `local-exec` only exports this when the workflow node declares
 *     `structured_failure: { format: playwright-json, path: ... }`.
 *   - OUTPUTS_DIR                 — invocation-scoped outputs directory.
 *   - NODE_KEY                    — producer identity for the envelope.
 *   - APP_ROOT, SLUG              — used to resolve the evidence directory
 *     (`in-progress/<slug>_evidence/`) where `parsePlaywrightReport`
 *     copies screenshots / traces / videos.
 *
 * Behaviour:
 *   - Absent PLAYWRIGHT_JSON_OUTPUT_NAME  → no-op, exit 0.
 *     Nodes that declare no `structured_failure` config simply skip the
 *     bridge.
 *   - Reporter file missing / malformed   → no-op, exit 0.
 *     The main handler's `scriptOutput` already captured the raw output;
 *     triage falls back to it. Non-fatal by design — post-hook errors
 *     must never override the main script's outcome.
 *   - Successful parse                    → write `$OUTPUTS_DIR/handler-output.json`
 *     with `{ output: { structuredFailure: <parsed> } }`. The
 *     `handler-output-ingestion` middleware then merges it into
 *     `NodeResult.handlerOutput` so downstream triage sees
 *     `handlerOutput.structuredFailure` exactly as before the Phase 4
 *     refactor (drop-in compatible).
 */

import fs from "node:fs";
import path from "node:path";
import { parsePlaywrightReport } from "../src/triage/playwright-report.js";

function main(): void {
  const reportPath = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;
  const outputsDir = process.env.OUTPUTS_DIR;
  const nodeKey = process.env.NODE_KEY ?? "local-exec";
  const appRoot = process.env.APP_ROOT;
  const slug = process.env.SLUG;

  if (!reportPath) {
    // No structured_failure declared on this node — nothing to bridge.
    return;
  }
  if (!outputsDir) {
    // OUTPUTS_DIR is always exported by local-exec; a missing value means
    // the hook is being invoked outside a pipeline run. Silent no-op.
    return;
  }
  if (!fs.existsSync(reportPath)) {
    // Playwright did not write a report (e.g. startup failure before any
    // test ran). The handler's scriptOutput already captured the raw
    // stderr; nothing to do here.
    return;
  }

  const structuredFailure = parsePlaywrightReport(reportPath, {
    ...(appRoot ? { appRoot } : {}),
    ...(slug ? { slug } : {}),
  });
  if (structuredFailure === null) {
    // Malformed / unreadable report — advisory; do not fail the post-hook.
    return;
  }

  fs.mkdirSync(outputsDir, { recursive: true });
  const envelopePath = path.join(outputsDir, "handler-output.json");

  // Preserve any handler-output the script itself may have written.
  // Merge rather than overwrite so scripts remain free to emit their own
  // structured data alongside the bridged Playwright payload.
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(envelopePath)) {
    try {
      const raw = fs.readFileSync(envelopePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      // Corrupt existing envelope — overwrite rather than fail the hook.
    }
  }
  const existingOutput =
    existing.output && typeof existing.output === "object" && !Array.isArray(existing.output)
      ? (existing.output as Record<string, unknown>)
      : {};

  const envelope = {
    schemaVersion: 1,
    producedBy: nodeKey,
    producedAt: new Date().toISOString(),
    output: { ...existingOutput, structuredFailure },
  };

  fs.writeFileSync(envelopePath, JSON.stringify(envelope, null, 2) + "\n", "utf-8");
}

try {
  main();
} catch (err) {
  // Belt-and-braces: post-hook failure must never fail the local-exec
  // node (local-exec post-hook errors are logged but non-fatal per the
  // lifecycle-hooks middleware). Log to stderr and exit 0 so tests and
  // runs produce deterministic outcomes.
  console.error(
    `[emit-playwright-handler-output] advisory error: ${err instanceof Error ? err.message : String(err)}`,
  );
}
