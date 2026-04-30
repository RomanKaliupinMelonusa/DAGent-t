# PR-equivalence fixtures

Synthetic fixture pair used by the Session 5 G3 byte-equivalence harness
(`tools/autonomous-factory/scripts/pr-equivalence/`). Both files in this
directory are **synthetic** — handcrafted to exercise the normalizer's
volatile-pattern stripping (timestamps, commit SHAs, run IDs, UUIDs,
ports, line:col counters, paths). They are *not* captures from a real
legacy → Temporal PR-equivalence run.

The harness is designed to be re-runnable later against a real
legacy-produced diff and a real Temporal-produced diff for the actual
soak-gate proof. When that capture happens, replace these files (or
keep them as the synthetic regression fixture and add a sibling
`real-*` pair).

## Files

- `legacy.diff` — synthetic diff in the shape `git diff` emits, with
  legacy-shaped volatile fields (legacy run ID format, legacy temp dir
  layout, legacy commit-message footer).
- `temporal.diff` — same logical change, with Temporal-shaped volatile
  fields (Temporal workflow ID, container temp dirs, Temporal run-link
  footer). After normalization the two MUST be byte-equal.

## How to capture a real pair (soak-window deliverable)

```bash
# 1. Run the reference feature on legacy:
npm run agent:run -- --app apps/sample-app --workflow full-stack \
    --spec-file path/to/spec.md ref-feature-legacy
# capture: gh pr diff <legacy-PR> > legacy.diff

# 2. Run the same feature on Temporal:
npm run temporal:run -- --app apps/sample-app --workflow full-stack \
    --spec-file path/to/spec.md ref-feature-temporal
# capture: gh pr diff <temporal-PR> > temporal.diff

# 3. Compare:
node scripts/pr-equivalence/cli.mjs legacy.diff temporal.diff
```

The harness exits 0 on byte-equality; non-zero indicates the soak-gate
test has failed and the cutover window cannot open.
