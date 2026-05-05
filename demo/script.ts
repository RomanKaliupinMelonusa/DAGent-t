/**
 * script.ts — Execute a script node by spawning a shell command.
 *
 * Captures stdout/stderr to the per-attempt log file and returns
 * non-zero exit codes as failures with a summary.
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { NodeDef, RunState } from "./types.ts";

export interface ScriptRunResult {
  ok: boolean;
  result?: Record<string, unknown>;
  errorMessage?: string;
  logPath: string;
}

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

/** Substitute `{slug}`, `{appRoot}`, `{repoRoot}` in the template. */
function templateCommand(
  template: string,
  vars: { slug: string; appRoot: string; repoRoot: string },
): string {
  return template
    .replaceAll("{slug}", vars.slug)
    .replaceAll("{appRoot}", vars.appRoot)
    .replaceAll("{repoRoot}", vars.repoRoot);
}

export function runScriptNode(
  node: NodeDef,
  state: RunState,
  attempt: number,
  repoRoot: string,
  logPath: string,
): Promise<ScriptRunResult> {
  if (!node.command) {
    return Promise.resolve({
      ok: false,
      errorMessage: `Script node '${node.id}' is missing command.`,
      logPath,
    });
  }
  const appRoot = path.resolve(repoRoot, state.app);
  const command = templateCommand(node.command, {
    slug: state.slug,
    appRoot,
    repoRoot,
  });

  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  logStream.write(`[${new Date().toISOString()}] script.start attempt=${attempt} cmd=${command}\n`);

  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", command], {
      cwd: appRoot,
      env: { ...process.env, APP_ROOT: appRoot, REPO_ROOT: repoRoot, FEATURE_SLUG: state.slug },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.pipe(logStream, { end: false });
    child.stderr?.pipe(logStream, { end: false });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, node.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timeout);
      logStream.end(`\n[${new Date().toISOString()}] script.end exit=${code}\n`);
      if (code === 0) {
        resolve({ ok: true, result: { exitCode: 0 }, logPath });
      } else {
        resolve({
          ok: false,
          errorMessage: `Script '${node.id}' exited with code ${code}. See ${logPath}.`,
          result: { exitCode: code },
          logPath,
        });
      }
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      logStream.end(`\n[${new Date().toISOString()}] script.error ${err.message}\n`);
      resolve({
        ok: false,
        errorMessage: `Failed to spawn script: ${err.message}`,
        logPath,
      });
    });
  });
}
