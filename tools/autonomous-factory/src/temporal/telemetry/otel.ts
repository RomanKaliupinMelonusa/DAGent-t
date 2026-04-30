/**
 * src/temporal/telemetry/otel.ts — OpenTelemetry / Tempo bootstrap.
 *
 * Per locked decision **D-S4-1** (Grafana Tempo / OSS stack), this
 * module wires distributed tracing into the Temporal worker and
 * client. It is intentionally minimal:
 *
 *  • `bootstrapOtel()` initializes the OTel SDK if `OTLP_ENDPOINT` is
 *    set; otherwise it returns a `null` plugin and a no-op shutdown.
 *    Operators with no Tempo backend can run the worker unchanged.
 *
 *  • Returns an `OpenTelemetryPlugin` instance ready to pass to
 *    `Worker.create({ plugins: [...] })` and a `shutdown()` that
 *    flushes the exporter on SIGTERM.
 *
 *  • Exporter defaults to OTLP over gRPC (Tempo's native ingestion).
 *    Configurable via env:
 *      OTLP_ENDPOINT         Tempo gRPC endpoint (e.g. `http://localhost:4317`)
 *                            When unset the plugin is disabled.
 *      OTEL_SERVICE_NAME     Service name attribute (default `dagent-worker`)
 *      OTEL_RESOURCE_ATTRIBUTES  Standard OTel passthrough.
 *
 * Why a single bootstrap module:
 *   The worker, client, and admin CLI all need the same plugin
 *   wiring. Putting it here keeps the imports isolated to one place
 *   and makes feature-gating trivial — every entry point just calls
 *   `bootstrapOtel()` and conditionally adds the plugin.
 *
 * Out of scope for this group:
 *   • Auto-instrumentation of HTTP/Postgres/etc. (operators add the
 *     usual OTel instrumentations themselves).
 *   • Metrics export (Tempo is traces-only; metrics belong elsewhere).
 *   • Sampling configuration (default `AlwaysOnSampler` is fine for a
 *     workflow-grain tracing system).
 */

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OpenTelemetryPlugin } from "@temporalio/interceptors-opentelemetry";

export interface OtelHandle {
  /**
   * Plugin to pass to `Worker.create({ plugins })` and
   * `new Client({ plugins })`. `null` when telemetry is disabled
   * (no `OTLP_ENDPOINT` set). Callers spread conditionally.
   */
  readonly plugin: OpenTelemetryPlugin | null;
  /** Flush + shutdown the exporter. Always safe to call. */
  readonly shutdown: () => Promise<void>;
}

const NOOP: OtelHandle = {
  plugin: null,
  shutdown: async () => {
    // no-op
  },
};

/**
 * Construct an `OtelHandle`. Cheap when disabled (no async work, no
 * network connection). When enabled, builds the SpanProcessor + plugin
 * but does *not* start the worker — that responsibility stays with the
 * caller.
 */
export function bootstrapOtel(serviceNameDefault = "dagent-worker"): OtelHandle {
  const endpoint = process.env.OTLP_ENDPOINT?.trim();
  if (!endpoint) {
    return NOOP;
  }

  const serviceName =
    process.env.OTEL_SERVICE_NAME?.trim() || serviceNameDefault;

  const resource = new Resource({
    "service.name": serviceName,
  });

  const exporter = new OTLPTraceExporter({ url: endpoint });
  const spanProcessor = new BatchSpanProcessor(exporter);

  const plugin = new OpenTelemetryPlugin({ resource, spanProcessor });

  return {
    plugin,
    shutdown: async () => {
      try {
        await spanProcessor.shutdown();
      } catch (err) {
        console.warn("[otel] span processor shutdown failed:", err);
      }
    },
  };
}
