/**
 * triage/contract-evidence.ts — D3.
 *
 * When Phase B oracles (`validate-acceptance.mjs`) and the B2 qa-adversary
 * node run, they deposit structured JSON into the feature's `.dagent/`
 * directory:
 *
 *   <slug>_VALIDATION.json  — contract oracle verdict
 *   <slug>_QA-REPORT.json   — adversarial probe verdict
 *
 * Prior to D3, triage only saw the raw stdout/stderr of the failing script,
 * which forced the LLM classifier to re-derive contract violations from
 * ANSI-laden Playwright logs. Typical miss: the oracle reports an uncaught
 * TypeError against a contract-named testid, but triage sees a 30 KB
 * framework console dump and misclassifies the failure as `test-code`.
 *
 * This module loads whichever contract-evidence artifacts exist for the
 * current feature and renders a compact markdown block that is prepended
 * to the raw trace before it is handed to `evaluateTriage`. The oracle
 * verdict is shown verbatim at the top so both the RAG substring matcher
 * and the LLM classifier see it first.
 *
 * Failure modes are silent by design — a missing file, a parse error, or
 * an unexpected shape collapses to "no evidence available" and triage
 * falls back to the raw trace. Triage must never itself fail because the
 * oracle did.
 */

import fs from "node:fs";
import path from "node:path";
import { extractPrimaryCause } from "./playwright-report.js";
import { featurePath } from "../paths/feature-paths.js";

/** Upper bound on how much of each artifact we inline into the prompt.
 *  Keeps the total triage-prompt budget predictable. The artifacts are
 *  already summaries, so 4 KB is plenty for normal feature runs. */
const MAX_EVIDENCE_BYTES_PER_FILE = 4_096;

export interface ContractEvidenceBlock {
  /** Fully rendered markdown block, or `""` when no artifacts exist. */
  text: string;
  /** Artifacts that were found and successfully parsed (relative paths). */
  sources: string[];
}

function readTruncated(file: string): string | null {
  try {
    const buf = fs.readFileSync(file, "utf-8");
    return buf.length > MAX_EVIDENCE_BYTES_PER_FILE
      ? buf.slice(0, MAX_EVIDENCE_BYTES_PER_FILE) + "\n… (truncated)"
      : buf;
  } catch {
    return null;
  }
}

function formatArtifact(label: string, relPath: string, body: string): string {
  return `#### ${label} — \`${relPath}\`\n\`\`\`json\n${body.trim()}\n\`\`\``;
}

/**
 * Load and render the contract-evidence block for a feature.
 *
 * @param appRoot Absolute path to the app root (the directory that contains `.dagent/`).
 * @param slug    Feature slug; artifacts are resolved via `featurePath`.
 */
export function loadContractEvidence(appRoot: string, slug: string): ContractEvidenceBlock {
  if (!appRoot || !slug) return { text: "", sources: [] };

  const entries: Array<{ label: string; file: string }> = [
    { label: "Acceptance Oracle Verdict", file: featurePath(appRoot, slug, "validation") },
    { label: "QA Adversary Report", file: featurePath(appRoot, slug, "qa-report") },
  ];

  const sections: string[] = [];
  const sources: string[] = [];
  for (const { label, file } of entries) {
    if (!fs.existsSync(file)) continue;
    const body = readTruncated(file);
    if (body == null) continue;
    const rel = path.relative(appRoot, file) || file;
    sections.push(formatArtifact(label, rel, body));
    sources.push(rel);
  }

  if (sections.length === 0) return { text: "", sources: [] };

  const text = [
    "### Contract evidence",
    "",
    "The feature run produced structured oracle evidence below. Trust these",
    "verdicts over any surface-level stdout; they were computed against the",
    "immutable acceptance contract compiled at feature-init time.",
    "",
    ...sections,
    "",
  ].join("\n");

  return { text, sources };
}

/**
 * Prepend the contract-evidence block to a raw error trace. No-op when
 * no artifacts exist — except for the Round-2 R4 primary-cause fallback:
 * when no oracle artifacts are available we still scan the raw trace for
 * Playwright's failure-header pattern and front-load the single most
 * relevant `TimeoutError:` / `Error:` lines. That alone is enough to stop
 * the LLM router from getting lost in a 30 KB ANSI dump.
 */
export function prependContractEvidence(
  rawError: string,
  appRoot: string | undefined,
  slug: string | undefined,
): { trace: string; sources: string[] } {
  const evidence = loadContractEvidence(appRoot ?? "", slug ?? "");
  if (evidence.text) {
    return {
      trace: `${evidence.text}\n### Raw failure output\n${rawError}`,
      sources: evidence.sources,
    };
  }
  // Round-2 R4 fallback — no oracle artifacts, best-effort primary cause.
  const primary = extractPrimaryCause(rawError);
  if (primary) {
    return {
      trace:
        `### Primary failure\n\n\`\`\`\n${primary}\n\`\`\`\n\n` +
        `### Raw failure output\n${rawError}`,
      sources: [],
    };
  }
  return { trace: rawError, sources: [] };
}
