/**
 * adapters/apm-file-compiler.ts — ContextCompiler adapter over apm-context-loader.ts.
 *
 * Wraps the synchronous APM compilation behind the async port interface.
 */
import { loadApmContext } from "../apm/context-loader.js";
import { compileApm } from "../apm/compiler.js";
export class ApmFileCompiler {
    async compile(appRoot) {
        compileApm(appRoot);
        return this.load(appRoot);
    }
    async load(appRoot) {
        return loadApmContext(appRoot);
    }
}
//# sourceMappingURL=apm-file-compiler.js.map