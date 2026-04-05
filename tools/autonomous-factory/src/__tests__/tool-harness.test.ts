/**
 * tool-harness.test.ts — Unit tests for shell bouncers, file_read handler,
 * and shell tool handler.
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npx tsx src/__tests__/tool-harness.test.ts
 */

import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  checkShellCommand,
  checkRbac,
  buildSessionHooks,
  buildCustomTools,
  FILE_READ_LINE_LIMIT,
  MAX_FILE_SIZE,
  STATELESS_CMD_RE,
  RECURSIVE_SEARCH_RE,
  SHELL_CHAIN_RE,
  CODE_FILE_RE,
  CODE_READ_CMD_RE,
  ERR_STATELESS_CMD,
  ERR_RECURSIVE_SEARCH,
  ERR_CODE_READ,
  FILE_TRUNCATION_WARNING,
  VALIDATOR_ALLOW_RE,
  MAKER_BLOCK_RE,
  MAKER_CLOUD_CLI_RE,
  ERR_VALIDATOR_WRITE,
  ERR_MAKER_WRITE,
  ERR_MAKER_CLOUD_CLI,
  CD_CMD_RE,
  ERR_CD_CMD,
  SAFE_READ_TOOLS,
} from "../tool-harness.js";

const REPO_ROOT = "/workspaces/DAGent-t";

/** Neutral itemKey that triggers no RBAC (unconstrained archetype) */
const NEUTRAL_KEY = "deploy-manager";

/** Empty sets for migration-mode (no Zero-Trust filtering) */
const NO_CORE = new Set<string>();
const NO_MCP = new Set<string>();

// ---------------------------------------------------------------------------
// Regex constant smoke tests
// ---------------------------------------------------------------------------

describe("bouncer regex constants", () => {
  it("STATELESS_CMD_RE matches standalone cd/source/export/alias", () => {
    assert.ok(STATELESS_CMD_RE.test("cd /tmp"));
    assert.ok(STATELESS_CMD_RE.test("source ~/.bashrc"));
    assert.ok(STATELESS_CMD_RE.test("export FOO=bar"));
    assert.ok(STATELESS_CMD_RE.test("alias ll='ls -la'"));
  });

  it("STATELESS_CMD_RE does not match non-stateless commands", () => {
    assert.ok(!STATELESS_CMD_RE.test("npm test"));
    assert.ok(!STATELESS_CMD_RE.test("ls -la"));
    assert.ok(!STATELESS_CMD_RE.test("echo hello"));
  });

  it("RECURSIVE_SEARCH_RE matches unbounded searches", () => {
    assert.ok(RECURSIVE_SEARCH_RE.test("grep -r pattern ."));
    assert.ok(RECURSIVE_SEARCH_RE.test("grep -R pattern ."));
    assert.ok(RECURSIVE_SEARCH_RE.test("find . -name '*.ts'"));
    assert.ok(RECURSIVE_SEARCH_RE.test("ag . -l pattern"));
  });

  it("RECURSIVE_SEARCH_RE matches broadened patterns (find src, rg, ag, mixed flags)", () => {
    assert.ok(RECURSIVE_SEARCH_RE.test("find src -name '*.ts'"));
    assert.ok(RECURSIVE_SEARCH_RE.test("find apps -type f"));
    assert.ok(RECURSIVE_SEARCH_RE.test("find packages -name '*.json'"));
    assert.ok(RECURSIVE_SEARCH_RE.test("rg TODO"));
    assert.ok(RECURSIVE_SEARCH_RE.test("rg -l 'import' src/"));
    assert.ok(RECURSIVE_SEARCH_RE.test("ag 'pattern'"));
    assert.ok(RECURSIVE_SEARCH_RE.test("grep -irl pattern ."));
    assert.ok(RECURSIVE_SEARCH_RE.test("grep --include='*.ts' -rn TODO ."));
  });

  it("SHELL_CHAIN_RE matches shell compound operators", () => {
    assert.ok(SHELL_CHAIN_RE.test("cd /tmp && ls"));
    assert.ok(SHELL_CHAIN_RE.test("cd /tmp || exit 1"));
    assert.ok(SHELL_CHAIN_RE.test("cd /tmp; npm test"));
    assert.ok(SHELL_CHAIN_RE.test("cd /tmp\nnpm test"));
    assert.ok(!SHELL_CHAIN_RE.test("cd /tmp"));
  });

  it("CODE_FILE_RE matches code extensions", () => {
    assert.ok(CODE_FILE_RE.test("src/index.ts"));
    assert.ok(CODE_FILE_RE.test("app.tsx"));
    assert.ok(CODE_FILE_RE.test("main.py"));
    assert.ok(CODE_FILE_RE.test("infra/main.tf"));
    assert.ok(!CODE_FILE_RE.test("README.md"));
    assert.ok(!CODE_FILE_RE.test("data.json"));
  });

  it("CD_CMD_RE matches cd/pushd anywhere in command", () => {
    assert.ok(CD_CMD_RE.test("cd /tmp"));
    assert.ok(CD_CMD_RE.test("cd backend && npm test"));
    assert.ok(CD_CMD_RE.test("echo hello; cd infra"));
    assert.ok(CD_CMD_RE.test("echo ok && cd infra && terraform plan"));
    assert.ok(CD_CMD_RE.test("pushd /tmp && npm build"));
    assert.ok(!CD_CMD_RE.test("npm test"));
    assert.ok(!CD_CMD_RE.test("echo cd is not a command"));
    assert.ok(!CD_CMD_RE.test("ls -la"));
  });
});

// ---------------------------------------------------------------------------
// checkShellCommand
// ---------------------------------------------------------------------------

describe("checkShellCommand", () => {
  // --- Denied cases ---

  it("denies standalone cd (caught by CD_CMD_RE before STATELESS_CMD_RE)", () => {
    assert.equal(checkShellCommand("cd /tmp"), ERR_CD_CMD);
  });

  it("denies standalone source", () => {
    assert.equal(checkShellCommand("source ~/.bashrc"), ERR_STATELESS_CMD);
  });

  it("denies standalone export", () => {
    assert.equal(checkShellCommand("export FOO=bar"), ERR_STATELESS_CMD);
  });

  it("denies standalone alias", () => {
    assert.equal(checkShellCommand("alias ll='ls -la'"), ERR_STATELESS_CMD);
  });

  it("denies cd in compound command (&&)", () => {
    assert.equal(checkShellCommand("cd /tmp && ls"), ERR_CD_CMD);
  });

  it("denies cd with semicolon chaining", () => {
    assert.equal(checkShellCommand("cd backend; npm test"), ERR_CD_CMD);
  });

  it("denies cd with OR operator", () => {
    assert.equal(checkShellCommand("cd backend || exit 1"), ERR_CD_CMD);
  });

  it("denies cd in multiline script", () => {
    assert.equal(checkShellCommand("cd backend\nnpm test"), ERR_CD_CMD);
  });

  it("denies pushd in compound command", () => {
    assert.equal(checkShellCommand("pushd /tmp && npm build"), ERR_CD_CMD);
  });

  it("denies chained cd after semicolon", () => {
    assert.equal(checkShellCommand("echo hello; cd infra && terraform plan"), ERR_CD_CMD);
  });

  it("denies grep -r", () => {
    assert.equal(checkShellCommand("grep -r pattern ."), ERR_RECURSIVE_SEARCH);
  });

  it("denies grep -R", () => {
    assert.equal(checkShellCommand("grep -R pattern ."), ERR_RECURSIVE_SEARCH);
  });

  it("denies find .", () => {
    assert.equal(checkShellCommand("find . -name '*.ts'"), ERR_RECURSIVE_SEARCH);
  });

  it("denies ag .", () => {
    assert.equal(checkShellCommand("ag . -l 'pattern'"), ERR_RECURSIVE_SEARCH);
  });

  it("denies find on common root directories", () => {
    assert.equal(checkShellCommand("find src -name '*.ts'"), ERR_RECURSIVE_SEARCH);
    assert.equal(checkShellCommand("find apps -type f"), ERR_RECURSIVE_SEARCH);
    assert.equal(checkShellCommand("find packages -name '*.json'"), ERR_RECURSIVE_SEARCH);
  });

  it("denies ripgrep (rg)", () => {
    assert.equal(checkShellCommand("rg TODO"), ERR_RECURSIVE_SEARCH);
    assert.equal(checkShellCommand("rg -l 'import' src/"), ERR_RECURSIVE_SEARCH);
  });

  it("denies ag without dot", () => {
    assert.equal(checkShellCommand("ag 'pattern'"), ERR_RECURSIVE_SEARCH);
  });

  it("denies grep with mixed flags including -r", () => {
    assert.equal(checkShellCommand("grep -irl pattern ."), ERR_RECURSIVE_SEARCH);
    assert.equal(checkShellCommand("grep --include='*.ts' -rn TODO ."), ERR_RECURSIVE_SEARCH);
  });

  it("denies cat on code file", () => {
    assert.equal(checkShellCommand("cat src/index.ts"), ERR_CODE_READ);
  });

  it("denies grep on code file", () => {
    assert.equal(checkShellCommand("grep pattern src/index.ts"), ERR_CODE_READ);
  });

  it("denies cat on .tsx file", () => {
    assert.equal(checkShellCommand("cat components/App.tsx"), ERR_CODE_READ);
  });

  it("denies cat on .py file", () => {
    assert.equal(checkShellCommand("cat script.py"), ERR_CODE_READ);
  });

  it("denies cat on .tf file", () => {
    assert.equal(checkShellCommand("cat infra/main.tf"), ERR_CODE_READ);
  });

  // --- Allowed cases ---

  it("allows cat on non-code file", () => {
    assert.equal(checkShellCommand("cat README.md"), null);
  });

  it("allows cat on JSON file", () => {
    assert.equal(checkShellCommand("cat package.json"), null);
  });

  it("allows npm test", () => {
    assert.equal(checkShellCommand("npm test"), null);
  });

  it("allows ls -la", () => {
    assert.equal(checkShellCommand("ls -la"), null);
  });

  it("allows targeted grep (non-recursive, non-code)", () => {
    assert.equal(checkShellCommand("grep pattern README.md"), null);
  });

  it("allows echo with redirect", () => {
    assert.equal(checkShellCommand("echo hello > output.txt"), null);
  });

  it("trims leading whitespace", () => {
    assert.equal(checkShellCommand("  cd /tmp"), ERR_CD_CMD);
  });
});

// ---------------------------------------------------------------------------
// buildSessionHooks — onPreToolUse
// ---------------------------------------------------------------------------

describe("buildSessionHooks.onPreToolUse", () => {
  const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, NO_CORE, NO_MCP);
  const preHook = hooks.onPreToolUse!;
  const baseInput = { timestamp: Date.now(), cwd: REPO_ROOT };

  it("denies bash with cd command", () => {
    const result = preHook(
      { toolName: "bash", toolArgs: { command: "cd /tmp" }, ...baseInput },
      { sessionId: "test" },
    );
    assert.ok(result);
    assert.equal((result as any).permissionDecision, "deny");
    assert.ok((result as any).additionalContext?.includes("cd"));
  });

  it("denies bash with cat on code file", () => {
    const result = preHook(
      { toolName: "bash", toolArgs: { command: "cat src/index.ts" }, ...baseInput },
      { sessionId: "test" },
    );
    assert.ok(result);
    assert.equal((result as any).permissionDecision, "deny");
    assert.ok((result as any).additionalContext?.includes("context bloat"));
  });

  it("denies write_bash with grep -r", () => {
    const result = preHook(
      { toolName: "write_bash", toolArgs: { command: "grep -r TODO ." }, ...baseInput },
      { sessionId: "test" },
    );
    assert.ok(result);
    assert.equal((result as any).permissionDecision, "deny");
  });

  it("allows bash with safe command", () => {
    const result = preHook(
      { toolName: "bash", toolArgs: { command: "npm test" }, ...baseInput },
      { sessionId: "test" },
    );
    assert.equal(result, undefined); // pass-through
  });

  it("ignores non-bash tools", () => {
    const result = preHook(
      { toolName: "read_file", toolArgs: { filePath: "/tmp/foo" }, ...baseInput },
      { sessionId: "test" },
    );
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// buildSessionHooks — onPostToolUse
// ---------------------------------------------------------------------------

describe("buildSessionHooks.onPostToolUse", () => {
  const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, NO_CORE, NO_MCP);
  const postHook = hooks.onPostToolUse!;
  const baseInput = { timestamp: Date.now(), cwd: REPO_ROOT };

  it("truncates read_file result exceeding 500 lines", () => {
    const bigContent = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`).join("\n");
    const result = postHook(
      {
        toolName: "read_file",
        toolArgs: {},
        toolResult: { textResultForLlm: bigContent, resultType: "success" },
        ...baseInput,
      },
      { sessionId: "test" },
    );
    assert.ok(result);
    const modified = (result as any).modifiedResult.textResultForLlm as string;
    assert.ok(modified.includes("line 500"));
    assert.ok(!modified.includes("line 501\n"));
    assert.ok(modified.includes("[SYSTEM WARNING:"));
  });

  it("does not truncate read_file result under 500 lines", () => {
    const smallContent = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
    const result = postHook(
      {
        toolName: "read_file",
        toolArgs: {},
        toolResult: { textResultForLlm: smallContent, resultType: "success" },
        ...baseInput,
      },
      { sessionId: "test" },
    );
    assert.equal(result, undefined); // no modification
  });

  it("truncates even when startLine/endLine are provided (Review #3)", () => {
    const bigContent = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`).join("\n");
    const result = postHook(
      {
        toolName: "read_file",
        toolArgs: { startLine: 1, endLine: 600 },
        toolResult: { textResultForLlm: bigContent, resultType: "success" },
        ...baseInput,
      },
      { sessionId: "test" },
    );
    // Review #3: onPostToolUse now enforces truncation unconditionally
    assert.ok(result, "should return a modified result");
    const modified = (result as any).modifiedResult.textResultForLlm as string;
    assert.ok(modified.includes("[SYSTEM WARNING:"));
    const lineCount = modified.split("\n").length;
    assert.ok(lineCount <= FILE_READ_LINE_LIMIT + 5, `expected ≤${FILE_READ_LINE_LIMIT + 5} lines, got ${lineCount}`);
  });

  it("ignores non-read_file tools", () => {
    const result = postHook(
      {
        toolName: "bash",
        toolArgs: {},
        toolResult: { textResultForLlm: "x".repeat(100000), resultType: "success" },
        ...baseInput,
      },
      { sessionId: "test" },
    );
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// buildCustomTools — file_read handler
// ---------------------------------------------------------------------------

describe("file_read tool handler", () => {
  const tools = buildCustomTools(REPO_ROOT, NEUTRAL_KEY);
  const fileReadTool = tools.find((t) => t.name === "file_read")!;

  it("is registered with correct name", () => {
    assert.ok(fileReadTool);
    assert.equal(fileReadTool.name, "file_read");
  });

  // We test the handler directly — it reads from the filesystem.
  // Use a file known to exist in the repo.
  it("reads an existing file", () => {
    const result = fileReadTool.handler(
      { file_path: "package.json" },
      { sessionId: "test", toolCallId: "tc1", toolName: "file_read", arguments: {} },
    );
    assert.ok(typeof result === "string");
    assert.ok((result as string).includes("agentic-pipeline-platform"));
  });

  it("returns error for non-existent file", () => {
    const result = fileReadTool.handler(
      { file_path: "this-file-does-not-exist.xyz" },
      { sessionId: "test", toolCallId: "tc2", toolName: "file_read", arguments: {} },
    );
    assert.ok(typeof result === "string");
    assert.ok((result as string).startsWith("ERROR:"));
  });

  it("rejects path traversal outside repo", () => {
    const result = fileReadTool.handler(
      { file_path: "../../etc/passwd" },
      { sessionId: "test", toolCallId: "tc3", toolName: "file_read", arguments: {} },
    );
    assert.ok(typeof result === "string");
    assert.ok((result as string).includes("outside the repository root"));
  });

  it("rejects sibling-directory traversal (CWE-22 boundary check)", () => {
    // A naive startsWith("/workspaces/DAGent-t") would pass for DAGent-t-evil
    const result = fileReadTool.handler(
      { file_path: "/workspaces/DAGent-t-evil/etc/passwd" },
      { sessionId: "test", toolCallId: "tc3b", toolName: "file_read", arguments: {} },
    );
    assert.ok(typeof result === "string");
    assert.ok((result as string).includes("outside the repository root"));
  });

  it("truncates files exceeding 500 lines when no line range given", () => {
    const tmpFile = path.join(REPO_ROOT, "__test-truncation-600.tmp");
    try {
      const bigContent = Array.from({ length: 600 }, (_, i) => `line-${i + 1}`).join("\n");
      fs.writeFileSync(tmpFile, bigContent, "utf-8");

      const result = fileReadTool.handler(
        { file_path: "__test-truncation-600.tmp" },
        { sessionId: "test", toolCallId: "tc3c", toolName: "file_read", arguments: {} },
      ) as string;

      assert.ok(result.includes("line-500"));
      assert.ok(!result.includes("line-501\n"));
      assert.ok(result.includes("[SYSTEM WARNING:"));
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  });

  it("returns exact slice when start_line/end_line are provided", () => {
    const tmpFile = path.join(REPO_ROOT, "__test-slice.tmp");
    try {
      const content = Array.from({ length: 20 }, (_, i) => `L${i + 1}`).join("\n");
      fs.writeFileSync(tmpFile, content, "utf-8");

      const result = fileReadTool.handler(
        { file_path: "__test-slice.tmp", start_line: 5, end_line: 10 },
        { sessionId: "test", toolCallId: "tc3d", toolName: "file_read", arguments: {} },
      ) as string;

      assert.ok(result.includes("L5"));
      assert.ok(result.includes("L10"));
      assert.ok(!result.includes("L4\n"));
      assert.ok(!result.includes("L11"));
      assert.ok(!result.includes("[SYSTEM WARNING:"));
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  });

  it("rejects files exceeding MAX_FILE_SIZE (OOM guard)", () => {
    // Create a file just over 5 MB
    const tmpFile = path.join(REPO_ROOT, "__test-oom-guard.tmp");
    try {
      // Write 5 MB + 1 byte (fill with 'x')
      const fd = fs.openSync(tmpFile, "w");
      fs.ftruncateSync(fd, MAX_FILE_SIZE + 1);
      fs.closeSync(fd);

      const result = fileReadTool.handler(
        { file_path: "__test-oom-guard.tmp" },
        { sessionId: "test", toolCallId: "tc3e", toolName: "file_read", arguments: {} },
      ) as string;

      assert.ok(result.startsWith("ERROR: File is too large"));
      assert.ok(result.includes("5 MB"));
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  });
});

// ---------------------------------------------------------------------------
// buildCustomTools — shell tool handler
// ---------------------------------------------------------------------------

describe("shell tool handler", () => {
  const tools = buildCustomTools(REPO_ROOT, NEUTRAL_KEY);
  const shellTool = tools.find((t) => t.name === "shell")!;

  it("is registered with correct name", () => {
    assert.ok(shellTool);
    assert.equal(shellTool.name, "shell");
  });

  it("executes a simple command", () => {
    const result = shellTool.handler(
      { command: "echo hello" },
      { sessionId: "test", toolCallId: "tc4", toolName: "shell", arguments: {} },
    );
    assert.ok(typeof result === "string");
    assert.ok((result as string).includes("hello"));
  });

  it("uses cwd parameter", () => {
    const result = shellTool.handler(
      { command: "pwd", cwd: "tools/autonomous-factory" },
      { sessionId: "test", toolCallId: "tc5", toolName: "shell", arguments: {} },
    );
    assert.ok(typeof result === "string");
    assert.ok((result as string).includes("tools/autonomous-factory"));
  });

  it("injects env_vars", () => {
    const result = shellTool.handler(
      { command: "echo $MY_TEST_VAR", env_vars: { MY_TEST_VAR: "harness-test-value" } },
      { sessionId: "test", toolCallId: "tc6", toolName: "shell", arguments: {} },
    );
    assert.ok(typeof result === "string");
    assert.ok((result as string).includes("harness-test-value"));
  });

  it("rejects banned cd command", () => {
    const result = shellTool.handler(
      { command: "cd /tmp" },
      { sessionId: "test", toolCallId: "tc7", toolName: "shell", arguments: {} },
    );
    assert.equal(result, ERR_CD_CMD);
  });

  it("rejects recursive grep", () => {
    const result = shellTool.handler(
      { command: "grep -r pattern ." },
      { sessionId: "test", toolCallId: "tc8", toolName: "shell", arguments: {} },
    );
    assert.equal(result, ERR_RECURSIVE_SEARCH);
  });

  it("rejects cat on code file", () => {
    const result = shellTool.handler(
      { command: "cat src/watchdog.ts" },
      { sessionId: "test", toolCallId: "tc9", toolName: "shell", arguments: {} },
    );
    assert.equal(result, ERR_CODE_READ);
  });

  it("returns error output for failing command", () => {
    const result = shellTool.handler(
      { command: "false" },
      { sessionId: "test", toolCallId: "tc10", toolName: "shell", arguments: {} },
    );
    assert.ok(typeof result === "string");
    assert.ok((result as string).includes("EXIT"));
  });

  it("rejects cwd traversal outside repo (CWE-22)", () => {
    const result = shellTool.handler(
      { command: "ls", cwd: "../../etc" },
      { sessionId: "test", toolCallId: "tc11", toolName: "shell", arguments: {} },
    );
    assert.ok(typeof result === "string");
    assert.ok((result as string).includes("outside the repository root"));
  });

  it("rejects sibling-directory cwd traversal", () => {
    const result = shellTool.handler(
      { command: "ls", cwd: "/workspaces/DAGent-t-evil" },
      { sessionId: "test", toolCallId: "tc12", toolName: "shell", arguments: {} },
    );
    assert.ok(typeof result === "string");
    assert.ok((result as string).includes("outside the repository root"));
  });
});

// ---------------------------------------------------------------------------
// Constants validation
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("FILE_READ_LINE_LIMIT is 500", () => {
    assert.equal(FILE_READ_LINE_LIMIT, 500);
  });

  it("FILE_TRUNCATION_WARNING contains the expected text", () => {
    assert.ok(FILE_TRUNCATION_WARNING.includes("truncated at 500 lines"));
    assert.ok(FILE_TRUNCATION_WARNING.includes("roam-code"));
  });

  it("MAX_FILE_SIZE is 5 MB", () => {
    assert.equal(MAX_FILE_SIZE, 5 * 1024 * 1024);
  });
});

// ---------------------------------------------------------------------------
// onDenial callback bridge (Issue 4: Circuit Breaker Evasion)
// ---------------------------------------------------------------------------

describe("buildSessionHooks onDenial callback", () => {
  it("invokes onDenial when a bash command is denied", () => {
    const denied: string[] = [];
    const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, NO_CORE, NO_MCP, (toolName) => denied.push(toolName));
    const preHook = hooks.onPreToolUse!;
    const baseInput = { timestamp: Date.now(), cwd: REPO_ROOT };

    preHook(
      { toolName: "bash", toolArgs: { command: "cd /tmp" }, ...baseInput },
      { sessionId: "test" },
    );

    assert.equal(denied.length, 1);
    assert.equal(denied[0], "bash");
  });

  it("invokes onDenial for write_bash denials", () => {
    const denied: string[] = [];
    const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, NO_CORE, NO_MCP, (toolName) => denied.push(toolName));
    const preHook = hooks.onPreToolUse!;
    const baseInput = { timestamp: Date.now(), cwd: REPO_ROOT };

    preHook(
      { toolName: "write_bash", toolArgs: { command: "grep -r foo ." }, ...baseInput },
      { sessionId: "test" },
    );

    assert.equal(denied.length, 1);
    assert.equal(denied[0], "write_bash");
  });

  it("does NOT invoke onDenial for allowed commands", () => {
    const denied: string[] = [];
    const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, NO_CORE, NO_MCP, (toolName) => denied.push(toolName));
    const preHook = hooks.onPreToolUse!;
    const baseInput = { timestamp: Date.now(), cwd: REPO_ROOT };

    preHook(
      { toolName: "bash", toolArgs: { command: "npm test" }, ...baseInput },
      { sessionId: "test" },
    );

    assert.equal(denied.length, 0);
  });

  it("works without onDenial callback (backward compat)", () => {
    const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, NO_CORE, NO_MCP);
    const preHook = hooks.onPreToolUse!;
    const baseInput = { timestamp: Date.now(), cwd: REPO_ROOT };

    // Should not throw even without callback
    const result = preHook(
      { toolName: "bash", toolArgs: { command: "cd /tmp" }, ...baseInput },
      { sessionId: "test" },
    );
    assert.ok(result);
    assert.equal((result as any).permissionDecision, "deny");
  });
});

// ---------------------------------------------------------------------------
// Review #3 Fix 2: Line range loophole (end_line: 999999)
// ---------------------------------------------------------------------------

describe("file_read line range cap", () => {
  const tools = buildCustomTools(REPO_ROOT, NEUTRAL_KEY);
  const fileReadTool = tools.find((t) => t.name === "file_read")!;

  it("caps end_line at FILE_READ_LINE_LIMIT lines from start", () => {
    const tmpFile = path.join(REPO_ROOT, "__test-line-cap.tmp");
    try {
      const content = Array.from({ length: 800 }, (_, i) => `line-${i + 1}`).join("\n");
      fs.writeFileSync(tmpFile, content, "utf-8");

      const result = fileReadTool.handler(
        { file_path: "__test-line-cap.tmp", start_line: 1, end_line: 999999 },
        { sessionId: "test", toolCallId: "tc-cap1", toolName: "file_read", arguments: {} },
      ) as string;

      // Should contain the first 500 lines
      assert.ok(result.includes("line-1"));
      assert.ok(result.includes("line-500"));
      // Should NOT contain line 501
      assert.ok(!result.includes("line-501\n"));
      // Should include the system warning about capping
      assert.ok(result.includes("[SYSTEM WARNING:"));
      assert.ok(result.includes("capped at " + FILE_READ_LINE_LIMIT));
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  });

  it("does not warn when requested range fits within limit", () => {
    const tmpFile = path.join(REPO_ROOT, "__test-line-cap2.tmp");
    try {
      const content = Array.from({ length: 800 }, (_, i) => `line-${i + 1}`).join("\n");
      fs.writeFileSync(tmpFile, content, "utf-8");

      const result = fileReadTool.handler(
        { file_path: "__test-line-cap2.tmp", start_line: 10, end_line: 20 },
        { sessionId: "test", toolCallId: "tc-cap2", toolName: "file_read", arguments: {} },
      ) as string;

      assert.ok(result.includes("line-10"));
      assert.ok(result.includes("line-20"));
      assert.ok(!result.includes("[SYSTEM WARNING:"));
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  });

  it("caps correctly when start_line is in the middle of the file", () => {
    const tmpFile = path.join(REPO_ROOT, "__test-line-cap3.tmp");
    try {
      const content = Array.from({ length: 1000 }, (_, i) => `L${i + 1}`).join("\n");
      fs.writeFileSync(tmpFile, content, "utf-8");

      // Request lines 200-999999 — should get 200..699 (500 lines max)
      const result = fileReadTool.handler(
        { file_path: "__test-line-cap3.tmp", start_line: 200, end_line: 999999 },
        { sessionId: "test", toolCallId: "tc-cap3", toolName: "file_read", arguments: {} },
      ) as string;

      assert.ok(result.includes("L200"));
      assert.ok(result.includes("L699"));
      assert.ok(!result.includes("L700\n"));
      assert.ok(result.includes("[SYSTEM WARNING:"));
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  });
});

// ---------------------------------------------------------------------------
// Review #3 Fix 3: Env var type coercion
// ---------------------------------------------------------------------------

describe("shell env_vars type coercion", () => {
  const tools = buildCustomTools(REPO_ROOT, NEUTRAL_KEY);
  const shellTool = tools.find((t) => t.name === "shell")!;

  it("coerces boolean env_vars to strings without crashing", () => {
    // LLMs may send { DEBUG: true } instead of { DEBUG: "true" }
    const result = shellTool.handler(
      { command: "echo $DEBUG_VAR", env_vars: { DEBUG_VAR: true as unknown as string } },
      { sessionId: "test", toolCallId: "tc-env1", toolName: "shell", arguments: {} },
    );
    assert.ok(typeof result === "string");
    assert.ok((result as string).includes("true"));
  });

  it("coerces numeric env_vars to strings without crashing", () => {
    const result = shellTool.handler(
      { command: "echo $COUNT", env_vars: { COUNT: 42 as unknown as string } },
      { sessionId: "test", toolCallId: "tc-env2", toolName: "shell", arguments: {} },
    );
    assert.ok(typeof result === "string");
    assert.ok((result as string).includes("42"));
  });

  it("coerces null/undefined env_vars to strings", () => {
    const result = shellTool.handler(
      { command: "echo done", env_vars: { NULL_VAR: null as unknown as string, UNDEF_VAR: undefined as unknown as string } },
      { sessionId: "test", toolCallId: "tc-env3", toolName: "shell", arguments: {} },
    );
    assert.ok(typeof result === "string");
    // Should not crash — just run
    assert.ok((result as string).includes("done"));
  });
});

// ---------------------------------------------------------------------------
// Review #3 Fix 2 (belt-and-suspenders): onPostToolUse truncation
// ---------------------------------------------------------------------------

describe("onPostToolUse truncation with line range", () => {
  it("truncates built-in read_file even when startLine/endLine are set", () => {
    const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, NO_CORE, NO_MCP);
    const postHook = hooks.onPostToolUse!;

    // Simulate a read_file result with 700 lines
    const bigContent = Array.from({ length: 700 }, (_, i) => `line-${i + 1}`).join("\n");
    const result = postHook(
      {
        toolName: "read_file",
        toolArgs: { startLine: 1, endLine: 700 },
        toolResult: { textResultForLlm: bigContent, resultType: "success" },
        timestamp: Date.now(),
        cwd: REPO_ROOT,
      },
      { sessionId: "test" },
    );

    assert.ok(result, "should return a modified result");
    const modified = (result as any).modifiedResult.textResultForLlm as string;
    const lineCount = modified.split("\n").length;
    // The 500 content lines + warning lines should be well under 700
    assert.ok(lineCount <= FILE_READ_LINE_LIMIT + 5, `expected ≤${FILE_READ_LINE_LIMIT + 5} lines, got ${lineCount}`);
    assert.ok(modified.includes("[SYSTEM WARNING:"));
  });

  it("does not truncate built-in read_file when within limit", () => {
    const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, NO_CORE, NO_MCP);
    const postHook = hooks.onPostToolUse!;

    const smallContent = Array.from({ length: 100 }, (_, i) => `line-${i + 1}`).join("\n");
    const result = postHook(
      {
        toolName: "read_file",
        toolArgs: { startLine: 1, endLine: 100 },
        toolResult: { textResultForLlm: smallContent, resultType: "success" },
        timestamp: Date.now(),
        cwd: REPO_ROOT,
      },
      { sessionId: "test" },
    );

    // Should return undefined (no modification needed)
    assert.equal(result, undefined);
  });

  it("ignores non-read_file tools", () => {
    const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, NO_CORE, NO_MCP);
    const postHook = hooks.onPostToolUse!;

    const result = postHook(
      {
        toolName: "bash",
        toolArgs: {},
        toolResult: { textResultForLlm: "x".repeat(100000), resultType: "success" },
        timestamp: Date.now(),
        cwd: REPO_ROOT,
      },
      { sessionId: "test" },
    );

    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// RBAC — checkRbac unit tests
// ---------------------------------------------------------------------------

describe("checkRbac", () => {
  // --- Validator archetype ---

  it("Validator denied write to app source (write_file)", () => {
    const denial = checkRbac("backend-unit-test", "write_file", { filePath: "apps/sample-app/backend/src/functions/hello.ts" }, REPO_ROOT);
    assert.equal(denial, ERR_VALIDATOR_WRITE);
  });

  it("Validator allowed write to __tests__ dir", () => {
    const denial = checkRbac("backend-unit-test", "write_file", { filePath: "apps/sample-app/backend/src/__tests__/hello.test.ts" }, REPO_ROOT);
    assert.equal(denial, null);
  });

  it("Validator allowed write to .test. file outside __tests__ dir", () => {
    const denial = checkRbac("frontend-unit-test", "edit_file", { filePath: "apps/sample-app/frontend/src/utils.test.tsx" }, REPO_ROOT);
    assert.equal(denial, null);
  });

  it("Validator allowed write to .spec. file", () => {
    const denial = checkRbac("live-ui", "write_file", { filePath: "apps/sample-app/e2e/login.spec.ts" }, REPO_ROOT);
    assert.equal(denial, null);
  });

  it("Validator denied write to infra dir", () => {
    const denial = checkRbac("integration-test", "write_file", { filePath: "apps/sample-app/infra/main.tf" }, REPO_ROOT);
    assert.equal(denial, ERR_VALIDATOR_WRITE);
  });

  it("Validator denied write via absolute path", () => {
    const denial = checkRbac("backend-unit-test", "write_file", { filePath: "/workspaces/DAGent-t/apps/sample-app/backend/src/functions/hello.ts" }, REPO_ROOT);
    assert.equal(denial, ERR_VALIDATOR_WRITE);
  });

  // --- Maker archetype ---

  it("Maker denied write to infra dir", () => {
    const denial = checkRbac("backend-dev", "write_file", { filePath: "apps/sample-app/infra/main.tf" }, REPO_ROOT);
    assert.equal(denial, ERR_MAKER_WRITE);
  });

  it("Maker denied write to .github dir", () => {
    const denial = checkRbac("frontend-dev", "edit_file", { filePath: ".github/workflows/ci.yml" }, REPO_ROOT);
    assert.equal(denial, ERR_MAKER_WRITE);
  });

  it("Maker denied write to e2e dir", () => {
    const denial = checkRbac("backend-dev", "write_file", { filePath: "apps/sample-app/e2e/login.spec.ts" }, REPO_ROOT);
    assert.equal(denial, ERR_MAKER_WRITE);
  });

  it("Maker denied write to integration test dir", () => {
    const denial = checkRbac("backend-dev", "edit_file", { filePath: "apps/sample-app/integration/tests/api.test.ts" }, REPO_ROOT);
    assert.equal(denial, ERR_MAKER_WRITE);
  });

  it("Maker allowed write to app source", () => {
    const denial = checkRbac("backend-dev", "write_file", { filePath: "apps/sample-app/backend/src/functions/hello.ts" }, REPO_ROOT);
    assert.equal(denial, null);
  });

  it("Maker allowed write to unit test dir (__tests__)", () => {
    const denial = checkRbac("backend-dev", "write_file", { filePath: "apps/sample-app/backend/src/__tests__/hello.test.ts" }, REPO_ROOT);
    assert.equal(denial, null);
  });

  it("Maker denied terraform shell command", () => {
    const denial = checkRbac("backend-dev", "bash", { command: "terraform plan -out=tfplan" }, REPO_ROOT);
    assert.equal(denial, ERR_MAKER_CLOUD_CLI);
  });

  it("Maker denied az cli shell command", () => {
    const denial = checkRbac("frontend-dev", "shell", { command: "az login --service-principal" }, REPO_ROOT);
    assert.equal(denial, ERR_MAKER_CLOUD_CLI);
  });

  it("Maker denied aws cli shell command", () => {
    const denial = checkRbac("backend-dev", "bash", { command: "aws s3 ls" }, REPO_ROOT);
    assert.equal(denial, ERR_MAKER_CLOUD_CLI);
  });

  it("Maker denied shell write to infra via echo redirect", () => {
    const denial = checkRbac("backend-dev", "bash", { command: 'echo "resource" > apps/sample-app/infra/main.tf' }, REPO_ROOT);
    assert.equal(denial, ERR_MAKER_WRITE);
  });

  it("Maker denied shell write to .github via sed", () => {
    const denial = checkRbac("backend-dev", "bash", { command: "sed -i 's/old/new/' .github/workflows/ci.yml" }, REPO_ROOT);
    assert.equal(denial, ERR_MAKER_WRITE);
  });

  it("Maker allowed normal shell command", () => {
    const denial = checkRbac("backend-dev", "bash", { command: "npm test" }, REPO_ROOT);
    assert.equal(denial, null);
  });

  // --- Unconstrained archetype ---

  it("deploy-manager allowed write to any path", () => {
    const denial = checkRbac("deploy-manager", "write_file", { filePath: "apps/sample-app/infra/main.tf" }, REPO_ROOT);
    assert.equal(denial, null);
  });

  it("docs-expert allowed write to any path", () => {
    const denial = checkRbac("docs-archived", "write_file", { filePath: ".github/workflows/ci.yml" }, REPO_ROOT);
    assert.equal(denial, null);
  });

  it("code-cleanup allowed write to app source", () => {
    const denial = checkRbac("code-cleanup", "write_file", { filePath: "apps/sample-app/backend/src/functions/hello.ts" }, REPO_ROOT);
    assert.equal(denial, null);
  });

  it("infra-architect allowed terraform command", () => {
    const denial = checkRbac("infra-architect", "bash", { command: "terraform plan" }, REPO_ROOT);
    assert.equal(denial, null);
  });

  // --- Edge cases ---

  it("denies write_file when toolArgs has no file path (fail-closed)", () => {
    const denial = checkRbac("backend-unit-test", "write_file", {}, REPO_ROOT);
    assert.ok(denial);
    assert.ok(denial!.includes("Security Policy Violation"));
  });

  it("handles path key as 'path'", () => {
    const denial = checkRbac("backend-dev", "edit_file", { path: "apps/sample-app/infra/main.tf" }, REPO_ROOT);
    assert.equal(denial, ERR_MAKER_WRITE);
  });

  it("handles path key as 'file_path'", () => {
    const denial = checkRbac("backend-dev", "write_file", { file_path: "apps/sample-app/e2e/login.spec.ts" }, REPO_ROOT);
    assert.equal(denial, ERR_MAKER_WRITE);
  });

  it("Validator denied shell write to non-test path via echo redirect", () => {
    const denial = checkRbac("backend-unit-test", "bash", { command: 'echo "hack" > apps/sample-app/backend/src/index.ts' }, REPO_ROOT);
    assert.equal(denial, ERR_VALIDATOR_WRITE);
  });

  it("Validator allowed shell write to test path via echo redirect", () => {
    const denial = checkRbac("backend-unit-test", "bash", { command: 'echo "test" > apps/sample-app/backend/src/__tests__/foo.test.ts' }, REPO_ROOT);
    assert.equal(denial, null);
  });

  // --- CWD bypass tests ---

  it("Maker denied shell write to infra via cwd arg bypass", () => {
    // Relative path 'main.tf' + cwd 'apps/sample-app/infra' => infra/main.tf
    const denial = checkRbac("backend-dev", "shell", { command: 'echo "hack" > main.tf', cwd: "apps/sample-app/infra" }, REPO_ROOT);
    assert.equal(denial, ERR_MAKER_WRITE);
  });

  it("Validator denied shell write to non-test path via cwd arg bypass", () => {
    const denial = checkRbac("backend-unit-test", "bash", { command: 'echo "hack" > hello.ts', cwd: "apps/sample-app/backend/src/functions" }, REPO_ROOT);
    assert.equal(denial, ERR_VALIDATOR_WRITE);
  });

  it("Maker denied shell write to .github via cwd arg", () => {
    const denial = checkRbac("backend-dev", "shell", { command: 'echo "hack" > ci.yml', cwd: ".github/workflows" }, REPO_ROOT);
    assert.equal(denial, ERR_MAKER_WRITE);
  });

  it("hookCwd is used when no cwd in args", () => {
    const denial = checkRbac(
      "backend-dev", "bash",
      { command: 'echo "hack" > main.tf' },
      REPO_ROOT,
      path.join(REPO_ROOT, "apps/sample-app/infra"),
    );
    assert.equal(denial, ERR_MAKER_WRITE);
  });

  it("args.cwd takes priority over hookCwd", () => {
    // args.cwd points to infra (blocked), hookCwd points to src (allowed)
    const denial = checkRbac(
      "backend-dev", "bash",
      { command: 'echo "hack" > main.tf', cwd: "apps/sample-app/infra" },
      REPO_ROOT,
      path.join(REPO_ROOT, "apps/sample-app/backend/src"),
    );
    assert.equal(denial, ERR_MAKER_WRITE);
  });

  it("Maker allowed write via cwd to non-protected path", () => {
    const denial = checkRbac("backend-dev", "shell", { command: 'echo "ok" > utils.ts', cwd: "apps/sample-app/backend/src" }, REPO_ROOT);
    assert.equal(denial, null);
  });
});

// ---------------------------------------------------------------------------
// Zero-Trust Gate — buildSessionHooks with allowedCoreTools / allowedMcpTools
// ---------------------------------------------------------------------------

describe("Zero-Trust Gate", () => {
  const baseInput = { timestamp: Date.now(), cwd: REPO_ROOT };

  it("bypasses gate when both sets are empty (migration mode)", () => {
    const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, NO_CORE, NO_MCP);
    const result = hooks.onPreToolUse!(
      { toolName: "bash", toolArgs: { command: "npm test" }, ...baseInput },
      { sessionId: "test" },
    );
    // Should NOT be denied — gate is inactive in migration mode
    assert.ok(!result || (result as any).permissionDecision !== "deny");
  });

  it("denies tool not in allowedCoreTools", () => {
    const coreOnly = new Set(["shell"]);
    const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, coreOnly, NO_MCP);
    const result = hooks.onPreToolUse!(
      { toolName: "file_read", toolArgs: {}, ...baseInput },
      { sessionId: "test" },
    );
    assert.ok(result);
    assert.equal((result as any).permissionDecision, "deny");
    assert.ok((result as any).additionalContext?.includes("Zero-Trust Policy Violation"));
  });

  it("allows tool in allowedCoreTools", () => {
    const coreOnly = new Set(["shell", "file_read"]);
    const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, coreOnly, NO_MCP);
    const result = hooks.onPreToolUse!(
      { toolName: "shell", toolArgs: { command: "npm test" }, ...baseInput },
      { sessionId: "test" },
    );
    // Should not be denied by Zero-Trust gate
    assert.ok(!result || (result as any).permissionDecision !== "deny" || !(result as any).additionalContext?.includes("Zero-Trust"));
  });

  it("allows MCP tool when in allowedMcpTools", () => {
    const mcpTools = new Set(["roam_understand"]);
    const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, NO_CORE, mcpTools);
    const result = hooks.onPreToolUse!(
      { toolName: "roam_understand", toolArgs: {}, ...baseInput },
      { sessionId: "test" },
    );
    assert.ok(!result || (result as any).permissionDecision !== "deny");
  });

  it("denies MCP tool NOT in allowedMcpTools", () => {
    const mcpTools = new Set(["roam_understand"]);
    const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, NO_CORE, mcpTools);
    const result = hooks.onPreToolUse!(
      { toolName: "roam_file_info", toolArgs: {}, ...baseInput },
      { sessionId: "test" },
    );
    assert.ok(result);
    assert.equal((result as any).permissionDecision, "deny");
    assert.ok((result as any).additionalContext?.includes("Zero-Trust"));
  });

  it("allows all MCP tools when wildcard '*' is in allowedMcpTools", () => {
    const mcpWild = new Set(["*"]);
    const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, NO_CORE, mcpWild);
    const result = hooks.onPreToolUse!(
      { toolName: "roam_file_info", toolArgs: {}, ...baseInput },
      { sessionId: "test" },
    );
    assert.ok(!result || (result as any).permissionDecision !== "deny");
  });

  it("fires onDenial callback on Zero-Trust denial", () => {
    const denied: string[] = [];
    const coreOnly = new Set(["shell"]);
    const hooks = buildSessionHooks(REPO_ROOT, NEUTRAL_KEY, coreOnly, NO_MCP, (t) => denied.push(t));
    hooks.onPreToolUse!(
      { toolName: "write_file", toolArgs: {}, ...baseInput },
      { sessionId: "test" },
    );
    assert.equal(denied.length, 1);
    assert.equal(denied[0], "write_file");
  });
});

// ---------------------------------------------------------------------------
// Fail-closed checkRbac — SAFE_READ_TOOLS & unknown tool classification
// ---------------------------------------------------------------------------

describe("Fail-closed checkRbac with SAFE_READ_TOOLS", () => {
  it("classifies unknown tool as write tool and applies path RBAC", () => {
    // Unknown MCP tool writing to protected infra path → denied for maker
    const denial = checkRbac(
      "backend-dev", "ai_refactor",
      { filePath: "apps/sample-app/infra/main.tf" },
      REPO_ROOT,
    );
    assert.equal(denial, ERR_MAKER_WRITE);
  });

  it("denies unknown tool when path cannot be extracted (fail-closed)", () => {
    // Unknown tool with no filePath arg → hard deny
    const denial = checkRbac(
      "backend-dev", "ai_refactor",
      { someOtherArg: "value" },
      REPO_ROOT,
    );
    assert.ok(denial);
    assert.ok(denial!.includes("Security Policy Violation"));
    assert.ok(denial!.includes("ai_refactor"));
  });

  it("allows known safe read tool without path checks", () => {
    // read_file is in SAFE_READ_TOOLS — should not be treated as write tool
    const denial = checkRbac(
      "backend-dev", "read_file",
      { filePath: "apps/sample-app/infra/main.tf" },
      REPO_ROOT,
    );
    assert.equal(denial, null);
  });

  it("allows known safe read tool (roam_understand) for any agent", () => {
    const denial = checkRbac(
      "backend-dev", "roam_understand",
      {},
      REPO_ROOT,
    );
    assert.equal(denial, null);
  });

  it("SAFE_READ_TOOLS contains expected entries", () => {
    for (const tool of [
      "read_file", "file_read", "view", "grep_search", "list_dir",
      "roam_understand", "roam_file_info", "roam_context", "roam_explore",
      "roam_search_symbol", "roam_trace", "roam_uses", "roam_batch_get",
    ]) {
      assert.ok(SAFE_READ_TOOLS.has(tool), `Expected ${tool} in SAFE_READ_TOOLS`);
    }
  });

  it("allows write_file to non-protected path for maker", () => {
    // Standard write_file to allowed path should still work
    const denial = checkRbac(
      "backend-dev", "write_file",
      { filePath: "apps/sample-app/backend/src/index.ts" },
      REPO_ROOT,
    );
    assert.equal(denial, null);
  });

  it("allows playwright MCP tools for validators (non-filesystem prefix bypass)", () => {
    // Playwright tools interact with the browser, not the filesystem
    const denial = checkRbac(
      "live-ui", "playwright-navigate",
      { url: "https://example.com" },
      REPO_ROOT,
    );
    assert.equal(denial, null);
  });

  it("allows roam-code MCP tools for makers", () => {
    // All roam tools are read-only analysis
    const denial = checkRbac(
      "backend-dev", "roam_context",
      { symbol: "MyClass" },
      REPO_ROOT,
    );
    assert.equal(denial, null);
  });
});
