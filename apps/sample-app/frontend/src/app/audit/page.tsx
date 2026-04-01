// =============================================================================
// Audit Log Dashboard — Displays recent audit events
// =============================================================================
// Client component that fetches the latest 50 audit log entries from
// GET /audit and renders them in a data table with loading, error,
// and empty states.
// =============================================================================

"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { AuditLogSchema, type AuditLog } from "@branded/schemas";
import { z } from "zod";

// Runtime validation schema for the API response (array of audit logs)
const AuditLogArraySchema = z.array(AuditLogSchema);

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchLogs() {
      try {
        const data = await apiFetch<AuditLog[]>(
          "/audit",
          {},
          AuditLogArraySchema,
        );
        if (!cancelled) {
          setLogs(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Failed to load audit logs.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchLogs();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">Audit Log</h1>
        <div
          className="flex items-center justify-center py-12"
          data-testid="audit-loading"
        >
          <p className="text-sm text-text-muted">Loading audit logs…</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">Audit Log</h1>
        <div
          className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text"
          role="alert"
          data-testid="audit-error"
        >
          {error}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  if (logs.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">Audit Log</h1>
        <div
          className="rounded-lg border border-border bg-surface-card p-8 text-center"
          data-testid="audit-empty"
        >
          <p className="text-sm text-text-muted">No audit events recorded yet.</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Data table
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Audit Log</h1>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface-card transition-colors duration-200">
        <table className="w-full text-sm" data-testid="audit-table">
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              <th className="px-4 py-3 text-left font-medium text-text-secondary">
                User ID
              </th>
              <th className="px-4 py-3 text-left font-medium text-text-secondary">
                Action
              </th>
              <th className="px-4 py-3 text-left font-medium text-text-secondary">
                Timestamp
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr
                key={log.id}
                className="border-b border-border last:border-b-0"
                data-testid="audit-row"
              >
                <td className="px-4 py-3 text-text-primary">{log.userId}</td>
                <td className="px-4 py-3 text-text-primary">
                  <code className="rounded bg-surface-alt px-1.5 py-0.5 text-xs">
                    {log.action}
                  </code>
                </td>
                <td className="px-4 py-3 text-text-muted">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
