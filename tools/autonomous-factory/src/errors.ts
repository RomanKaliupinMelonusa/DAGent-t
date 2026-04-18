/**
 * errors.ts — Typed error hierarchy for the orchestrator.
 *
 * All fatal pipeline errors extend `FatalPipelineError` so the top-level
 * catch in `main()` can distinguish recoverable vs. fatal failures and
 * emit structured telemetry for every exit path.
 *
 * Rule: Only `cli.ts` may call `process.exit()`. Every other module throws.
 */

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

/**
 * Base class for all fatal pipeline errors. Carries a machine-readable
 * `code` for structured telemetry (`run.end` events in JSONL).
 */
export class FatalPipelineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "FatalPipelineError";
  }
}

// ---------------------------------------------------------------------------
// Subtypes
// ---------------------------------------------------------------------------

/** Failure during CLI argument parsing or validation. */
export class CliValidationError extends FatalPipelineError {
  constructor(message: string) {
    super(message, "CLI_VALIDATION");
    this.name = "CliValidationError";
  }
}

/** Failure during bootstrap / preflight (APM compilation, env resolution, auth). */
export class BootstrapError extends FatalPipelineError {
  constructor(message: string) {
    super(message, "BOOTSTRAP");
    this.name = "BootstrapError";
  }
}

/** Failure in git operations (branch creation, push, rebase). */
export class GitError extends FatalPipelineError {
  constructor(message: string) {
    super(message, "GIT");
    this.name = "GitError";
  }
}

/** Failure in pipeline state management (drift, corruption). */
export class StateError extends FatalPipelineError {
  constructor(message: string) {
    super(message, "STATE");
    this.name = "StateError";
  }
}
