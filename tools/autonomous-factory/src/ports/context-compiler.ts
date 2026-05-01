/**
 * ports/context-compiler.ts — Port interface for APM context compilation.
 *
 * Abstracts the APM compiler behind an async interface.
 * Production adapter wraps apm-compiler.ts; tests use a stub.
 */

import type { ApmCompiledOutput } from "../apm/index.js";

export interface ContextCompiler {
  /** Compile APM context from the app's .apm/ directory. */
  compile(appRoot: string): Promise<ApmCompiledOutput>;

  /** Load a previously compiled context.json. */
  load(appRoot: string): Promise<ApmCompiledOutput>;
}
