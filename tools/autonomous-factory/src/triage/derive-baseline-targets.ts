/**
 * triage/derive-baseline-targets.ts — Deterministic extraction of baseline
 * capture targets from an `AcceptanceContract`.
 *
 * `baseline-analyzer` needs to know which pages + modals it should probe
 * to capture pre-feature noise. The instructions already tell the agent
 * to read `required_flows[*].steps[*]` and collect `goto` URLs + modal
 * trigger testids, but that step is LLM-interpreted, non-deterministic,
 * and a frequent source of missed coverage.
 *
 * This module produces the same list *before* the agent session starts,
 * so the prompt can carry a pre-computed `targets[]` the agent copies
 * into its emitted `_BASELINE.json`. Pure — no I/O, no LLM.
 *
 * Heuristics (deliberately conservative):
 *
 *   - **Pages**: every `goto` URL across all flows, deduped by URL.
 *     The *first* flow that introduces a URL provides its human-readable
 *     name (via the flow's `name` field). Later flows referencing the
 *     same URL are ignored (first win).
 *
 *   - **Modals / overlays**: the testid of the `click` step that
 *     immediately precedes an `assert_visible` step IFF that testid
 *     name looks like a trigger (contains `btn`, `button`, `trigger`,
 *     `open`, `show`) OR the assert_visible testid contains `modal`,
 *     `drawer`, `overlay`, `dialog`, `popover`. Deduped by trigger
 *     testid. The *first* such click provides the URL context (the
 *     most recent `goto` before the click).
 *
 * Edge cases:
 *   - Empty `required_flows` → empty list.
 *   - `goto` with a fragment or query — URL retained verbatim.
 *   - Bad contract (missing fields) handled by the caller; this
 *     function assumes a validated `AcceptanceContract`.
 */

import type { AcceptanceContract, FlowStep } from "../apm/acceptance-schema.js";

export type BaselineTargetKind = "page" | "modal";

export interface BaselineTarget {
  readonly name: string;
  readonly kind: BaselineTargetKind;
  readonly url?: string;
  readonly trigger_testid?: string;
}

// Substrings that suggest a testid identifies a trigger element.
const TRIGGER_HINTS = [
  "btn",
  "button",
  "trigger",
  "open",
  "show",
  "link",
  "tile",
];

// Substrings that suggest an assertion targets a modal / overlay element.
const MODAL_HINTS = [
  "modal",
  "drawer",
  "overlay",
  "dialog",
  "popover",
  "sheet",
  "menu",
];

function lowerMatchesAny(value: string, needles: readonly string[]): boolean {
  const v = value.toLowerCase();
  for (const n of needles) {
    if (v.includes(n)) return true;
  }
  return false;
}

/**
 * Extract a deduped list of baseline capture targets from the acceptance
 * contract. Returns an empty list when no targets can be derived.
 */
export function deriveBaselineTargets(
  contract: AcceptanceContract,
): BaselineTarget[] {
  const pages: Map<string, BaselineTarget> = new Map(); // key: url
  const modals: Map<string, BaselineTarget> = new Map(); // key: trigger_testid

  for (const flow of contract.required_flows ?? []) {
    const flowName = flow.name;
    let lastGotoUrl: string | undefined;
    const steps = flow.steps ?? [];

    for (let i = 0; i < steps.length; i++) {
      const step: FlowStep = steps[i];
      switch (step.action) {
        case "goto": {
          lastGotoUrl = step.url;
          if (!pages.has(step.url)) {
            // First flow to hit this URL names it — scoped to the flow
            // name so overlapping pages don't collide (PLP used by
            // "quick-view" and "add-to-cart" both register as "PLP —
            // quick-view" / "PLP — add-to-cart" only if the URLs differ).
            pages.set(step.url, {
              name: flowName,
              kind: "page",
              url: step.url,
            });
          }
          break;
        }
        case "click": {
          // Look ahead one step: a click that opens a modal is typically
          // followed by an assert_visible on the modal element. Require
          // either the click testid to look like a trigger OR the next
          // assert testid to name a modal-ish element.
          const next = steps[i + 1];
          const clickTestid = step.testid;
          const nextAssertTestid =
            next && next.action === "assert_visible" ? next.testid : undefined;
          const looksLikeTrigger = lowerMatchesAny(clickTestid, TRIGGER_HINTS);
          const nextLooksLikeModal =
            nextAssertTestid !== undefined &&
            lowerMatchesAny(nextAssertTestid, MODAL_HINTS);
          if ((looksLikeTrigger && nextAssertTestid) || nextLooksLikeModal) {
            if (!modals.has(clickTestid)) {
              modals.set(clickTestid, {
                name: `${flowName} — ${clickTestid}`,
                kind: "modal",
                url: lastGotoUrl,
                trigger_testid: clickTestid,
              });
            }
          }
          break;
        }
        default:
          // fill / assert_* — no target implications.
          break;
      }
    }
  }

  return [...pages.values(), ...modals.values()];
}

/**
 * Render the derived targets as a compact markdown block suitable for
 * injection into the `baseline-analyzer` prompt. Returns an empty string
 * when the contract yields no targets (→ caller omits the block entirely).
 */
export function formatDerivedTargetsMarkdown(
  contract: AcceptanceContract,
): string {
  const targets = deriveBaselineTargets(contract);
  if (targets.length === 0) return "";
  const lines: string[] = [];
  lines.push("\n\n## Pre-computed capture targets (deterministic)\n");
  lines.push(
    "The following targets were extracted from `required_flows[*].steps[*]` " +
    "by the orchestrator *before* your session started. **Use this list as the " +
    "authoritative target set** — you may add more if the spec implies pages " +
    "the contract omits, but you MUST NOT remove any of these entries.",
  );
  lines.push("");
  for (const t of targets) {
    if (t.kind === "page") {
      lines.push(`- **page** \`${t.url}\` — ${t.name}`);
    } else {
      const on = t.url ? ` on \`${t.url}\`` : "";
      lines.push(
        `- **modal** trigger \`${t.trigger_testid}\`${on} — ${t.name}`,
      );
    }
  }
  return lines.join("\n");
}
