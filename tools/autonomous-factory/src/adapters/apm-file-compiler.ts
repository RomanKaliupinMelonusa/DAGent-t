/**
 * adapters/apm-file-compiler.ts — ContextCompiler adapter over apm-context-loader.ts.
 *
 * Wraps the synchronous APM compilation behind the async port interface.
 */

import type { ContextCompiler } from "../ports/context-compiler.js";
import type { ApmCompiledOutput } from "../apm/index.js";
import { loadApmContext } from "../apm/compile/context-loader.js";
import { compileApm } from "../apm/compile/compiler.js";

export class ApmFileCompiler implements ContextCompiler {
  async compile(appRoot: string): Promise<ApmCompiledOutput> {
    compileApm(appRoot);
    return this.load(appRoot);
  }

  async load(appRoot: string): Promise<ApmCompiledOutput> {
    return loadApmContext(appRoot);
  }
}
