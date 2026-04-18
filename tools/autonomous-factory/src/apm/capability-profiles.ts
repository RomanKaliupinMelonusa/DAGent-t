/**
 * apm/capability-profiles.ts — Resolver for per-agent capability profiles.
 *
 * Walks a profile's `extends` chain, merges `allow` / `deny` lists, and
 * translates the structured profile into the legacy `security` + `tools`
 * shapes consumed by `resolveAgentSandbox` and the SDK pre-tool hooks.
 * Existing call sites need no changes — this compiler step makes
 * capability profiles a strict superset of the old schema.
 *
 * Resolution rules:
 *   - `extends` is walked transitively; cycles are rejected.
 *   - `allow` / `deny` lists are concatenated then deduplicated (child wins
 *     for ordering; `deny` always takes precedence at enforcement time
 *     because the underlying RBAC is deny-first).
 *   - Soft preferences (`preferences.prefer` / `require`) are not merged
 *     into `security` / `tools`; they are returned alongside so the APM
 *     compiler can inject them into the agent's system prompt.
 */

import type {
  ApmCapabilityProfile,
  ApmAgentSecurity,
  ApmAgentTools,
} from "./types.js";

export interface ResolvedCapability {
  /** Translated into the runtime `security` block (allowedWritePaths + blockedCommandRegexes). */
  security: ApmAgentSecurity;
  /** Translated into the runtime `tools` block (core + mcp allow-lists). */
  tools: ApmAgentTools;
  /** Unmerged soft preferences — emitted into the agent system prompt by the compiler. */
  preferences?: NonNullable<ApmCapabilityProfile["preferences"]>;
}

/** Deduplicate while preserving input order. */
function uniq<T>(xs: Iterable<T>): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (const x of xs) {
    if (!seen.has(x)) { seen.add(x); out.push(x); }
  }
  return out;
}

/**
 * Flatten a profile's `extends` chain into a single profile with merged
 * allow / deny lists. Parent values come first, child overrides append
 * (deduplicated). Throws on circular extension or missing base.
 */
export function flattenProfile(
  name: string,
  profiles: Readonly<Record<string, ApmCapabilityProfile>>,
  seen: ReadonlySet<string> = new Set(),
): ApmCapabilityProfile {
  const profile = profiles[name];
  if (!profile) throw new Error(`Unknown capability profile "${name}".`);
  if (seen.has(name)) {
    throw new Error(`Circular capability profile extension detected at "${name}".`);
  }

  if (!profile.extends) return profile;
  const parent = flattenProfile(profile.extends, profiles, new Set([...seen, name]));

  return {
    extends: undefined,
    mcp_tools: {
      allow: uniq([...(parent.mcp_tools?.allow ?? []), ...(profile.mcp_tools?.allow ?? [])]),
      deny:  uniq([...(parent.mcp_tools?.deny  ?? []), ...(profile.mcp_tools?.deny  ?? [])]),
    },
    shell: {
      allow: uniq([...(parent.shell?.allow ?? []), ...(profile.shell?.allow ?? [])]),
      deny:  uniq([...(parent.shell?.deny  ?? []), ...(profile.shell?.deny  ?? [])]),
    },
    filesystem: {
      write: uniq([...(parent.filesystem?.write ?? []), ...(profile.filesystem?.write ?? [])]),
      read:  uniq([...(parent.filesystem?.read  ?? []), ...(profile.filesystem?.read  ?? [])]),
      deny:  uniq([...(parent.filesystem?.deny  ?? []), ...(profile.filesystem?.deny  ?? [])]),
    },
    preferences: {
      prefer:  [...(parent.preferences?.prefer  ?? []), ...(profile.preferences?.prefer  ?? [])],
      require: uniq([...(parent.preferences?.require ?? []), ...(profile.preferences?.require ?? [])]),
    },
  };
}

/**
 * Translate a capability profile (or inline ref) into the runtime
 * `security` + `tools` shapes. String `ref` looks up a named profile;
 * inline profiles are used as-is after extends resolution.
 */
export function resolveCapabilityProfile(
  ref: string | ApmCapabilityProfile,
  profiles: Readonly<Record<string, ApmCapabilityProfile>>,
): ResolvedCapability {
  let flat: ApmCapabilityProfile;
  if (typeof ref === "string") {
    flat = flattenProfile(ref, profiles);
  } else if (ref.extends) {
    const parent = flattenProfile(ref.extends, profiles);
    flat = mergeInline(parent, { ...ref, extends: undefined });
  } else {
    flat = ref;
  }

  const writes = flat.filesystem?.write ?? [];
  const shellDeny = flat.shell?.deny ?? [];
  const mcpAllow = flat.mcp_tools?.allow ?? [];

  // --- Security block (filesystem + shell) ---
  const security: ApmAgentSecurity = {
    allowedWritePaths: writes,
    blockedCommandRegexes: shellDeny,
  };

  // --- Tools block (MCP allow-list split by server prefix) ---
  // Format: "server/tool" → tools.mcp["server"] = [...tool, ...]
  //         "tool"        → tools.core = [...tool, ...]
  //         "server/*"    → tools.mcp["server"] = "*"
  //         "*"           → tools.mcp["*"] = "*"
  const coreSet = new Set<string>();
  const mcpMap: Record<string, string[] | "*"> = {};
  for (const entry of mcpAllow) {
    const slash = entry.indexOf("/");
    if (slash === -1) {
      coreSet.add(entry);
      continue;
    }
    const server = entry.slice(0, slash);
    const tool = entry.slice(slash + 1);
    if (tool === "*") {
      mcpMap[server] = "*";
    } else if (mcpMap[server] !== "*") {
      const arr = (mcpMap[server] as string[] | undefined) ?? [];
      if (!arr.includes(tool)) arr.push(tool);
      mcpMap[server] = arr;
    }
  }
  const tools: ApmAgentTools = {
    core: coreSet.size > 0 ? [...coreSet] : undefined,
    mcp: Object.keys(mcpMap).length > 0 ? mcpMap : undefined,
  };

  return {
    security,
    tools,
    preferences: flat.preferences,
  };
}

/** Merge an inline profile onto a resolved parent (child-wins append + dedupe). */
function mergeInline(parent: ApmCapabilityProfile, child: ApmCapabilityProfile): ApmCapabilityProfile {
  return {
    extends: undefined,
    mcp_tools: {
      allow: uniq([...(parent.mcp_tools?.allow ?? []), ...(child.mcp_tools?.allow ?? [])]),
      deny:  uniq([...(parent.mcp_tools?.deny  ?? []), ...(child.mcp_tools?.deny  ?? [])]),
    },
    shell: {
      allow: uniq([...(parent.shell?.allow ?? []), ...(child.shell?.allow ?? [])]),
      deny:  uniq([...(parent.shell?.deny  ?? []), ...(child.shell?.deny  ?? [])]),
    },
    filesystem: {
      write: uniq([...(parent.filesystem?.write ?? []), ...(child.filesystem?.write ?? [])]),
      read:  uniq([...(parent.filesystem?.read  ?? []), ...(child.filesystem?.read  ?? [])]),
      deny:  uniq([...(parent.filesystem?.deny  ?? []), ...(child.filesystem?.deny  ?? [])]),
    },
    preferences: {
      prefer:  [...(parent.preferences?.prefer  ?? []), ...(child.preferences?.prefer  ?? [])],
      require: uniq([...(parent.preferences?.require ?? []), ...(child.preferences?.require ?? [])]),
    },
  };
}

/**
 * Format preferences as a markdown section for system-prompt injection.
 * Returns an empty string when no preferences are declared.
 */
export function renderPreferencesMarkdown(prefs: ApmCapabilityProfile["preferences"]): string {
  if (!prefs) return "";
  const lines: string[] = [];
  const preferList = prefs.prefer ?? [];
  const requireList = prefs.require ?? [];
  if (preferList.length === 0 && requireList.length === 0) return "";

  lines.push("## Tool Routing Guidance");
  if (preferList.length > 0) {
    lines.push("", "**Prefer:**");
    for (const p of preferList) {
      lines.push(`- For ${p.for}, prefer \`${p.tool}\` over ${p.over.map((o) => `\`${o}\``).join(", ")}.`);
    }
  }
  if (requireList.length > 0) {
    lines.push("", "**Required tool usage:**");
    for (const r of requireList) lines.push(`- ${r}`);
  }
  return lines.join("\n");
}
