## Known Framework Issues

This is a registry of confirmed framework-level bugs and incompatibilities. These are **not application bugs** — they are upstream issues that cannot be fixed by modifying application code.

**CRITICAL RULE:** If you encounter a framework limitation listed here, you MUST:
1. Add `test.skip()` to the affected test with the reason from this registry.
2. Record the skip in `$OUTPUTS_DIR/summary.md` (MUST start with the YAML
   front-matter envelope — see the global completion block for the canonical
   `cat <<EOF` form) so the next agent sees it.
3. Move on immediately. Do NOT spend more than 3 shell commands attempting to work around a known framework bug.

---

### KFI-001: React 18 Turbopack + Playwright Synthetic Event Incompatibility

| Field | Value |
|---|---|
| **Affected tools** | Next.js (Turbopack dev mode), Playwright, React 18 |
| **Symptom** | Playwright `click()`, `fill()`, and `type()` actions on React components fail intermittently. Synthetic events are not dispatched or are swallowed by React's event delegation layer when running under Turbopack's HMR runtime. |
| **Root cause** | React 18's event system registers a single root listener. Turbopack's module replacement can detach/reattach this listener mid-test, causing Playwright's CDP-dispatched events to be lost. |
| **Workaround** | Use `page.evaluate()` to dispatch native DOM events directly, or run tests against a production build (`next build && next start`) instead of dev mode. |
| **Agent action** | `test.skip('KFI-001: React 18 Turbopack/Playwright synthetic event incompatibility')` |
| **Tracking** | Upstream: https://github.com/vercel/next.js/issues/54757 |

---

### Template: Adding New Known Issues

When a new framework bug is confirmed (i.e., it is reproducible, not caused by application code, and has an upstream issue tracker), add an entry using this format:

```markdown
### KFI-NNN: Short Description

| Field | Value |
|---|---|
| **Affected tools** | ... |
| **Symptom** | ... |
| **Root cause** | ... |
| **Workaround** | ... |
| **Agent action** | `test.skip('KFI-NNN: ...')` |
| **Tracking** | ... |
```
