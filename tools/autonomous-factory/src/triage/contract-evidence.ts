/**
 * triage/contract-evidence.ts — D3.
 *
 * When Phase B oracles (`validate-acceptance.mjs`) and the B2 qa-adversary
 * node run, they deposit structured JSON into the feature's `in-progress/`
 * directory:
 *
 *   <slug>_VALIDATION.json  — contract oracle verdict
 *   <slug>_QA-REPORT.json   — adversarial probe verdict
 *
 * Prior to D3, triage only saw the raw stdout/stderr of the failing script,
 * which forced the LLM classifier to re-derive contract violations from
 * ANSI-laden Playwright logs. That's how product-quick-view shipped: the
 * oracle said "uncaught TypeError on masterId", but triage saw a 30 KB
 * console dump and classified the failure as `test-code`.
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
 * @param appRoot Absolute path to the app root (the directory that contains `in-progress/`).
 * @param slug    Feature slug; the artifact filenames are `${slug}_VALIDATION.json` and `${slug}_QA-REPORT.json`.
 */
export function loadContractEvidence(appRoot: string, slug: string): ContractEvidenceBlock {
  if (!appRoot || !slug) return { text: "", sources: [] };

  const entries: Array<{ label: string; file: string }> = [
    { label: "Acceptance Oracle Verdict", file: path.join(appRoot, "in-progress", `${slug}_VALIDATION.json`) },
    { label: "QA Adversary Report", file: path.join(appRoot, "in-progress", `${slug}_QA-REPORT.json`) },
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
 * no artifacts exist — returns the original trace unchanged so downstream
 * behaviour is preserved for features that predate the oracle.
 */
export function prependContractEvidence(
  rawError: string,
  appRoot: string | undefined,
  slug: string | undefined,
): { trace: string; sources: string[] } {
  const evidence = loadContractEvidence(appRoot ?? "", slug ?? "");
  if (!evidence.text) return { trace: rawError, sources: [] };
  return {
    trace: `${evidence.text}\n### Raw failure output\n${rawError}`,
    sources: evidence.sources,
  };
}
