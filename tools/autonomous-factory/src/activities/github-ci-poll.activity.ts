/**
 * src/activities/github-ci-poll.activity.ts — Inlined activity.
 *
 * Polls GitHub Actions CI for completion. Emits Temporal heartbeats every
 * 30s so the server can detect a worker crash mid-poll. Cancellation is
 * cooperative: workflow-initiated cancellation surfaces as `outcome:
 * "failed"` with `CI_POLL_CANCELLED_PREFIX` so the workflow body can
 * route uniformly.
 *
 * Audit per Wave 2: this activity drops every middleware concern.
 *  - auto-skip:               ci-poll nodes don't declare skip rules
 *  - fixture-validation:      spec-compiler only
 *  - acceptance-integrity:    contract is read-only by the time CI runs;
 *                             no value gating between deploy and ci-poll
 *  - handler-output-ingestion ci-poll never writes handler-output.json
 *  - lifecycle-hooks:         ci-poll nodes don't declare pre/post
 *  - materialize-inputs:      ci-poll declares no consumes_*
 *  - result-processor:        ci-poll never emits scriptOutput
 *
 * Retry strategy: `runPollWithRetries` already retries transient
 * gh/network errors `apmContext.config.transient_retry.max` times. The
 * workflow's Temporal RetryPolicy covers worker-process crashes only.
 */

import { withHeartbeat } from "./support/heartbeat.js";
import { buildNodeContext } from "./support/build-context.js";
import { buildCancellationRace } from "./support/cancellation.js";
import {
  DEFAULT_TRANSIENT_RETRIES,
  DEFAULT_TRANSIENT_BACKOFF_MS,
  buildPollCmd,
  buildPollEnv,
  runPollWithRetries,
} from "../session/transient-poll.js";
import { postCiArtifactToPr } from "../session/ci-artifact-poster.js";
import { featurePath } from "../paths/feature-paths.js";
import { getWorkflowNode } from "../session/dag-utils.js";
import type { NodeActivityInput, NodeActivityResult } from "./types.js";

/** Marker errorMessage emitted when the activity is cancelled mid-poll. */
export const CI_POLL_CANCELLED_PREFIX = "CI poll cancelled by workflow";

export async function githubCiPollActivity(
  input: NodeActivityInput,
): Promise<NodeActivityResult> {
  return withHeartbeat<NodeActivityResult>(
    async ({ emit, signal }) => {
      const ctx = await buildNodeContext(input, {
        onHeartbeat: () => emit({ stage: "polling", itemKey: input.itemKey }),
      });

      const cancelled = buildCancellationRace({
        prefix: CI_POLL_CANCELLED_PREFIX,
        heartbeatSignal: signal,
      });

      const polled = (async (): Promise<NodeActivityResult> => {
        const { slug, repoRoot, appRoot, apmContext, filesystem } = ctx;
        const node = getWorkflowNode(apmContext, ctx.pipelineState.workflowName, ctx.itemKey);

        const pollTarget = node?.poll_target;
        const ciWorkflowKey = node?.ci_workflow_key ?? "app";

        if (!pollTarget) {
          return {
            outcome: "error",
            errorMessage: `BUG: CI poll activity for "${ctx.itemKey}" has no poll_target declared.`,
            summary: {},
          };
        }

        const inProgressDir = filesystem.joinPath(appRoot, ".dagent");
        const diagFile = featurePath(appRoot, slug, "ci-failure");

        // Resolve the pushed SHA from the corresponding push item's handler output
        const lastPushedSha = (ctx.handlerData[`${pollTarget}:lastPushedSha`] as string) ?? null;

        const pollCmd = buildPollCmd(repoRoot, lastPushedSha);
        const maxRetries = apmContext.config?.transient_retry?.max ?? DEFAULT_TRANSIENT_RETRIES;
        const backoffMs = apmContext.config?.transient_retry?.backoff_ms ?? DEFAULT_TRANSIENT_BACKOFF_MS;

        ctx.logger.event("item.start", ctx.itemKey, { agent: "ci-poll", node_type: "poll", category: "deploy" });
        if (lastPushedSha) {
          ctx.logger.event("tool.call", ctx.itemKey, {
            tool: "poll-ci",
            category: "poll",
            detail: ` SHA-pinned to ${lastPushedSha.slice(0, 8)}`,
            is_write: false,
          });
        }

        const pollResult = await runPollWithRetries({
          pollCmd,
          cwd: repoRoot,
          env: buildPollEnv(inProgressDir, slug, apmContext.config, ciWorkflowKey),
          maxRetries,
          backoffMs,
          onTransientRetry: (attempt, max) => {
            ctx.logger.event("tool.call", ctx.itemKey, {
              tool: "poll-ci",
              category: "poll",
              detail: ` transient error (attempt ${attempt}/${max})`,
              is_write: false,
            });
          },
        });

        switch (pollResult.type) {
          case "success": {
            if (node?.post_ci_artifact_to_pr) {
              try {
                await postCiArtifactToPr({
                  repoRoot,
                  slug,
                  apmConfig: apmContext.config as Record<string, unknown> | undefined,
                  shell: ctx.shell,
                  filesystem: ctx.filesystem,
                });
              } catch (planErr) {
                ctx.logger.event("tool.call", ctx.itemKey, {
                  tool: "post-ci-artifact",
                  category: "ci",
                  detail: ` failed: ${planErr instanceof Error ? planErr.message : String(planErr)}`,
                  is_write: false,
                });
              }
            }
            ctx.logger.event("item.end", ctx.itemKey, { outcome: "completed", note: "all workflows passed" });
            return {
              outcome: "completed",
              summary: { intents: ["Deterministic CI poll — all workflows passed"] },
            };
          }
          case "transient_exhausted": {
            ctx.logger.event("item.end", ctx.itemKey, {
              outcome: "failed",
              error_preview: `Exhausted ${maxRetries} transient retries`,
            });
            return {
              outcome: "failed",
              errorMessage: `CI polling hit ${maxRetries} transient network errors — will retry`,
              summary: {},
            };
          }
          case "cancelled": {
            ctx.logger.event("item.end", ctx.itemKey, {
              outcome: "failed",
              error_preview: "CI polling manually cancelled",
            });
            return {
              outcome: "failed",
              errorMessage: "CI polling was manually cancelled — will retry",
              summary: {},
            };
          }
          case "failed": {
            ctx.logger.event("item.end", ctx.itemKey, {
              outcome: "failed",
              error_preview: `CI poll failed: ${pollResult.message.slice(0, 200)}`,
            });
            let failureContext: string;
            if (filesystem.existsSync(diagFile)) {
              try {
                const diagContent = filesystem.readFileSync(diagFile).trim();
                failureContext = diagContent || pollResult.capturedOutput || pollResult.message;
                if (diagContent) {
                  const relDiag = diagFile.startsWith(repoRoot + "/")
                    ? diagFile.slice(repoRoot.length + 1)
                    : diagFile;
                  ctx.logger.event("tool.call", ctx.itemKey, {
                    tool: "read-ci-diag",
                    category: "diagnostic",
                    detail: ` → ${relDiag}`,
                    is_write: false,
                  });
                }
              } catch {
                failureContext = pollResult.capturedOutput || pollResult.message;
              }
            } else {
              failureContext = pollResult.capturedOutput || pollResult.message;
            }
            return {
              outcome: "failed",
              errorMessage: failureContext,
              summary: {},
            };
          }
        }
      })();

      return Promise.race([polled, cancelled]);
    },
    { intervalMs: 30_000 },
  );
}
