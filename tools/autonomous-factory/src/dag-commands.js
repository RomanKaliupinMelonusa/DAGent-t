/**
 * dag-commands.ts — Handler → kernel graph-mutation protocol.
 *
 * Discriminated union of graph-mutation commands that any handler can
 * return. The kernel's dispatch layer is the sole authority that
 * translates these into state API calls.
 *
 * This module is intentionally neutral — it lives outside handlers/ and
 * kernel/ so both layers can import it without creating a forbidden
 * handlers ↔ kernel cycle.
 *
 * Any handler type (triage, agent, script, custom) can emit any command.
 * New command types can be added here without touching handlers.
 */
export {};
//# sourceMappingURL=dag-commands.js.map