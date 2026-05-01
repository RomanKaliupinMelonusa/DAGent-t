/**
 * ports/copilot-session-runner.ts — Port for SDK session execution.
 *
 * Type-only port. Concrete parameter / result shapes live in
 * `src/contracts/copilot-session.ts`; the SDK runtime adapter narrows
 * the generics to those concrete types. Keeping the port generic lets
 * this file stay free of cross-layer (`harness/`, `telemetry/`,
 * `contracts/`, `@github/copilot-sdk`) imports.
 */

export interface CopilotSessionRunner<
  TClient = unknown,
  TParams = unknown,
  TResult = unknown,
> {
  run(client: TClient, params: TParams): Promise<TResult>;
}
