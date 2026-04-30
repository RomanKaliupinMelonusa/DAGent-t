/**
 * adapters/file-state/init.ts — Pipeline state initialization.
 *
 * Bootstraps a fresh _STATE.json from the APM-compiled context.json.
 * If the compiled context is missing, runs the APM compiler in-process
 * (no shell-out).
 *
 * The DAG-seeding math (topological sort + item factory) is delegated to
 * `domain/init-state.ts` so the impure adapter only owns I/O.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getAppRoot, statePath, transPath, today, writeState } from "./io.js";
import { buildInitialState } from "../../domain/init-state.js";
import { compileApm } from "../../apm/compiler.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
/**
 * Initialize pipeline state for a new feature.
 *
 * @param slug              - feature slug
 * @param workflowName      - workflow name (must exist in compiled context)
 * @param contextJsonPath   - optional override; defaults to APP_ROOT/.apm/.compiled/context.json
 */
export function initState(slug, workflowName, contextJsonPath) {
    if (!slug || !workflowName) {
        throw new Error("initState requires slug and workflowName");
    }
    const appRoot = getAppRoot();
    const ctxPath = contextJsonPath ?? join(appRoot, ".apm", ".compiled", "context.json");
    if (!existsSync(ctxPath)) {
        // Auto-compile APM context if missing.
        const apmYml = join(appRoot, ".apm", "apm.yml");
        if (!existsSync(apmYml)) {
            throw new Error(`No APM manifest found at ${apmYml}. Each app must have .apm/apm.yml.`);
        }
        console.log("ℹ  APM compiled context not found — compiling automatically…");
        try {
            compileApm(appRoot);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`APM auto-compilation failed: ${msg}\n` +
                `You can compile manually: cd ${join(__dirname, "../../..")} && npx tsx -e 'import{compileApm}from"./src/apm-compiler.ts";compileApm("${appRoot}");'`);
        }
        if (!existsSync(ctxPath)) {
            throw new Error(`APM compiled context still not found after auto-compilation: ${ctxPath}`);
        }
    }
    const context = JSON.parse(readFileSync(ctxPath, "utf-8"));
    const availableWorkflows = Object.keys(context.workflows ?? {});
    const workflow = context.workflows?.[workflowName];
    if (!workflow || !workflow.nodes) {
        throw new Error(`No workflow "${workflowName}" found in ${ctxPath}. ` +
            `Available workflows: ${availableWorkflows.join(", ") || "(none)"}. ` +
            `Check .apm/workflows.yml and recompile.`);
    }
    // Pure: build the seed state from the compiled DAG nodes.
    const seed = buildInitialState({
        feature: slug,
        workflowName,
        started: today(),
        nodes: workflow.nodes,
    });
    // Cast: domain returns a structurally compatible state; widen to the
    // full PipelineState shape with all optional fields.
    const state = seed;
    writeState(slug, state);
    return { state, statePath: statePath(slug), transPath: transPath(slug) };
}
//# sourceMappingURL=init.js.map