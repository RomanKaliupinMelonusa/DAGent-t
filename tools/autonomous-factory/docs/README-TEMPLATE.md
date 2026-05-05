# Layer README Template

Every layer under `tools/autonomous-factory/src/<layer>/` should have a
`README.md` following the seven-section template below. Existing
exemplars: [`src/apm/README.md`](../src/apm/README.md),
[`src/triage/README.md`](../src/triage/README.md),
[`src/domain/README.md`](../src/domain/README.md).

The two thin layers without their own README — `src/contracts/` and
`src/paths/` — are intentional exceptions documented in the engine
[layer map](../README.md#layer-map).

## Template

```markdown
# `src/<layer>/` — <One-line role>

<One-paragraph elevator pitch — what this layer is responsible for and
what it deliberately is *not* responsible for.>

See [Architecture overview](../../docs/architecture.md) for how this
layer fits into the worker / workflow / activity stack.

## Role in the architecture

<2–3 paragraphs explaining the layer's place in the engine. Cover:
which other layers consume it, what its dependency direction is (one-way
rules), and why it exists as a separate layer rather than being inlined.>

## Files

| File | Role |
|---|---|
| [foo.ts](foo.ts) | <one-line role> |
| [bar.ts](bar.ts) | <one-line role> |
| ...

<Optional: prose paragraph about subdirectories or omissions.>

## Public interface

<TypeScript snippet showing the canonical call shape callers use.
Should be one of: a function/factory, a class, or a barrel re-export
list. Document any non-obvious construction order.>

## Invariants & contracts

1. <Numbered list of constraints that other layers depend on. Each
   entry should be testable / linted / grep-able.>
2. ...

## How to extend

**<Most common extension scenario>:**

1. Step-by-step recipe.
2. ...

**<Less common extension>:**

1. ...

## Gotchas

- **<Pitfall>** — <one-paragraph explanation + recommended workaround>
- ...

## Related layers

- Calls → [`src/<other>/`](../<other>/README.md)
- Called from → [`src/<consumer>/`](../<consumer>/README.md)
- Depends on → ports under [`src/ports/`](../ports/README.md)
- Backed by → adapters under [`src/adapters/`](../adapters/README.md)
```

## Section guidance

- **Role** sections should answer "why does this layer exist" — not
  "what code is in it" (that's the file table's job).
- **Public interface** should be the *minimum* surface a caller needs
  to know. Implementation details belong in code comments.
- **Invariants** should be things that other layers (or future code
  reviewers) will benefit from when something seems wrong. Aim for
  testability.
- **How to extend** should match the actual extension cadence. If a
  layer is rarely extended, give one strong example.
- **Gotchas** is the section that earns its keep. Past-you's debugging
  pain is future-you's prevention.

## When the inventory changes

If a file is added, removed, or substantially renamed under a layer:

1. Update that layer's `README.md` files table.
2. If the change touches the public interface, update the **Public
   interface** section.
3. If it changes invariants, update the **Invariants & contracts**
   section.

This is enforced socially (PR review) rather than mechanically — the
`scripts/arch-check.mjs` script validates layer dependencies but
doesn't validate documentation freshness.
