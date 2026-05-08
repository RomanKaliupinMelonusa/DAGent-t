/**
 * live-logger.ts — Real-time terminal output for pipeline execution.
 *
 * Encapsulated logger that prints structured, color-coded events to
 * stdout so operators can follow progress without tailing log files.
 *
 * Usage:
 *   const logger = createLiveLogger("dev", 1);
 *   logger.toolStart("shell", { command: "npm run build" });
 *   logger.toolComplete("shell", "exit 0");
 *   logger.toolDenied("shell", "blocked by RBAC");
 *   logger.info("Compiling components...");
 *   logger.error("Build failed");
 *   logger.done(true);
 */

// ─── ANSI helpers ────────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";

const NO_COLOR = !!process.env.NO_COLOR;

function c(color: string, text: string): string {
  return NO_COLOR ? text : `${color}${text}${RESET}`;
}

function timestamp(): string {
  return c(DIM, new Date().toISOString().slice(11, 19));
}

// ─── Public interface ────────────────────────────────────────────────────────

export interface LiveLogger {
  toolStart(tool: string, args?: unknown): void;
  toolComplete(tool: string, result?: string): void;
  toolDenied(tool: string, reason: string): void;
  info(message: string): void;
  error(message: string): void;
  done(ok: boolean, detail?: string): void;
}

export function createLiveLogger(nodeId: string, attempt: number): LiveLogger {
  const prefix = `${timestamp()} ${c(CYAN + BOLD, nodeId)}${c(DIM, `#${attempt}`)}`;

  // Recompute prefix each call for fresh timestamp
  const pfx = () => `${timestamp()} ${c(CYAN + BOLD, nodeId)}${c(DIM, `#${attempt}`)}`;

  return {
    toolStart(tool: string, args?: unknown) {
      const summary = formatArgs(tool, args);
      process.stdout.write(`${pfx()} ${c(MAGENTA, "▸")} ${tool}${summary}\n`);
    },

    toolComplete(tool: string, result?: string) {
      const short = result ? truncate(result, 120) : "";
      process.stdout.write(`${pfx()} ${c(GREEN, "✓")} ${tool}${short ? ` ${c(DIM, short)}` : ""}\n`);
    },

    toolDenied(tool: string, reason: string) {
      process.stdout.write(`${pfx()} ${c(RED, "✗")} ${tool} ${c(YELLOW, `DENIED: ${reason}`)}\n`);
    },

    info(message: string) {
      process.stdout.write(`${pfx()} ${c(DIM, "ℹ")} ${message}\n`);
    },

    error(message: string) {
      process.stdout.write(`${pfx()} ${c(RED, "✗")} ${message}\n`);
    },

    done(ok: boolean, detail?: string) {
      const icon = ok ? c(GREEN, "■ done") : c(RED, "■ failed");
      process.stdout.write(`${pfx()} ${icon}${detail ? ` — ${detail}` : ""}\n`);
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  const oneLine = s.replace(/\n/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max) + "…" : oneLine;
}

function formatArgs(tool: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  switch (tool) {
    case "shell":
      return a.command ? ` ${c(DIM, truncate(String(a.command), 80))}` : "";
    case "write_file":
      return a.path ? ` ${c(DIM, String(a.path))}` : "";
    case "file_read":
      return a.path ? ` ${c(DIM, String(a.path))}` : "";
    default:
      return "";
  }
}
