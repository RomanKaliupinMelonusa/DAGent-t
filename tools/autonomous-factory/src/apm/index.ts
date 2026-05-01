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
 *
 * The implementation lives under sub-folders by responsibility:
 *   - manifest/   — Zod schemas + types (apm.yml/workflows.yml shape)
 *   - compile/    — manifest → compiled context (compiler, loader, lints)
 *   - runtime/    — per-dispatch agent prompt factory
 *   - artifacts/  — artifact-kind catalog + topological IO validator
 *   - security/   — path sandbox helpers
 */

export * from "./manifest/types.js";
export * from "./manifest/acceptance-schema.js";
export * from "./artifacts/artifact-catalog.js";
export { compileApm, getApmSourceMtime } from "./compile/compiler.js";
export { loadApmContext } from "./compile/context-loader.js";
export { getAgentConfig, buildTaskPrompt } from "./runtime/agents.js";
export type {
  AgentContext,
  AgentConfig,
  McpServerConfig,
  McpLocalServerConfig,
  McpRemoteServerConfig,
  BuildTaskPromptOptions,
} from "./runtime/agents.js";
