/**
 * pipeline-state/mutations.mjs — All state-mutating operations.
 *
 * Every function that changes _STATE.json lives here. All mutations go
 * through withLock() to prevent TOCTOU races between parallel agents.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

import { APP_ROOT, statePath, transPath, readStateOrThrow, writeState, today } from "./io.mjs";
import { withLock } from "./lock.mjs";
import { computeErrorSignature } from "./error-signature.mjs";
import { getDownstream, cascadeBarriers } from "./graph.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Initialize pipeline state for a new feature.
 * Bootstraps the DAG from context.json (compiled by APM compiler) and persists
 * the full graph into _STATE.json so all subsequent operations are self-contained.
 */
export function initState(slug, workflowName, contextJsonPath) {
  if (!slug || !workflowName) {
    throw new Error("initState requires slug and workflowName");
  }

  if (!contextJsonPath) {
    contextJsonPath = join(APP_ROOT, ".apm", ".compiled", "context.json");
  }
  if (!existsSync(contextJsonPath)) {
    // Auto-compile APM context if missing
    const apmYml = join(APP_ROOT, ".apm", "apm.yml");
    if (!existsSync(apmYml)) {
      throw new Error(
        `No APM manifest found at ${apmYml}. Each app must have .apm/apm.yml.`
      );
    }
    console.log("ℹ  APM compiled context not found — compiling automatically…");
    try {
      const compilerScript = `import{compileApm}from"./src/apm-compiler.ts";compileApm(${JSON.stringify(APP_ROOT)});`;
      // __dirname is pipeline-state/, need to run from autonomous-factory/
      execSync(`npx tsx -e '${compilerScript}'`, {
        cwd: join(__dirname, ".."),
        stdio: "inherit",
        timeout: 60_000,
      });
    } catch (err) {
      throw new Error(
        `APM auto-compilation failed: ${err.message}\n` +
        `You can compile manually: cd tools/autonomous-factory && npx tsx -e 'import{compileApm}from"./src/apm-compiler.ts";compileApm("${APP_ROOT}");'`
      );
    }
    if (!existsSync(contextJsonPath)) {
      throw new Error(`APM compiled context still not found after auto-compilation: ${contextJsonPath}`);
    }
  }

  const context = JSON.parse(readFileSync(contextJsonPath, "utf-8"));
  const availableWorkflows = Object.keys(context.workflows ?? {});
  const workflow = context.workflows?.[workflowName];
  if (!workflow || !workflow.nodes) {
    throw new Error(
      `No workflow "${workflowName}" found in ${contextJsonPath}. ` +
      `Available workflows: ${availableWorkflows.join(", ") || "(none)"}. ` +
      `Check .apm/workflows.yml and recompile.`,
    );
  }

  const { nodes } = workflow;

  // Topological sort — items ordered by DAG dependency (execution order)
  const visited = new Set();
  const stack = new Set();
  const topoOrder = [];
  function visit(key) {
    if (stack.has(key)) throw new Error(`Cycle detected in DAG involving node "${key}"`);
    if (visited.has(key)) return;
    stack.add(key);
    for (const dep of nodes[key]?.depends_on ?? []) visit(dep);
    stack.delete(key);
    visited.add(key);
    topoOrder.push(key);
  }
  for (const key of Object.keys(nodes)) visit(key);

  const nodeEntries = topoOrder.map((key) => [key, nodes[key]]);

  const dependencies = {};
  const nodeTypes = {};
  const nodeCategories = {};
  const salvageSurvivors = [];
  for (const [key, node] of nodeEntries) {
    dependencies[key] = node.depends_on || [];
    nodeTypes[key] = node.type || "agent";
    nodeCategories[key] = node.category;
    if (node.salvage_survivor) salvageSurvivors.push(key);
  }

  const naByType = [];

  // Nodes with `activation: "triage-only"` start as dormant — invisible to the
  // scheduler until explicitly activated by triage via resetNodes().
  // Triage nodes (type: "triage") also start dormant — they are dispatched
  // exclusively via the watchdog's triageActivation path, never by the scheduler.
  const dormantByActivation = [];
  for (const [key, node] of nodeEntries) {
    if (node.activation === "triage-only" || node.type === "triage") dormantByActivation.push(key);
  }

  const items = nodeEntries.map(([key, node]) => ({
    key,
    label: key,
    agent: node.agent ?? null,
    status: (node.activation === "triage-only" || node.type === "triage") ? "dormant" : "pending",
    error: null,
  }));

  const state = {
    feature: slug,
    workflowName,
    started: today(),
    deployedUrl: null,
    implementationNotes: null,
    items,
    errorLog: [],
    /**
     * Typed cycle counters — first-class replacement for the legacy practice
     * of inferring cycle counts from pseudo-entries in errorLog. The reset
     * family of mutations bumps these; `readState` back-fills from errorLog
     * for legacy state files. Keys are stable strings (e.g. "reset-for-dev",
     * "resume-elevated", "reset-scripts:deploy").
     */
    cycleCounters: {},
    dependencies,
    nodeTypes,
    nodeCategories,
    naByType,
    dormantByActivation,
    salvageSurvivors,
  };

  writeState(slug, state);
  return { state, statePath: statePath(slug), transPath: transPath(slug) };
}

/** Mark a pipeline item as completed. */
export function completeItem(slug, itemKey) {
  if (!slug || !itemKey) {
    throw new Error("completeItem requires slug and itemKey");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    const item = state.items.find((i) => i.key === itemKey);
    if (!item) {
      throw new Error(`Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`);
    }

    if (item.status === "na") {
      return state; // N/A items are silently skipped
    }

    item.status = "done";
    item.error = null;
    writeState(slug, state);
    return state;
  });
}

/** Record a failure for a pipeline item. */
export function failItem(slug, itemKey, message, maxFailures = 10) {
  if (!slug || !itemKey) {
    throw new Error("failItem requires slug and itemKey");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    const item = state.items.find((i) => i.key === itemKey);
    if (!item) {
      throw new Error(`Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`);
    }

    item.status = "failed";
    item.error = message || "Unknown failure";

    state.errorLog.push({
      timestamp: new Date().toISOString(),
      itemKey,
      message: message || "Unknown failure",
      errorSignature: message ? computeErrorSignature(message) : null,
    });

    const failCount = state.errorLog.filter((e) => e.itemKey === itemKey).length;
    writeState(slug, state);

    return { state, failCount, halted: failCount >= maxFailures };
  });
}

/**
 * Salvage pipeline state for a Draft PR after an unfixable ("blocked") error.
 * Marks the failed item + post-deploy tests + code-cleanup as "na", allowing
 * the DAG to resolve directly to docs-archived → publish-pr.
 */
export function salvageForDraft(slug, failedItemKey) {
  if (!slug || !failedItemKey) {
    throw new Error("salvageForDraft requires slug and failedItemKey");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);

    // Idempotency guard — prevent duplicate salvage entries in parallel scenarios
    if (state.errorLog.some(e => e.itemKey === "salvage-draft")) {
      return state;
    }

    // Cascade: mark the failed item + all transitive downstream dependents as na
    const skipKeys = new Set(getDownstream(state, [failedItemKey]));
    const nodeCategories = state.nodeCategories || {};
    const forcePendingKeys = new Set(
      (state.salvageSurvivors && state.salvageSurvivors.length > 0)
        ? state.salvageSurvivors
        : state.items.filter(i => nodeCategories[i.key] === "finalize").map(i => i.key)
    );
    const skippedKeys = [];
    for (const item of state.items) {
      if (forcePendingKeys.has(item.key)) {
        item.status = "pending";
        item.error = null;
      } else if (item.status === "dormant") {
        continue;
      } else if ((skipKeys.has(item.key) || item.key === failedItemKey) && item.status !== "done") {
        item.status = "na";
        skippedKeys.push(item.key);
      }
    }

    state.errorLog.push({
      timestamp: new Date().toISOString(),
      itemKey: "salvage-draft",
      message: `Graceful degradation: ${failedItemKey} triggered salvage, skipped ${skippedKeys.join(", ")} for Draft PR.`,
    });

    writeState(slug, state);
    return state;
  });
}

/**
 * Resume the pipeline after a successful elevated infrastructure apply.
 * Undoes salvageForDraft by resetting salvaged items back to pending,
 * and resets poll-ci to pending so standard CI re-verifies the full stack.
 */
export function resumeAfterElevated(slug, maxCycles = 5) {
  if (!slug) {
    throw new Error("resumeAfterElevated requires slug");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);

    const counters = state.cycleCounters ?? (state.cycleCounters = {});
    const cycleCount = counters["resume-elevated"] ?? 0;
    if (cycleCount >= maxCycles) {
      return { state, cycleCount, halted: true };
    }

    const naByType = new Set(state.naByType || []);
    const forceResetKeys = new Set(
      state.items
        .filter((i) => (state.nodeTypes || {})[i.key] === "script" && (state.nodeCategories || {})[i.key] === "deploy")
        .map((i) => i.key),
    );
    let resetCount = 0;

    for (const item of state.items) {
      if (forceResetKeys.has(item.key) && item.status !== "na") {
        item.status = "pending";
        item.error = null;
        resetCount++;
        continue;
      }

      if (item.status === "na" && !naByType.has(item.key)) {
        item.status = "pending";
        item.error = null;
        resetCount++;
      }
    }

    state.elevatedApply = true;
    counters["resume-elevated"] = cycleCount + 1;

    state.errorLog.push({
      timestamp: new Date().toISOString(),
      itemKey: "resume-elevated",
      message: `Elevated apply resume cycle ${cycleCount + 1}/${maxCycles}. Reset ${resetCount} items to pending for standard CI re-verification.`,
    });

    writeState(slug, state);
    return { state, cycleCount: cycleCount + 1, halted: false };
  });
}

/**
 * Recover pipeline after a failed elevated infrastructure apply.
 * Records the failure on the infra CI observer, then delegates to resetNodes()
 * to cascade-reset from the infra dev entry point.
 */
export function recoverElevated(slug, errorMessage, maxFailCount = 10, maxDevCycles = 5) {
  if (!slug) {
    throw new Error("recoverElevated requires slug");
  }

  // Step 1: Record the failure on the infra CI observer via failItem
  const state = readStateOrThrow(slug);
  const cats = state.nodeCategories || {};
  const infraPollKey = state.items
    .filter((i) => cats[i.key] === "deploy" && (state.nodeTypes || {})[i.key] === "script" && i.key.includes("infra"))
    .at(-1)?.key;
  if (infraPollKey) {
    const failResult = failItem(slug, infraPollKey, `Elevated apply failed: ${errorMessage}`);
    const pollLogKey = infraPollKey;
    const failCount = failResult.state.errorLog.filter((e) => e.itemKey === pollLogKey).length;
    if (failCount >= maxFailCount) {
      return { state: failResult.state, failCount, halted: true };
    }
  }

  // Step 2: Derive the infra dev entry point and delegate to resetNodes
  const freshState = infraPollKey ? readStateOrThrow(slug) : state;
  const infraDevKey = freshState.items
    .find((i) => (freshState.nodeCategories || {})[i.key] === "dev"
      && (freshState.dependencies || {})[i.key]?.length === 0)?.key;
  if (!infraDevKey) {
    throw new Error("Cannot recover elevated state: no infrastructure dev node found in DAG.");
  }

  const reason = `Elevated infra apply failed — agent will diagnose and fix TF code. Error: ${errorMessage.slice(0, 200)}`;
  return resetNodes(slug, infraDevKey, reason, maxDevCycles, "reset-for-dev");
}

/**
 * Reset script nodes in a category (e.g. "deploy") for a re-push cycle.
 */
export function resetScripts(slug, category, maxCycles = 10) {
  if (!slug || !category) {
    throw new Error("resetScripts requires slug and category");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);

    const counters = state.cycleCounters ?? (state.cycleCounters = {});
    const logKey = `reset-scripts:${category}`;
    const cycleCount = counters[logKey] ?? 0;
    if (cycleCount >= maxCycles) {
      return { state, cycleCount, halted: true };
    }

    const resetKeys = new Set(
      state.items
        .filter((i) => (state.nodeTypes || {})[i.key] === "script" && (state.nodeCategories || {})[i.key] === category)
        .map((i) => i.key)
    );

    cascadeBarriers(state, resetKeys);

    let resetCount = 0;
    for (const item of state.items) {
      if (resetKeys.has(item.key) && item.status !== "na") {
        item.status = "pending";
        item.error = null;
        resetCount++;
      }
    }

    counters[logKey] = cycleCount + 1;

    state.errorLog.push({
      timestamp: new Date().toISOString(),
      itemKey: logKey,
      message: `Script re-push cycle for category "${category}" (cycle ${cycleCount + 1}/${maxCycles}). Reset ${resetCount} items: ${[...resetKeys].join(", ")}`,
    });

    writeState(slug, state);
    return { state, cycleCount: cycleCount + 1, halted: false };
  });
}

/**
 * Reset a single node + all transitive downstream dependents to pending.
 * Generic kernel primitive for DAG-cascading resets.
 */
export function resetNodes(slug, seedKey, reason, maxCycles = 5, logKey = "reset-nodes") {
  if (!slug || !seedKey) {
    throw new Error("resetNodes requires slug and seedKey");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);

    const counters = state.cycleCounters ?? (state.cycleCounters = {});
    const cycleCount = counters[logKey] ?? 0;
    if (cycleCount >= maxCycles) {
      return { state, cycleCount, halted: true };
    }

    const keysToReset = new Set(getDownstream(state, [seedKey]));
    cascadeBarriers(state, keysToReset);

    let resetCount = 0;
    for (const item of state.items) {
      if (keysToReset.has(item.key) && item.status !== "na") {
        // Dormant nodes in the cascade are only activated if they are the
        // explicit seed target (triage route_to). Transitive dormant dependents
        // stay dormant to avoid unintentional activation.
        if (item.status === "dormant" && item.key !== seedKey) continue;
        item.status = "pending";
        item.error = null;
        resetCount++;
      }
    }

    counters[logKey] = cycleCount + 1;

    state.errorLog.push({
      timestamp: new Date().toISOString(),
      itemKey: logKey,
      message: `Reset cycle ${cycleCount + 1}/${maxCycles}: ${reason}. Reset ${resetCount} items: ${[...keysToReset].join(", ")}`,
      errorSignature: reason ? computeErrorSignature(reason) : null,
    });

    writeState(slug, state);
    return { state, cycleCount: cycleCount + 1, halted: false };
  });
}

/** @deprecated Use `resetNodes` — backward-compat alias. */
export const resetForReroute = resetNodes;

/** Append an implementation note. */
export function setNote(slug, note) {
  if (!slug || !note) {
    throw new Error("setNote requires slug and note");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    state.implementationNotes = state.implementationNotes
      ? state.implementationNotes + "\n\n" + note
      : note;
    writeState(slug, state);
    return state;
  });
}

/**
 * Set a documentation note on a specific pipeline item.
 * Dev agents call this before pipeline:complete to pass architectural context
 * to the docs-expert agent ("Pass the Baton" pattern).
 */
export function setDocNote(slug, itemKey, note) {
  if (!slug || !itemKey || !note) {
    throw new Error("setDocNote requires slug, itemKey, and note");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    const item = state.items.find((i) => i.key === itemKey);
    if (!item) {
      throw new Error(`Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`);
    }

    item.docNote = note;
    writeState(slug, state);
    return state;
  });
}

/**
 * Set a structured handoff artifact on a pipeline item.
 * Dev agents use this to communicate typed contracts (testid maps, affected
 * routes, SSR-safety flags) to downstream agents (SDET, test runners).
 */
export function setHandoffArtifact(slug, itemKey, artifactJson) {
  if (!slug || !itemKey || !artifactJson) {
    throw new Error("setHandoffArtifact requires slug, itemKey, and artifactJson");
  }

  try {
    JSON.parse(artifactJson);
  } catch {
    throw new Error(`setHandoffArtifact: artifactJson must be valid JSON. Got: ${artifactJson.slice(0, 200)}`);
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    const item = state.items.find((i) => i.key === itemKey);
    if (!item) {
      throw new Error(`Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`);
    }

    item.handoffArtifact = artifactJson;
    writeState(slug, state);
    return state;
  });
}

/** Set the deployed URL. */
export function setUrl(slug, url) {
  if (!slug || !url) {
    throw new Error("setUrl requires slug and url");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    state.deployedUrl = url;
    writeState(slug, state);
    return state;
  });
}

/** Persist the last triage record to state for downstream context injection. */
export function setLastTriageRecord(slug, record) {
  if (!slug || !record) {
    throw new Error("setLastTriageRecord requires slug and record");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    state.lastTriageRecord = record;
    writeState(slug, state);
    return state;
  });
}

/**
 * Append an execution record to the persisted execution log.
 * Called by the kernel after every handler invocation. Records survive
 * orchestrator restarts and are used by the triage handler and node wrapper
 * for cross-attempt failure analysis (dedup, revert bypass, death spiral).
 */
export function persistExecutionRecord(slug, record) {
  if (!slug || !record) {
    throw new Error("persistExecutionRecord requires slug and record");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    if (!state.executionLog) state.executionLog = [];
    state.executionLog.push(record);
    writeState(slug, state);
    return state;
  });
}

/**
 * Set pre-built prompt context on a pipeline item for injection into its
 * next execution attempt. Written by the triage handler (or node wrapper)
 * after failure analysis. Consumed and cleared by the node wrapper.
 */
export function setPendingContext(slug, itemKey, context) {
  if (!slug || !itemKey) {
    throw new Error("setPendingContext requires slug and itemKey");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    const item = state.items.find((i) => i.key === itemKey);
    if (!item) {
      throw new Error(`Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`);
    }
    item.pendingContext = context;
    writeState(slug, state);
    return state;
  });
}
