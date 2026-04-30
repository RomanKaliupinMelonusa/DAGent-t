/**
 * apm/instruction-lint.ts — Phase 7: Schema gate on rendered instructions.
 *
 * Scans a fully-assembled instruction prompt (the per-agent rules block the
 * APM compiler produces) for forbidden legacy patterns, returning a list of
 * `{ pattern, line, snippet }` violations the compiler can surface as a
 * fatal `ApmCompileError`.
 *
 * What we forbid (and why):
 *
 * 1. **Legacy `<slug>_*` filename patterns** — e.g. `<slug>_SPEC.md`,
 *    `${SLUG}_PLAN.md`, `${slug}_acceptance.yaml`. The Unified Node I/O
 *    Contract migration moved every per-feature file under
 *    `.dagent/<slug>/<nodeKey>/<inv>/(inputs|outputs)/<kind>.<ext>`.
 *    Any prompt still telling an agent to read or write `<slug>_FOO.md`
 *    will silently miss the new on-disk shape.
 *
 * 2. **Unbacked `<slug>_` shell-style references** — e.g. `${SLUG}_FOO`,
 *    `$SLUG_FOO`. Same root cause; these used to interpolate to the flat
 *    legacy filenames and now resolve to nothing.
 *
 * What we deliberately allow:
 *
 *  - Mentions inside fenced code blocks (```…```) or inline backticks
 *    (`…`). Authors often quote the legacy shape in "before / after"
 *    migration notes; flagging those is noisy and unhelpful.
 *  - The literal token `<slug>` on its own (no underscore-suffix), which
 *    is a common templating placeholder that does not resolve to a path.
 *  - The standard env var names the new contract DOES export
 *    (`INPUTS_DIR`, `OUTPUTS_DIR`, `LOGS_DIR`, `INVOCATION_DIR`).
 */
const FORBIDDEN_PATTERNS = [
    {
        // `<slug>_FOO.md`, `<slug>_acceptance.yaml`, etc.
        pattern: "legacy-slug-path",
        regex: /<slug>_[A-Za-z0-9._-]+/g,
    },
    {
        // `${SLUG}_FOO`, `${slug}_FOO`, `$SLUG_FOO`. Captures both the
        // braced and bare shell-variable forms.
        pattern: "legacy-slug-envvar",
        regex: /\$\{?(?:SLUG|slug)\}?_[A-Za-z0-9._-]+/g,
    },
    {
        // `{{featureSlug}}_FOO` (Handlebars-style template that used to expand
        // to the flat legacy filename). The new contract uses the per-invocation
        // tree, never an interpolated filename.
        pattern: "legacy-feature-slug-path",
        regex: /\{\{\s*featureSlug\s*\}\}_[A-Za-z0-9._-]+/g,
    },
    {
        // Phase 3 — bare `{{upstreamArtifacts.<key>}}` or
        // `{{upstream_artifacts.<key>}}` access. Skips the typed-edge contract
        // check (silently interpolates `undefined` when the edge is undeclared).
        // Use `{{artifact "<producer>" "<kind>"}}` instead — it validates the
        // edge is declared in the node's `consumes_artifacts` and resolves
        // the parsed content.
        pattern: "bare-upstream-artifacts-access",
        regex: /\{\{\s*upstream[_A-Za-z]*Artifacts\.[A-Za-z0-9_.-]+\s*\}\}/g,
    },
];
/**
 * Strip all fenced code blocks and inline backtick spans from `text`,
 * replacing them with whitespace of the same length so line numbers stay
 * stable. We then scan the redacted copy for forbidden patterns.
 */
function redactCodeSpans(text) {
    // Replace fenced ``` … ``` blocks (and ~~~ variants) first — they may
    // contain backticks that would confuse the inline scrubber.
    let out = text.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (m) => m.replace(/[^\n]/g, " "));
    // Replace inline `…` spans. Non-greedy, single-line.
    out = out.replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
    return out;
}
/**
 * Lint a fully-assembled instruction prompt for forbidden legacy patterns.
 * Returns an empty array when the prompt is clean.
 *
 * @param assembled  The rendered "## Coding Rules" body the APM compiler
 *                   built from the agent's instruction fragments.
 */
export function lintAssembledInstructions(assembled) {
    const violations = [];
    const redacted = redactCodeSpans(assembled);
    const lines = redacted.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line)
            continue;
        for (const { pattern, regex, shouldFlag } of FORBIDDEN_PATTERNS) {
            regex.lastIndex = 0;
            if (regex.test(line) && (!shouldFlag || shouldFlag(line))) {
                const snippet = line.trim().slice(0, 200);
                violations.push({ pattern, line: i + 1, snippet });
            }
        }
    }
    return violations;
}
/**
 * Format a violation list as a single multi-line error message suitable for
 * `ApmCompileError`. Caller is responsible for providing the agent context
 * prefix (we only know about the violations).
 */
export function formatViolations(agentKey, appRel, violations) {
    const header = `Instruction prompt for agent "${agentKey}" in ${appRel} contains ` +
        `${violations.length} forbidden legacy pattern(s). The Unified Node ` +
        `I/O Contract requires per-invocation paths under ` +
        `\`.dagent/<slug>/<nodeKey>/<inv>/(inputs|outputs)/<kind>.<ext>\` — ` +
        `legacy \`<slug>_*\` filenames no longer resolve.`;
    const body = violations
        .map((v) => `  · [${v.pattern}] line ${v.line}: ${v.snippet}`)
        .join("\n");
    return `${header}\n${body}`;
}
//# sourceMappingURL=instruction-lint.js.map