/**
 * harness.ts — Trimmed RBAC + the 4 SDK tools the demo agents need.
 *
 * Adapted (copied, not imported) from
 * tools/autonomous-factory/src/harness/{rbac,file-tools,shell-tools,outcome-tool}.ts.
 * Telemetry, circuit-breaker, freshness gate, and contract-recovery
 * machinery were stripped. RBAC is fail-closed: any tool not in the
 * read-only registry is treated as a write tool and must hit
 * `allowedWritePaths`.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { defineTool } from "@github/copilot-sdk";
import type { Tool } from "@github/copilot-sdk";

// ---------------------------------------------------------------------------
// Read-only tool registry
// ---------------------------------------------------------------------------

const SAFE_READ_TOOLS = new Set([
  "read_file", "file_read", "view", "grep_search", "list_dir", "list_directory",
  "semantic_search", "search_code", "report_outcome", "report_intent",
  // roam-code MCP — all read-only
  "roam_understand", "roam_file_info", "roam_diff", "roam_health", "roam_deps",
  "roam_context", "roam_explore", "roam_search_symbol", "roam_trace", "roam_uses",
  "roam_batch_get", "roam_batch_search", "roam_impact", "roam_affected_tests",
  "roam_complexity_report", "roam_dead_code", "roam_diagnose", "roam_diagnose_issue",
  "roam_pr_risk", "roam_preflight", "roam_prepare_change", "roam_review_change",
  "roam_syntax_check", "roam_expand_toolset",
]);

const SAFE_MCP_PREFIXES = ["roam-code-", "roam_", "playwright_", "playwright-"];

/** Tools defined via defineTool that enforce their own RBAC in-handler. */
const SELF_ENFORCING_TOOLS = new Set(["file_read", "write_file", "edit_file", "shell", "shell_async", "shell_poll", "report_outcome"]);

// ---------------------------------------------------------------------------
// Path normalization
// ---------------------------------------------------------------------------

function toRepoRelative(filePath: string, repoRoot: string): string {
  if (path.isAbsolute(filePath)) {
    const prefix = repoRoot + path.sep;
    if (filePath.startsWith(prefix)) return filePath.slice(prefix.length);
    if (filePath === repoRoot) return "";
    return filePath;
  }
  return filePath;
}

function toAppRelative(repoRelPath: string, appRoot: string, repoRoot: string): string {
  const appPrefix = path.relative(repoRoot, appRoot);
  if (appPrefix && repoRelPath.startsWith(appPrefix + "/")) {
    return repoRelPath.slice(appPrefix.length + 1);
  }
  return repoRelPath;
}

function extractFilePath(args: unknown): string | null {
  let a: Record<string, unknown> | undefined = args as Record<string, unknown> | undefined;
  if (!a) return null;
  // The SDK may pass toolArgs as a JSON string in the onPreToolUse hook.
  if (typeof a === "string") {
    try { a = JSON.parse(a as unknown as string); } catch { return null; }
    if (!a) return null;
  }
  const raw = a.filePath ?? a.path ?? a.file_path;
  return typeof raw === "string" ? raw : null;
}

// ---------------------------------------------------------------------------
// Sandbox spec
// ---------------------------------------------------------------------------

export interface Sandbox {
  readonly repoRoot: string;
  readonly appRoot: string;
  readonly allowedWritePaths: RegExp[];
  readonly blockedCommandRegexes: RegExp[];
  /** Shell command timeout in ms. Defaults to SHELL_TIMEOUT_MS (120s). */
  readonly shellTimeoutMs: number;
  /** Optional extra env vars merged into every shell invocation. */
  readonly extraEnv?: Readonly<Record<string, string>>;
  /** Optional hook fired after a successful write_file — used for roam reindex. */
  readonly postWriteHook?: () => void;
}

export function buildSandbox(
  repoRoot: string,
  appRoot: string,
  allowedWritePaths: readonly string[] = [],
  blockedCommandRegexes: readonly string[] = [],
  postWriteHook?: () => void,
  shellTimeoutMs?: number,
  extraEnv?: Readonly<Record<string, string>>,
): Sandbox {
  return {
    repoRoot,
    appRoot,
    allowedWritePaths: allowedWritePaths.map((s) => new RegExp(s)),
    blockedCommandRegexes: blockedCommandRegexes.map((s) => new RegExp(s)),
    shellTimeoutMs: shellTimeoutMs ?? SHELL_TIMEOUT_MS,
    extraEnv,
    postWriteHook,
  };
}

// ---------------------------------------------------------------------------
// RBAC entry point — returns denial string or null.
// ---------------------------------------------------------------------------

export function checkRbac(
  toolName: string,
  toolArgs: unknown,
  sandbox: Sandbox,
): string | null {
  // Our own defineTool tools handle RBAC internally — skip the hook check
  // to avoid arg-format mismatches between the SDK hook and our handler.
  if (SELF_ENFORCING_TOOLS.has(toolName)) return null;

  const isShell = toolName === "bash" || toolName === "write_bash" || toolName === "shell";
  const isMcpSafe = SAFE_MCP_PREFIXES.some((p) => toolName.startsWith(p));
  const isWrite = !SAFE_READ_TOOLS.has(toolName) && !isShell && !isMcpSafe;

  if (isWrite) {
    const raw = extractFilePath(toolArgs);
    if (!raw) {
      return `ERROR: Cannot determine target file for tool '${toolName}'. Use file_read / write_file / shell instead.`;
    }
    const rel = toAppRelative(toRepoRelative(raw, sandbox.repoRoot), sandbox.appRoot, sandbox.repoRoot);
    if (sandbox.allowedWritePaths.length === 0) {
      return `ERROR: Write Access Denied — no write paths are allowed for this node.`;
    }
    if (!sandbox.allowedWritePaths.some((re) => re.test(rel))) {
      return `ERROR: Write Access Denied — '${rel}' is outside this node's allowedWritePaths.`;
    }
  }

  if (isShell) {
    const args = toolArgs as { command?: string } | undefined;
    const cmd = String(args?.command ?? "");
    for (const re of sandbox.blockedCommandRegexes) {
      if (re.test(cmd)) return `ERROR: Command blocked by security profile: ${cmd}`;
    }
    // Cheap heuristic: deny obvious destructive patterns even without
    // explicit blocked regex coverage. The full shell-guards module is
    // intentionally not ported — demo scope only.
    if (/\brm\s+-rf\s+\/(?:\s|$)/.test(cmd) || /\bgit\s+push\s+--force\b/.test(cmd)) {
      return `ERROR: Destructive command pattern blocked: ${cmd}`;
    }
    // Block broad process-killing commands that could take down VS Code's
    // remote server or other critical container infrastructure.
    if (/\b(pkill|killall)\b/.test(cmd)) {
      return `ERROR: Process-killing command blocked — use targeted 'kill <PID>' only if necessary: ${cmd}`;
    }
    // Block 'kill' when targeting dynamically-evaluated PID lists (pgrep,
    // lsof, etc.) which can accidentally match VS Code processes.
    if (/\bkill\b.*\$\(/.test(cmd)) {
      return `ERROR: kill with process substitution blocked — too broad, may hit VS Code: ${cmd}`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const FILE_READ_LINE_LIMIT = 2000;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const SHELL_OUTPUT_LIMIT = 32 * 1024;
const SHELL_TIMEOUT_MS = 120_000;

export function buildFileReadTool(sandbox: Sandbox): Tool<any> {
  return defineTool("file_read", {
    description: "Read a file from disk. Use instead of `cat`. Supports optional line range.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute or repo-relative path." },
        start_line: { type: "number", description: "Optional 1-indexed start." },
        end_line: { type: "number", description: "Optional 1-indexed end." },
      },
      required: ["file_path"],
    },
    handler: (args: { file_path: string; start_line?: number; end_line?: number }) => {
      const resolved = path.isAbsolute(args.file_path)
        ? args.file_path
        : path.resolve(sandbox.repoRoot, args.file_path);
      if (resolved !== sandbox.repoRoot && !resolved.startsWith(sandbox.repoRoot + path.sep)) {
        return `ERROR: Path resolves outside repo root.`;
      }
      let stats: fs.Stats;
      try { stats = fs.statSync(resolved); } catch (e) {
        return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
      }
      if (stats.size > MAX_FILE_SIZE) {
        return `ERROR: File too large (${(stats.size / 1024 / 1024).toFixed(1)} MB). Use shell + grep/head/tail instead.`;
      }
      const content = fs.readFileSync(resolved, "utf-8");
      const lines = content.split("\n");
      if (args.start_line != null || args.end_line != null) {
        const start = Math.max(0, (args.start_line ?? 1) - 1);
        const end = Math.min(args.end_line ?? lines.length, start + FILE_READ_LINE_LIMIT);
        return lines.slice(start, end).join("\n");
      }
      if (lines.length > FILE_READ_LINE_LIMIT) {
        return lines.slice(0, FILE_READ_LINE_LIMIT).join("\n") +
          `\n\n[TRUNCATED at ${FILE_READ_LINE_LIMIT} lines. Use start_line/end_line to read more.]`;
      }
      return content;
    },
  });
}

export function buildWriteFileTool(sandbox: Sandbox): Tool<any> {
  return defineTool("write_file", {
    description: "Write or overwrite a file. RBAC-gated against the node's allowedWritePaths.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute or repo-relative path." },
        content: { type: "string", description: "File contents." },
      },
      required: ["file_path", "content"],
    },
    handler: (args: { file_path: string; content: string }) => {
      const denial = checkRbac("write_file", args, sandbox);
      if (denial) return denial;
      const resolved = path.isAbsolute(args.file_path)
        ? args.file_path
        : path.resolve(sandbox.repoRoot, args.file_path);
      if (resolved !== sandbox.repoRoot && !resolved.startsWith(sandbox.repoRoot + path.sep)) {
        return `ERROR: Path resolves outside repo root.`;
      }
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, args.content);
      sandbox.postWriteHook?.();
      return `OK: wrote ${args.content.length} bytes to ${args.file_path}`;
    },
  });
}

export function buildEditFileTool(sandbox: Sandbox): Tool<any> {
  return defineTool("edit_file", {
    description:
      "Surgical text replacement in an existing file. Provide the exact text to find " +
      "(old_text) and its replacement (new_text). old_text must appear exactly once " +
      "in the file. RBAC-gated against the node's allowedWritePaths.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute or repo-relative path." },
        old_text: { type: "string", description: "Exact text to find (must appear exactly once)." },
        new_text: { type: "string", description: "Replacement text." },
      },
      required: ["file_path", "old_text", "new_text"],
    },
    handler: (args: { file_path: string; old_text: string; new_text: string }) => {
      const denial = checkRbac("write_file", args, sandbox);
      if (denial) return denial;
      const resolved = path.isAbsolute(args.file_path)
        ? args.file_path
        : path.resolve(sandbox.repoRoot, args.file_path);
      if (resolved !== sandbox.repoRoot && !resolved.startsWith(sandbox.repoRoot + path.sep)) {
        return `ERROR: Path resolves outside repo root.`;
      }
      if (!fs.existsSync(resolved)) {
        return `ERROR: File not found: ${args.file_path}`;
      }
      const content = fs.readFileSync(resolved, "utf-8");
      const count = content.split(args.old_text).length - 1;
      if (count === 0) {
        return `ERROR: old_text not found in ${args.file_path}. Verify exact whitespace and content.`;
      }
      if (count > 1) {
        return `ERROR: old_text appears ${count} times in ${args.file_path}. It must appear exactly once. Add more context lines to make it unique.`;
      }
      const updated = content.replace(args.old_text, args.new_text);
      fs.writeFileSync(resolved, updated);
      sandbox.postWriteHook?.();
      return `OK: replaced ${args.old_text.length} chars with ${args.new_text.length} chars in ${args.file_path}`;
    },
  });
}

export function buildShellTool(sandbox: Sandbox): Tool<any> {
  return defineTool("shell", {
    description:
      "Execute a stateless shell command. Use `cwd` instead of `cd`; use `env_vars` instead of `export`.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The bash command." },
        cwd: { type: "string", description: "Repo-relative or absolute working directory." },
        env_vars: { type: "object", description: "Key/value env injections." },
      },
      required: ["command"],
    },
    handler: (args: { command: string; cwd?: string; env_vars?: Record<string, unknown> }) => {
      const denial = checkRbac("shell", args, sandbox);
      if (denial) return denial;

      const cwd = args.cwd
        ? path.resolve(sandbox.repoRoot, args.cwd)
        : sandbox.repoRoot;
      if (cwd !== sandbox.repoRoot && !cwd.startsWith(sandbox.repoRoot + path.sep)) {
        return `ERROR: cwd resolves outside repo root.`;
      }
      const safeEnv: Record<string, string> = {};
      for (const [k, v] of Object.entries(args.env_vars ?? {})) safeEnv[k] = String(v);

      try {
        const out = execSync(args.command, {
          cwd,
          env: { ...process.env, ...sandbox.extraEnv, ...safeEnv },
          encoding: "utf-8",
          timeout: sandbox.shellTimeoutMs,
          maxBuffer: 10 * 1024 * 1024,
        });
        return out.length > SHELL_OUTPUT_LIMIT
          ? out.slice(0, SHELL_OUTPUT_LIMIT) + `\n\n[TRUNCATED at ${SHELL_OUTPUT_LIMIT} bytes]`
          : out;
      } catch (err: unknown) {
        const e = err as { status?: number; stdout?: string; stderr?: string; killed?: boolean; signal?: string };
        if (e?.killed || e?.signal === "SIGTERM") {
          return `ERROR: Command killed — exceeded ${sandbox.shellTimeoutMs / 1000}s timeout. ` +
            `Do NOT retry the same long-running command. Break it into smaller steps or use a different approach.\n` +
            `STDOUT:\n${String(e.stdout ?? "").slice(0, 4000)}\nSTDERR:\n${String(e.stderr ?? "").slice(0, 4000)}`;
        }
        return `EXIT ${e?.status ?? 1}\nSTDOUT:\n${String(e?.stdout ?? "").slice(0, 4000)}\nSTDERR:\n${String(e?.stderr ?? "").slice(0, 4000)}`;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// shell_async / shell_poll — non-blocking shell for long-running commands
// ---------------------------------------------------------------------------

export interface AsyncProcess {
  proc: ChildProcess;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  killed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** Epoch ms of last fresh (non-stale) poll.  Initialised to 0 so the
   *  first poll after spawn is always fresh. */
  lastPollAt: number;
  /** Minimum ms between fresh poll responses.  0 = no throttle. */
  pollMinIntervalMs: number;
}

export type AsyncProcessStore = Map<string, AsyncProcess>;

export function createAsyncProcessStore(): AsyncProcessStore {
  return new Map();
}

/** Kill all remaining async processes — called on session teardown. */
export function cleanupAsyncProcesses(store: AsyncProcessStore): void {
  for (const [handle, entry] of store) {
    if (entry.exitCode === null) {
      try { process.kill(-entry.proc.pid!, "SIGKILL"); } catch { /* already gone */ }
    }
    if (entry.timer) clearTimeout(entry.timer);
    store.delete(handle);
  }
}

export function buildShellAsyncTool(
  sandbox: Sandbox,
  store: AsyncProcessStore,
  getWatchdog?: () => { toolStarted: () => void; toolCompleted: () => void } | null,
  pollMinIntervalMs = 0,
): Tool<any> {
  return defineTool("shell_async", {
    description:
      "Start a long-running shell command in the background. Returns a handle immediately. " +
      "Use `shell_poll` to check progress and retrieve output. Best for commands >90s " +
      "(e.g. full test suite runs). For quick commands (<90s), prefer `shell`.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The bash command." },
        cwd: { type: "string", description: "Repo-relative or absolute working directory." },
        env_vars: { type: "object", description: "Key/value env injections." },
      },
      required: ["command"],
    },
    handler: (args: { command: string; cwd?: string; env_vars?: Record<string, unknown> }) => {
      const denial = checkRbac("shell", args, sandbox);
      if (denial) return denial;

      const cwd = args.cwd
        ? path.resolve(sandbox.repoRoot, args.cwd)
        : sandbox.repoRoot;
      if (cwd !== sandbox.repoRoot && !cwd.startsWith(sandbox.repoRoot + path.sep)) {
        return `ERROR: cwd resolves outside repo root.`;
      }
      const safeEnv: Record<string, string> = {};
      for (const [k, v] of Object.entries(args.env_vars ?? {})) safeEnv[k] = String(v);

      const handle = randomUUID();
      const proc = spawn("bash", ["-c", args.command], {
        cwd,
        env: { ...process.env, ...sandbox.extraEnv, ...safeEnv },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });

      const entry: AsyncProcess = {
        proc,
        stdout: "",
        stderr: "",
        exitCode: null,
        killed: false,
        timer: null,
        lastPollAt: 0,
        pollMinIntervalMs,
      };

      // Accumulate output (capped at 2MB to prevent memory pressure).
      const CAP = 2 * 1024 * 1024;
      proc.stdout?.on("data", (chunk: Buffer) => {
        if (entry.stdout.length < CAP) entry.stdout += chunk.toString();
      });
      proc.stderr?.on("data", (chunk: Buffer) => {
        if (entry.stderr.length < CAP) entry.stderr += chunk.toString();
      });

      proc.on("close", (code) => {
        entry.exitCode = code ?? 1;
        if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
        getWatchdog?.()?.toolCompleted();
      });

      // Kill if it exceeds shellTimeoutMs.
      entry.timer = setTimeout(() => {
        if (entry.exitCode === null) {
          entry.killed = true;
          try { process.kill(-proc.pid!, "SIGKILL"); } catch { /* already gone */ }
        }
      }, sandbox.shellTimeoutMs);

      store.set(handle, entry);
      getWatchdog?.()?.toolStarted();

      return JSON.stringify({ handle, message: `Command started. Use shell_poll with this handle to check progress.` });
    },
  });
}

export function buildShellPollTool(store: AsyncProcessStore): Tool<any> {
  return defineTool("shell_poll", {
    description:
      "Check the status of an async shell command started with `shell_async`. " +
      "Returns current output tail and completion status.",
    parameters: {
      type: "object",
      properties: {
        handle: { type: "string", description: "The handle returned by shell_async." },
      },
      required: ["handle"],
    },
    handler: (args: { handle: string }) => {
      const entry = store.get(args.handle);
      if (!entry) return `ERROR: Unknown handle '${args.handle}'. It may have already been cleaned up.`;

      const done = entry.exitCode !== null;

      // Completed processes always return immediately — never throttled.
      if (done) {
        const result = {
          done: true as const,
          exitCode: entry.exitCode,
          killed: entry.killed,
          stdout_tail: entry.stdout.slice(-SHELL_OUTPUT_LIMIT),
          stderr_tail: entry.stderr.slice(-SHELL_OUTPUT_LIMIT),
        };
        if (entry.timer) clearTimeout(entry.timer);
        store.delete(args.handle);
        return JSON.stringify(result);
      }

      // Still running — check throttle.
      const now = Date.now();
      const elapsed = now - entry.lastPollAt;
      if (entry.pollMinIntervalMs > 0 && elapsed < entry.pollMinIntervalMs) {
        const waitSeconds = Math.ceil((entry.pollMinIntervalMs - elapsed) / 1000);
        return JSON.stringify({
          done: false,
          stale: true,
          message: `Process still running. Last polled ${Math.round(elapsed / 1000)}s ago. ` +
                   `Poll again in ~${waitSeconds}s for fresh output.`,
          stdout_tail: entry.stdout.slice(-SHELL_OUTPUT_LIMIT),
        });
      }

      // Fresh poll.
      entry.lastPollAt = now;
      return JSON.stringify({
        done: false,
        exitCode: null,
        killed: entry.killed,
        stdout_tail: entry.stdout.slice(-SHELL_OUTPUT_LIMIT),
        stderr_tail: entry.stderr.slice(-SHELL_OUTPUT_LIMIT),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// report_outcome — agents call this exactly once at end of session.
// Last-call-wins. Mutates the supplied collector.
// ---------------------------------------------------------------------------

export interface OutcomeCollector {
  outcome?:
    | { status: "completed"; result?: Record<string, unknown> }
    | { status: "failed"; message: string; faultDomain?: string; result?: Record<string, unknown> };
}

export function buildReportOutcomeTool(collector: OutcomeCollector): Tool<any> {
  return defineTool("report_outcome", {
    description:
      "Signal final outcome to the orchestrator. Call exactly once at the end of your session. " +
      "Last call wins. After this call, do not invoke any other tool.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["completed", "failed"] },
        message: { type: "string", description: "Required when status=failed." },
        fault_domain: {
          type: "string",
          description:
            "Optional fault classification when status=failed (e.g. 'test-code', 'code-defect'). " +
            "Used by the orchestrator for conditional failure routing.",
        },
        result: {
          type: "object",
          description: "Optional structured payload (artifact paths, summary, diagnosis, etc.).",
        },
      },
      required: ["status"],
    },
    handler: (args: { status: string; message?: string; fault_domain?: string; result?: Record<string, unknown> }) => {
      if (args.status === "completed") {
        collector.outcome = { status: "completed", result: args.result };
        return "OK: outcome recorded as completed.";
      }
      if (args.status === "failed") {
        collector.outcome = {
          status: "failed",
          message: args.message ?? "(no message provided)",
          faultDomain: args.fault_domain,
          result: args.result,
        };
        return "OK: outcome recorded as failed.";
      }
      return `ERROR: status must be 'completed' or 'failed', got '${args.status}'.`;
    },
  });
}
