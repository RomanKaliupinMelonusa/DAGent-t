import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getOutputChannel } from "./output.js";
import { ALLOWED_ROAM_TOOLS, DENIED_ROAM_TOOLS } from "./types.js";

let client: Client | null = null;
let initPromise: Promise<Client | null> | null = null;
let available = true;

/**
 * Lazily initialise the roam-code MCP client.
 * Returns null if roam is not available (graceful degradation).
 */
async function getClient(): Promise<Client | null> {
  if (!available) return null;
  if (client) return client;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const transport = new StdioClientTransport({
        command: "roam",
        args: ["mcp"],
      });

      const c = new Client(
        { name: "docs-participant", version: "0.1.0" },
        { capabilities: {} },
      );

      await c.connect(transport);
      client = c;
      getOutputChannel().info("roam-code MCP client connected");
      return client;
    } catch (err) {
      available = false;
      getOutputChannel().warn(
        `roam-code MCP not available, falling back to git-only mode: ${err}`,
      );
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Call a roam-code tool by name with the given arguments.
 * Enforces the allow/deny list.
 */
async function callTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  // Enforce deny-list
  if ((DENIED_ROAM_TOOLS as readonly string[]).includes(toolName)) {
    throw new Error(
      `@docs: tool "${toolName}" is denied — mutation tools are not allowed`,
    );
  }

  // Enforce allow-list
  if (!(ALLOWED_ROAM_TOOLS as readonly string[]).includes(toolName)) {
    throw new Error(
      `@docs: tool "${toolName}" is not in the allowed tool set: ${ALLOWED_ROAM_TOOLS.join(", ")}`,
    );
  }

  const c = await getClient();
  if (!c) {
    throw new Error("roam-code MCP client is not available");
  }

  const result = await c.callTool({ name: toolName, arguments: args });
  // MCP tool results come as content array; concatenate text parts
  if (Array.isArray(result.content)) {
    return result.content
      .filter((p: { type: string }) => p.type === "text")
      .map((p: { text: string }) => p.text)
      .join("\n");
  }
  return String(result.content ?? "");
}

// ─── Public API: 4 allowed read-only tools ───────────────────────────

/**
 * Get a branch-level change summary via roam's AST diff analysis.
 * @param scope  Optional monorepo boundary path (e.g. "apps/sample-app").
 */
export async function prDiff(scope?: string): Promise<string> {
  const args: Record<string, unknown> = {};
  if (scope) args["path"] = scope;
  return callTool("roam_pr_diff", args);
}

/**
 * Identify which documentation files are stale relative to code changes.
 * @param scope  Optional monorepo boundary path.
 */
export async function docStaleness(scope?: string): Promise<string> {
  const args: Record<string, unknown> = {};
  if (scope) args["path"] = scope;
  return callTool("roam_doc_staleness", args);
}

/**
 * Get structural context for a symbol or file area.
 * @param query  The symbol or area to query.
 * @param scope  Optional monorepo boundary path.
 */
export async function context(
  query: string,
  scope?: string,
): Promise<string> {
  const args: Record<string, unknown> = { query };
  if (scope) args["path"] = scope;
  return callTool("roam_context", args);
}

/**
 * Deep comprehension of a code area — returns explanation of purpose,
 * dependencies, and interactions.
 * @param area   The area or module to understand.
 * @param scope  Optional monorepo boundary path.
 */
export async function understand(
  area: string,
  scope?: string,
): Promise<string> {
  const args: Record<string, unknown> = { query: area };
  if (scope) args["path"] = scope;
  return callTool("roam_understand", args);
}

/** Check if roam-code is available (connected or connectable). */
export async function isRoamAvailable(): Promise<boolean> {
  if (!available) return false;
  try {
    const c = await getClient();
    return c !== null;
  } catch {
    return false;
  }
}

/** Dispose the MCP client connection. Called on extension deactivation. */
export function disposeRoamClient(): void {
  if (client) {
    client.close().catch(() => {});
    client = null;
  }
  initPromise = null;
}
