/**
 * apm/index.ts — Barrel for the APM (Agent Persona Manifest) subsystem.
 *
 * The APM compiler resolves declarative `.apm/apm.yml` manifests into:
 *   - per-agent system prompts with persona-specific instruction fragments
 *   - validated token budgets
 *   - MCP server bindings
 *   - skill declarations
 *
 * Public surface used by `bootstrap.ts`, `main.ts`, handlers, and tests.
 */

export * from "./types.js";
export { compileApm, getApmSourceMtime } from "./compiler.js";
export { loadApmContext } from "./context-loader.js";
export { getAgentConfig, buildTaskPrompt } from "./agents.js";
