/**
 * ports/shell.ts — Port interface for generic shell command execution.
 *
 * Abstracts `child_process` behind an async contract. Handlers that need
 * to shell out (local-exec, CI polling, artifact download) must depend on
 * this port; the composition root wires the Node-backed adapter.
 *
 * Ports are pure interface declarations — this file must not import
 * node:child_process or any adapter.
 */
export {};
//# sourceMappingURL=shell.js.map