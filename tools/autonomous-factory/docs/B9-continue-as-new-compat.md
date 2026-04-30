# B9 — `continueAsNew` Input-Shape Compatibility Note

**Status:** compat-verified · implementation deferred to Session 5
**Mandate:** Session 4 exit-gate — verify today's `PipelineInput` can carry a future `DagState` snapshot without a breaking change.

## Why
Workflows must `continueAsNew` before history exceeds ~50K events. Long-haul features will hit that ceiling. Standard pattern:
```ts
await continueAsNew<typeof pipelineWorkflow>({ ...input, resume: dag.snapshot() });
```
This requires `PipelineInput` to be additively-extensible **today**.

## Verification
1. **Additive-only.** `PipelineInput` (`pipeline.workflow.ts:137`) is a `readonly` interface, no index signature. Adding `resume?: DagSnapshot` is a strict structural extension — every current call site (one constructor in `run-feature.ts`; one consumer in `pipelineWorkflow`) destructures only the fields it uses. TS structural typing absorbs new optional fields.
2. **`DagSnapshot` is JSON-clean.** Members: `TransitionState` (plain data, already round-trips through `_STATE.json`), `Record<string, number>`, `readonly ApprovalRequest[]` (gateKey + decision + ms-numbers, no `Date`), three booleans, `string | null`, `number`. No `Map`/`Set`/`Date`/class/function/symbol → safe through Temporal's payload converter.
3. **Rehydration path (S5 sketch):**
   ```ts
   const dag = input.resume
     ? DagState.fromSnapshot(input.resume)
     : DagState.fromInit(buildInit(input));
   if (workflowInfo().historyLength > 8_000) {
     await continueAsNew<typeof pipelineWorkflow>({ ...input, resume: dag.snapshot() });
   }
   ```
   Pure additive change: one optional input field + one `DagState.fromSnapshot` static + one history-length guard.

## Accepted risks (out of scope)
- In-flight activity at cutover: handled by activity-level idempotency keys.
- Pending approvals: re-seated from `snapshot.approvals`; signal handler re-registers naturally.

## What does NOT change today
`PipelineInput` schema · `run-feature.ts` · `DagState` signatures · query/signal defs.

## Conclusion
Session 4's `PipelineInput` is forward-compatible. Session 5 lands the resume path as a strictly additive change. No input field shipped today blocks rehydration.
