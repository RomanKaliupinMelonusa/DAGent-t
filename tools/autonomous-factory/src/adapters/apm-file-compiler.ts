/**
 * adapters/apm-file-compiler.ts — ContextCompiler adapter over apm-context-loader.ts.
 *
 * Wraps the synchronous APM compilation behind the async port interface.
 */

import type { ContextCompiler } from "../ports/context-compiler.js";
import type { ApmCompiledOutput } from "../apm/types.js";
import { loadApmContext } from "../apm/context-loader.js";
import { compileApm } from "../apm/compiler.js";

export class ApmFileCompiler implements ContextCompiler {
  async compile(appRoot: string): Promise<ApmCompiledOutput> {
    compileApm(appRoot);
    return this.load(appRoot);
  }

  async load(appRoot: string): Promise<ApmCompiledOutput> {
    return loadApmContext(appRoot);
  }
}
