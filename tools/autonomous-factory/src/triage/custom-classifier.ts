/**
 * triage/custom-classifier.ts — Sandboxed loader for user-supplied classifier modules.
 *
 * Pattern mirrors `handlers/registry.ts`: resolve the module path against the
 * app root, assert it resides within the repository boundary, then dynamic-import.
 * Classifiers are cached per resolved path for the lifetime of the process.
 */

import path from "node:path";
import type { CopilotClient } from "@github/copilot-sdk";
import type { TriageResult } from "../types.js";
import type { CompiledTriageProfile } from "../apm/types.js";
import type { PipelineLogger } from "../telemetry/index.js";

/** Context forwarded to a custom classifier in addition to the trace/profile. */
export interface CustomClassifierContext {
  readonly client?: CopilotClient;
  readonly slug?: string;
  readonly logger?: PipelineLogger;
}

/** Signature a custom classifier module must implement. */
export type ClassifyFn = (
  errorTrace: string,
  profile: CompiledTriageProfile,
  ctx: CustomClassifierContext,
) => Promise<TriageResult>;

const classifierCache = new Map<string, ClassifyFn>();

function assertWithinRepo(resolved: string, repoRoot: string): void {
  const normalizedResolved = path.resolve(resolved);
  const normalizedRepo = path.resolve(repoRoot);
  if (
    !normalizedResolved.startsWith(normalizedRepo + path.sep) &&
    normalizedResolved !== normalizedRepo
  ) {
    throw new Error(
      `Security: Classifier path "${resolved}" resolves outside the repository boundary. ` +
        `All custom classifiers must reside within the repository.`,
    );
  }
}

/**
 * Load a custom classifier from a local file path.
 * The module must export a default function or named `classify` function.
 */
export async function loadCustomClassifier(
  filePath: string,
  appRoot: string,
  repoRoot: string,
): Promise<ClassifyFn> {
  const resolved = path.resolve(appRoot, filePath);
  assertWithinRepo(resolved, repoRoot);

  const cached = classifierCache.get(resolved);
  if (cached) return cached;

  let mod: Record<string, unknown>;
  try {
    mod = (await import(resolved)) as Record<string, unknown>;
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" ||
      (err as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND"
    ) {
      throw new Error(
        `Custom classifier "${filePath}" not found at ${resolved}. ` +
          `Verify the file exists and is a valid TypeScript/JavaScript module.`,
      );
    }
    throw err;
  }

  const fn = (mod.default ?? mod.classify) as ClassifyFn | undefined;
  if (typeof fn !== "function") {
    throw new Error(
      `Custom classifier "${filePath}" does not export a valid classify function. ` +
        `Expected a default export or named "classify" export.`,
    );
  }

  classifierCache.set(resolved, fn);
  return fn;
}

/** Test-only: reset the classifier cache between tests. */
export function __resetClassifierCache(): void {
  classifierCache.clear();
}
