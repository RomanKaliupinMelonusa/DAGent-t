/**
 * ports/triage-artifact-loader.ts — Triage-specific artifact loader port.
 *
 * Decouples `triage-handler.ts` from the `.dagent/<slug>_*.{yml,json}`
 * filesystem convention. The triage handler must not know where
 * acceptance contracts, validation verdicts, or rejection-context logs
 * live on disk — it asks this port.
 *
 * Ports are pure interface declarations — this file must not import
 * adapters, filesystem modules, or concrete implementations.
 */
export {};
//# sourceMappingURL=triage-artifact-loader.js.map