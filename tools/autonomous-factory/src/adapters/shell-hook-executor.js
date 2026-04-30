/**
 * adapters/shell-hook-executor.ts — HookExecutor adapter over hooks.ts.
 *
 * Wraps the synchronous executeHook function behind the async port interface.
 */
import { executeHook } from "../lifecycle/hooks.js";
export class ShellHookExecutor {
    cwd;
    timeout;
    constructor(cwd, timeout = 30_000) {
        this.cwd = cwd;
        this.timeout = timeout;
    }
    async run(hookCommand, env) {
        const result = executeHook(hookCommand, env, this.cwd, this.timeout);
        if (!result) {
            return { exitCode: 0, output: "" };
        }
        return { exitCode: result.exitCode, output: result.stdout };
    }
}
//# sourceMappingURL=shell-hook-executor.js.map