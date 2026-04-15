/**
 * triage/index.ts — Barrel exports for the triage subsystem.
 */

export { retrieveTopMatches } from "./retriever.js";
export { askLlmRouter } from "./llm-router.js";
export { computeErrorSignature, normalizeError } from "./error-fingerprint.js";
