/**
 * apm-context-loader.ts — Loads APM compiled context for the orchestrator.
 *
 * Provides `loadApmContext(appRoot)` which:
 * 1. Checks for a cached `.apm/.compiled/context.json`
 * 2. If stale, optionally runs `apm install` (native CLI) to fetch remote deps, then compiles via TS shim
 * 3. Validates the output against `ApmCompiledOutputSchema` (Zod)
 * 4. Performs defense-in-depth token budget re-validation
 * 5. Returns the typed `ApmCompiledOutput`
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ApmCompiledOutputSchema, ApmCompileError, } from "./types.js";
import { compileApm, getApmSourceMtime } from "./compiler.js";
// ---------------------------------------------------------------------------
// Native APM CLI detection (cached per process)
// ---------------------------------------------------------------------------
let _apmCliAvailable = null;
function isApmCliAvailable() {
    if (_apmCliAvailable !== null)
        return _apmCliAvailable;
    try {
        execSync("apm --version", { stdio: "ignore", timeout: 5000 });
        _apmCliAvailable = true;
    }
    catch {
        _apmCliAvailable = false;
    }
    return _apmCliAvailable;
}
/**
 * Uses the native APM CLI to fetch transitive remote dependencies.
 * The native `apm compile` produces markdown (not our context.json), so we
 * only use `apm install` for package management. The TS shim always handles
 * compilation into the orchestrator's JSON contract.
 */
function installWithCli(appRoot) {
    const apmDir = path.join(appRoot, ".apm");
    execSync("apm install", { cwd: apmDir, stdio: "pipe", timeout: 60_000 });
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Loads the compiled APM context for a given app root.
 * Compiles on-demand if the cached output is stale or missing.
 *
 * @throws {ApmCompileError} If compilation fails (missing files, invalid manifest, budget exceeded)
 * @throws {ApmCompileError} If the compiled output fails schema validation
 */
export function loadApmContext(appRoot) {
    const compiledPath = path.join(appRoot, ".apm", ".compiled", "context.json");
    const apmYmlPath = path.join(appRoot, ".apm", "apm.yml");
    // --- Check that .apm/apm.yml exists ---
    if (!fs.existsSync(apmYmlPath)) {
        throw new ApmCompileError(`No APM manifest found at ${apmYmlPath}. ` +
            `Each app must have .apm/apm.yml.`);
    }
    // --- Check if cached output is fresh ---
    let needsCompile = true;
    if (fs.existsSync(compiledPath)) {
        const cacheMtime = fs.statSync(compiledPath).mtimeMs;
        const sourceMtime = getApmSourceMtime(appRoot);
        if (cacheMtime > sourceMtime) {
            needsCompile = false;
        }
    }
    // --- Compile if needed ---
    if (needsCompile) {
        // If the native APM CLI is available, use it to fetch remote dependencies
        // (transitive skills/instructions from external repos). The CLI's `compile`
        // command outputs markdown, not our context.json, so we always use the TS
        // shim for the actual compilation into the orchestrator's JSON contract.
        if (isApmCliAvailable()) {
            try {
                installWithCli(appRoot);
            }
            catch {
                // Non-fatal — proceed with local files only
            }
        }
        compileApm(appRoot);
    }
    // --- Load and validate compiled output ---
    if (!fs.existsSync(compiledPath)) {
        throw new ApmCompileError(`APM compile succeeded but output not found at ${compiledPath}`);
    }
    const raw = JSON.parse(fs.readFileSync(compiledPath, "utf-8"));
    const result = ApmCompiledOutputSchema.safeParse(raw);
    if (!result.success) {
        throw new ApmCompileError(`APM compiled output failed validation: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`);
    }
    const output = result.data;
    // --- Defense-in-depth: re-validate token budgets ---
    for (const [agentKey, agent] of Object.entries(output.agents)) {
        if (agent.tokenCount > output.tokenBudget) {
            throw new ApmCompileError(`APM budget violation for agent "${agentKey}": ` +
                `${agent.tokenCount} tokens > budget ${output.tokenBudget}. ` +
                `Compiled output may be corrupt — try deleting .apm/.compiled/ and re-running.`);
        }
    }
    return output;
}
//# sourceMappingURL=context-loader.js.map