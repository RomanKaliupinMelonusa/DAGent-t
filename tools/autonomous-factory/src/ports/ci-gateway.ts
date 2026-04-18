/**
 * ports/ci-gateway.ts — Port interface for CI/CD polling and interaction.
 *
 * Abstracts GitHub Actions / CI polling behind an async interface.
 * Production adapter wraps poll-ci.sh; tests use a stub.
 */

export interface CiRunStatus {
  /** Overall status: pending, success, failure, cancelled. */
  status: "pending" | "success" | "failure" | "cancelled";
  /** URL to the CI run (for reporting). */
  runUrl?: string;
  /** Raw output / error log excerpt. */
  output?: string;
}

export interface CiGateway {
  /** Poll for the CI status of a given SHA / branch. */
  poll(branch: string, sha: string, timeoutMs?: number): Promise<CiRunStatus>;
}
