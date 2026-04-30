/**
 * agent-sandbox.ts — Config-driven RBAC sandbox resolution.
 *
 * Extracts ~30 lines of security profile resolution from session-runner.ts
 * into a standalone function that compiles string patterns from apm.yml into
 * RegExp objects and assembles the agent's sandbox configuration.
 */
export function resolveAgentSandbox(agentKey, apmContext, appRoot) {
    // --- Zero-Trust tool allow-list extraction ---
    const agentToolsCfg = apmContext.agents[agentKey]?.tools;
    const allowedCoreTools = new Set(agentToolsCfg?.core ?? []);
    const allowedMcpTools = new Set();
    const mcpToolConfig = agentToolsCfg?.mcp ?? {};
    for (const tools of Object.values(mcpToolConfig)) {
        if (tools === "*")
            allowedMcpTools.add("*");
        else if (Array.isArray(tools))
            tools.forEach((t) => allowedMcpTools.add(String(t)));
    }
    // --- Config-driven path sandbox & command blocking ---
    // Migration guard: absent security block = no enforcement (matches Zero-Trust pattern).
    // When security IS defined with allowedWritePaths: [], that means explicitly read-only.
    const securityCfg = apmContext.agents[agentKey]?.security;
    const hasSecurityProfile = securityCfg !== undefined && securityCfg !== null;
    const allowedWritePaths = hasSecurityProfile
        ? (securityCfg.allowedWritePaths ?? []).map((p) => new RegExp(p))
        : [/^.*/]; // No security profile = allow all writes (migration mode)
    // Read-path enforcement is opt-in per agent. When the security block is
    // present but `allowedReadPaths` is omitted, we leave reads unconstrained
    // — keeps migration simple.
    const allowedReadPaths = hasSecurityProfile && Array.isArray(securityCfg.allowedReadPaths)
        ? securityCfg.allowedReadPaths.map((p) => new RegExp(p))
        : undefined;
    const blockedCommandRegexes = hasSecurityProfile
        ? (securityCfg.blockedCommandRegexes ?? []).map((p) => new RegExp(p))
        : []; // No blocked commands in migration mode
    if (!hasSecurityProfile) {
        console.log(`  ⚠ Agent '${agentKey}' has no security profile — RBAC enforcement skipped (migration mode)`);
    }
    // Build safeMcpPrefixes from resolved MCP configs (fsMutator: false = safe prefix)
    const safeMcpPrefixes = new Set();
    const agentMcp = apmContext.agents[agentKey]?.mcp ?? {};
    for (const [serverName, mcpCfg] of Object.entries(agentMcp)) {
        if (mcpCfg.fsMutator === false)
            safeMcpPrefixes.add(serverName + "-");
    }
    return {
        allowedWritePaths,
        allowedReadPaths,
        blockedCommandRegexes,
        safeMcpPrefixes,
        allowedCoreTools,
        allowedMcpTools,
        hasSecurityProfile,
    };
}
//# sourceMappingURL=sandbox.js.map