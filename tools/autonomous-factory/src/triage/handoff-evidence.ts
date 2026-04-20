/**
 * triage/handoff-evidence.ts — Format-agnostic projection from a
 * `StructuredFailure` payload to the `TriageHandoff.evidence` shape.
 *
 * The triage handler is a pure classifier — it must not know the internal
 * schema of any particular reporter format. This module owns that dispatch
 * so that when `jest-json` / `pytest-json` / … land they add a branch here
 * without touching `triage-handler.ts`.
 *
 * Returns `undefined` when:
 *   - the input is not a recognised structured failure,
 *   - the recognised format has no binary evidence harvested.
 */

import type { TriageHandoff } from "../types.js";
import type { StructuredFailure } from "./playwright-report.js";

type Evidence = NonNullable<TriageHandoff["evidence"]>;

function fromPlaywrightJson(f: StructuredFailure): Evidence | undefined {
  const out: Array<Evidence[number]> = [];
  for (const t of f.failedTests) {
    const atts = t.attachments ?? [];
    if (atts.length === 0) continue;
    out.push({
      testTitle: t.title,
      attachments: atts.map((a) => ({
        name: a.name,
        path: a.path,
        contentType: a.contentType,
      })),
    });
  }
  return out.length > 0 ? out : undefined;
}

export function toHandoffEvidence(
  structured: unknown,
): TriageHandoff["evidence"] {
  if (!structured || typeof structured !== "object") return undefined;
  const kind = (structured as { kind?: unknown }).kind;
  if (kind === "playwright-json") {
    return fromPlaywrightJson(structured as StructuredFailure);
  }
  // Future: jest-json, pytest-json, … each add a branch here.
  return undefined;
}
