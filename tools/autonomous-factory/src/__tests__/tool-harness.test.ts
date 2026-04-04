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
} from "../tool-harness.js";

const REPO_ROOT = "/workspaces/DAGent-t";

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
});

// ---------------------------------------------------------------------------
// checkShellCommand
// ---------------------------------------------------------------------------

describe("checkShellCommand", () => {
  // --- Denied cases ---

  it("denies standalone cd", () => {
    assert.equal(checkShellCommand("cd /tmp"), ERR_STATELESS_CMD);
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

  it("allows cd in compound command (&&)", () => {
    assert.equal(checkShellCommand("cd /tmp && ls"), null);
  });

  it("allows cd with semicolon chaining", () => {
    assert.equal(checkShellCommand("cd backend; npm test"), null);
  });

  it("allows cd with OR operator", () => {
    assert.equal(checkShellCommand("cd backend || exit 1"), null);
  });

  it("allows cd in multiline script", () => {
    assert.equal(checkShellCommand("cd backend\nnpm test"), null);
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
    assert.equal(checkShellCommand("  cd /tmp"), ERR_STATELESS_CMD);
  });
});

// ---------------------------------------------------------------------------
// buildSessionHooks — onPreToolUse
// ---------------------------------------------------------------------------

describe("buildSessionHooks.onPreToolUse", () => {
  const hooks = buildSessionHooks(REPO_ROOT);
  const preHook = hooks.onPreToolUse!;
  const baseInput = { timestamp: Date.now(), cwd: REPO_ROOT };

  it("denies bash with cd command", () => {
    const result = preHook(
      { toolName: "bash", toolArgs: { command: "cd /tmp" }, ...baseInput },
      { sessionId: "test" },
    );
    assert.ok(result);
    assert.equal((result as any).permissionDecision, "deny");
    assert.ok((result as any).additionalContext?.includes("stateless"));
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
  const hooks = buildSessionHooks(REPO_ROOT);
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

  it("does not truncate when startLine/endLine are provided", () => {
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
    assert.equal(result, undefined); // agent explicitly requested full range
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
  const tools = buildCustomTools(REPO_ROOT);
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
  const tools = buildCustomTools(REPO_ROOT);
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

  it("rejects banned stateless command", () => {
    const result = shellTool.handler(
      { command: "cd /tmp" },
      { sessionId: "test", toolCallId: "tc7", toolName: "shell", arguments: {} },
    );
    assert.equal(result, ERR_STATELESS_CMD);
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
    const hooks = buildSessionHooks(REPO_ROOT, (toolName) => denied.push(toolName));
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
    const hooks = buildSessionHooks(REPO_ROOT, (toolName) => denied.push(toolName));
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
    const hooks = buildSessionHooks(REPO_ROOT, (toolName) => denied.push(toolName));
    const preHook = hooks.onPreToolUse!;
    const baseInput = { timestamp: Date.now(), cwd: REPO_ROOT };

    preHook(
      { toolName: "bash", toolArgs: { command: "npm test" }, ...baseInput },
      { sessionId: "test" },
    );

    assert.equal(denied.length, 0);
  });

  it("works without onDenial callback (backward compat)", () => {
    const hooks = buildSessionHooks(REPO_ROOT);
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
