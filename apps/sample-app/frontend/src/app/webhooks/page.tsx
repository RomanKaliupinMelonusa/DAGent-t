// =============================================================================
// Webhooks Page — Register and list webhook URLs
// =============================================================================
// "use client" is required for static export compatibility (output: "export").
// Fetches webhook list on mount and allows registering new webhook URLs via
// POST /webhooks through the authenticated apiFetch() client.
// =============================================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, ApiError } from "@/lib/apiClient";
import {
  WebhookListResponseSchema,
  type Webhook,
  type WebhookListResponse,
} from "@branded/schemas";
import { Button, Input } from "@/components/ui/primitives";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WORKSPACE_ID = "ws-default";

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // -------------------------------------------------------------------------
  // Fetch webhooks list
  // -------------------------------------------------------------------------

  const fetchWebhooks = useCallback(async () => {
    try {
      const data = await apiFetch<WebhookListResponse>(
        "/webhooks",
        {},
        WebhookListResponseSchema,
      );
      setWebhooks(data.webhooks);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load webhooks",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  // -------------------------------------------------------------------------
  // Register new webhook
  // -------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await apiFetch("/webhooks", {
        method: "POST",
        body: JSON.stringify({
          url: trimmedUrl,
          workspaceId: DEFAULT_WORKSPACE_ID,
        }),
      });
      setUrl("");
      // Refresh the list to include the newly registered webhook
      await fetchWebhooks();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to register webhook",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Webhooks</h1>
      <p className="text-text-secondary">
        Register webhook URLs to receive event payloads.
      </p>

      {/* Registration form */}
      <div className="rounded-lg border border-border bg-surface-card p-6 transition-colors duration-200">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">
          Register Webhook
        </h2>
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <div className="flex-1">
            <label
              htmlFor="webhook-url"
              className="mb-1 block text-sm font-medium text-text-secondary"
            >
              Payload URL
            </label>
            <Input
              id="webhook-url"
              type="url"
              placeholder="https://example.com/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              data-testid="webhook-url-input"
            />
          </div>
          <Button
            type="submit"
            disabled={isSubmitting || !url.trim()}
            data-testid="webhook-submit"
          >
            {isSubmitting ? "Registering..." : "Register"}
          </Button>
        </form>
      </div>

      {/* Error display */}
      {error && (
        <div
          className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Webhook list */}
      <div className="rounded-lg border border-border bg-surface-card p-6 transition-colors duration-200">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">
          Registered Webhooks
        </h2>

        {isLoading ? (
          <p className="text-sm text-text-muted">Loading webhooks…</p>
        ) : webhooks.length === 0 ? (
          <p className="text-sm text-text-muted">
            No webhooks registered yet. Add one above.
          </p>
        ) : (
          <div data-testid="webhook-list" className="space-y-2">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                data-testid="webhook-row"
                className="flex items-center justify-between rounded-md border border-border bg-surface-alt px-4 py-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {webhook.url}
                  </p>
                  <p className="text-xs text-text-muted">
                    Created:{" "}
                    {new Date(webhook.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="ml-3 shrink-0 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {webhook.workspaceId}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
