/**
 * session/ci-artifact-poster.ts — Draft-PR Terraform plan attachment.
 *
 * Extracted from the github-ci-poll handler so the handler itself can
 * stay within the arch-check boundary (no `node:fs` / `node:child_process`
 * imports). All I/O flows through ports passed in by the caller.
 */

import type { Shell } from "../ports/shell.js";
import type { FeatureFilesystem } from "../ports/feature-filesystem.js";

export interface PostCiArtifactArgs {
  readonly repoRoot: string;
  readonly slug: string;
  readonly apmConfig: Record<string, unknown> | undefined;
  readonly shell: Shell;
  readonly filesystem: FeatureFilesystem;
  readonly logger?: (msg: string) => void;
}

/**
 * Download the latest Terraform plan artifact and post it as a draft-PR
 * comment. Deduplicates against a per-run marker so repeated polls don't
 * spam the PR.
 */
export async function postCiArtifactToPr(args: PostCiArtifactArgs): Promise<void> {
  const { repoRoot, slug, apmConfig, shell, filesystem } = args;
  const log = args.logger ?? ((m) => console.log(m));
  const branch = `feature/${slug}`;
  const infraPlanFile =
    (apmConfig?.ciWorkflows as Record<string, string> | undefined)
      ?.infraPlanFile ?? "deploy-infra.yml";

  const runIdOutput = shell
    .execSync(
      `gh run list --branch "${branch}" --workflow ${infraPlanFile} --status success --limit 1 --json databaseId -q '.[0].databaseId'`,
      { cwd: repoRoot, timeoutMs: 30_000 },
    )
    .trim();

  if (!runIdOutput) return;

  // Dedup: skip if we already posted a plan comment for this CI run
  const marker = `<!-- tf-plan-run-${runIdOutput} -->`;
  let alreadyPosted = false;
  try {
    const existingComments = shell.execSync(
      `gh pr view "${branch}" --json comments --jq '.comments[].body'`,
      { cwd: repoRoot, timeoutMs: 30_000 },
    );
    alreadyPosted = existingComments.includes(marker);
  } catch {
    /* ignore — proceed to post */
  }

  if (alreadyPosted) {
    log(`  📋 Terraform plan already posted for run ${runIdOutput} — skipping`);
    return;
  }

  const tmpDir = filesystem.mkdtempSync("plan-");
  try {
    shell.execSync(
      `gh run download ${runIdOutput} -n plan-output -D "${tmpDir}"`,
      { cwd: repoRoot, timeoutMs: 60_000 },
    );
    const planFile = filesystem.joinPath(tmpDir, "plan-output.txt");
    if (filesystem.existsSync(planFile)) {
      const planText = filesystem.readFileSync(planFile).trim();
      const prCommentTemplate =
        ((apmConfig?.ciWorkflows as Record<string, unknown> | undefined)
          ?.pr_comment_template as string | undefined) ??
        "> Comment `/dagent approve-infra` to apply this plan.";
      const commentBody = [
        marker,
        "### Terraform Plan — `success`",
        "",
        "<details><summary>Click to expand plan output</summary>",
        "",
        "```",
        planText,
        "```",
        "",
        "</details>",
        "",
        prCommentTemplate,
      ].join("\n");
      const commentFile = filesystem.joinPath(tmpDir, "plan-comment.md");
      filesystem.writeFileSync(commentFile, commentBody);
      shell.execSync(`gh pr comment "${branch}" --body-file "${commentFile}"`, {
        cwd: repoRoot,
        timeoutMs: 30_000,
      });
      log(`  📋 Posted Terraform plan to Draft PR`);
    }
  } finally {
    filesystem.removeSync(tmpDir);
  }
}
