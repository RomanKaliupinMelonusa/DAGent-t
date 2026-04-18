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

      default: {
        const _exhaustive: never = effect;
        break;
      }
    }
  }

  return executed;
}
