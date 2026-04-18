/**
 * harness/shell-tools.ts — Custom `shell` tool.
 *
 * Structured, safe alternative to raw bash: enforces RBAC + bouncers,
 * caps output and execution time, and coerces env var values to strings.
 */

import path from "node:path";
import { execSync } from "node:child_process";
import { defineTool } from "@github/copilot-sdk";
import type { Tool } from "@github/copilot-sdk";
import type { AgentSandbox } from "../harness/sandbox.js";
import {
  type ResolvedHarnessLimits,
  defaultHarnessLimits,
} from "./limits.js";
import { checkShellCommand } from "./shell-guards.js";
import { checkRbac } from "./rbac.js";

export function buildShellTool(
  repoRoot: string,
  sandbox: AgentSandbox,
  appRoot: string,
  limits: ResolvedHarnessLimits = defaultHarnessLimits(),
): Tool<any> {
  const { allowedWritePaths, blockedCommandRegexes, safeMcpPrefixes } = sandbox;
  const { shellOutputLimit, shellTimeoutMs } = limits;

  return defineTool("shell", {
    description:
      "Execute a stateless shell command. Use `cwd` to set the working directory " +
      "and `env_vars` to inject environment variables instead of `cd`, `export`, or `source`.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The bash command to run." },
        cwd: {
          type: "string",
          description: "OPTIONAL: Absolute or repo-relative path (e.g., 'apps/sample-app/service-a').",
        },
        env_vars: {
          type: "object",
          description: 'OPTIONAL: Key-value pairs to inject (e.g., {"NODE_ENV": "test"}).',
        },
      },
      required: ["command"],
    },
    handler: (args: { command: string; cwd?: string; env_vars?: Record<string, string> }) => {
      // Run RBAC checks first (no hookCwd — custom tool resolves cwd from args internally)
      const rbacDenial = checkRbac("shell", args, repoRoot, allowedWritePaths, blockedCommandRegexes, safeMcpPrefixes, appRoot);
      if (rbacDenial) return rbacDenial;

      // Run shared bouncer checks
      const rejection = checkShellCommand(args.command);
      if (rejection) return rejection;

      const cwd = args.cwd ? path.resolve(repoRoot, args.cwd) : repoRoot;

      // Security: prevent cwd traversal outside repo (CWE-22)
      if (cwd !== repoRoot && !cwd.startsWith(repoRoot + path.sep)) {
        return `ERROR: cwd "${args.cwd}" resolves outside the repository root. Use a repo-relative path.`;
      }

      // Coerce all env var values to strings — LLMs may hallucinate
      // booleans/numbers which would crash execSync with a TypeError.
      const safeEnvVars: Record<string, string> = {};
      for (const [key, value] of Object.entries(args.env_vars || {})) {
        safeEnvVars[key] = String(value);
      }
      const env = { ...process.env, ...safeEnvVars };

      try {
        const stdout = execSync(args.command, {
          cwd,
          env,
          encoding: "utf-8",
          timeout: shellTimeoutMs,
          maxBuffer: 10 * 1024 * 1024, // 10 MB
        });

        // Cap output to prevent token bloat
        if (stdout.length > shellOutputLimit) {
          return (
            stdout.slice(0, shellOutputLimit) +
            `\n\n[SYSTEM WARNING: Output truncated at ${shellOutputLimit} characters. ` +
            "Pipe through head/tail/grep to narrow results.]"
          );
        }
        return stdout;
      } catch (err: unknown) {
        // Smart Tool Timeout: detect forcefully killed commands (SIGTERM from timeout)
        // and return partial output with a system directive instead of a generic exit code.
        if (err && typeof err === "object" && "killed" in err && (err as Record<string, unknown>).killed === true) {
          const e = err as { stderr?: string; stdout?: string };
          const partialStdout = String(e.stdout ?? "").slice(0, 4000);
          const partialStderr = String(e.stderr ?? "").slice(0, 4000);
          return (
            `${partialStdout}\n${partialStderr}\n\n` +
            `[SYSTEM ENFORCED: Command forcefully terminated after ${shellTimeoutMs / 1000}s ` +
            `to prevent hanging. Assess the partial output above. ` +
            `DO NOT retry this exact command. Call pipeline:fail or pipeline:complete.]`
          );
        }
        if (err && typeof err === "object" && "stderr" in err) {
          const e = err as { stderr?: string; stdout?: string; status?: number };
          const stderr = String(e.stderr ?? "").slice(0, 4000);
          const stdout = String(e.stdout ?? "").slice(0, 4000);
          return `EXIT ${e.status ?? 1}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
        }
        return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}
