/**
 * kernel/effect-executor.ts — Executes side effects produced by the kernel.
 *
 * The kernel is pure — it returns Effect descriptors. This module
 * translates those into real I/O operations via port interfaces.
 */

import type { Effect } from "./effects.js";
import type { StateStore } from "../ports/state-store.js";
import type { Telemetry } from "../ports/telemetry.js";

export interface EffectPorts {
  readonly stateStore: StateStore;
  readonly telemetry: Telemetry;
}

/**
 * Execute a list of effects sequentially against the provided ports.
 * Returns the count of successfully executed effects.
 */
export async function executeEffects(
  effects: readonly Effect[],
  ports: EffectPorts,
): Promise<number> {
  let executed = 0;

  for (const effect of effects) {
    switch (effect.type) {
      case "persist-state":
        // State persistence is handled by the loop's lifecycle.commitState(),
        // not individual effects. This is a placeholder for future use.
        executed++;
        break;

      case "persist-execution-record":
        try {
          ports.telemetry.event("item.end", null, {
            executionId: effect.record.executionId,
            nodeKey: effect.record.nodeKey,
          });
          executed++;
        } catch {
          // Non-fatal — don't block the pipeline for telemetry failures
        }
        break;

      case "persist-pending-context":
        try {
          await ports.stateStore.setPendingContext(effect.slug, effect.itemKey, effect.context);
          executed++;
        } catch {
          // Non-fatal — context injection is best-effort
        }
        break;

      case "persist-triage-record":
        try {
          await ports.stateStore.setLastTriageRecord(effect.slug, effect.record);
          executed++;
        } catch {
          // Non-fatal
        }
        break;

      case "reindex":
        // Reindex is a roam-code operation — emit telemetry so the loop
        // layer can trigger it if needed. The effect executor doesn't
        // have a direct roam-code port.
        try {
          ports.telemetry.event("roam.reindex", null, { categories: effect.categories });
          executed++;
        } catch {
          // Non-fatal
        }
        break;

      case "telemetry-event":
        try {
          ports.telemetry.event(effect.category, effect.itemKey, effect.context);
          executed++;
        } catch {
          // Non-fatal
        }
        break;

      case "write-halt-artifact":
        try {
          const lines: string[] = [];
          lines.push(`# ⛔ Pipeline halted — identical error recurred`);
          lines.push("");
          lines.push(`- **Feature:** \`${effect.slug}\``);
          lines.push(`- **Most recent failing node:** \`${effect.failingItemKey}\``);
          lines.push(`- **Error signature:** \`${effect.errorSignature}\``);
          lines.push(`- **Threshold:** ${effect.thresholdMatchCount}/${effect.threshold} identical failures`);
          lines.push("");
          lines.push(`## Why this halted`);
          lines.push("");
          lines.push(
            "The kernel saw the **same error signature** recur across multiple dispatches within this feature run.",
            "Rather than burn more cycles on a stuck dev agent, the pipeline halted for human review.",
          );
          lines.push("");
          lines.push(`## Identical failures (newest last)`);
          lines.push("");
          for (const f of effect.sampleFailures) {
            const excerpt = f.message.split(/\r?\n/).slice(0, 6).join("\n");
            lines.push(`### \`${f.itemKey}\` — ${f.timestamp}`);
            lines.push("```");
            lines.push(excerpt);
            lines.push("```");
            lines.push("");
          }
          lines.push(`## Resume`);
          lines.push("");
          lines.push("1. Investigate the root cause (the recurring error above).");
          lines.push("2. Commit any fix to the feature branch.");
          lines.push(`3. Run: \`npm run pipeline:resume ${effect.slug}\` — (not yet implemented for escalation halts; reset the stuck node via \`pipeline:reset-scripts\` or clear \`${effect.slug}_HALT.md\` and re-run \`agent:run\` to retry).`);
          lines.push("");
          await ports.stateStore.writeHaltArtifact(effect.slug, lines.join("\n") + "\n");
          executed++;
        } catch {
          // Non-fatal — halt itself is already recorded via telemetry + kernel signal
        }
        break;

      default: {
        const _exhaustive: never = effect;
        break;
      }
    }
  }

  return executed;
}
