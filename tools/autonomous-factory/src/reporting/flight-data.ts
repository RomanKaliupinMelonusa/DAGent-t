/**
 * reporting/flight-data.ts — Cross-session telemetry sidecar and flight-data JSON.
 */

import fs from "node:fs";
import path from "node:path";
import type { ItemSummary } from "../types.js";
import type { PreviousSummaryTotals } from "../app-types.js";
import { featurePath, ensureFeatureDir } from "../adapters/feature-paths.js";

export type { PreviousSummaryTotals } from "../app-types.js";

/**
 * Load structured telemetry from a previous session's _SUMMARY-DATA.json sidecar.
 * Returns null if the file doesn't exist (no Markdown fallback).
 */
export function loadPreviousSummary(appRoot: string, slug: string): PreviousSummaryTotals | null {
  const dataPath = featurePath(appRoot, slug, "summary-data");
  try {
    const raw = fs.readFileSync(dataPath, "utf-8");
    return JSON.parse(raw) as PreviousSummaryTotals;
  } catch {
    return null;
  }
}

/**
 * Write the flight data JSON file atomically.
 * Used by both the end-of-step summary flush and the mid-session heartbeat.
 * Atomic write: tmp file → rename — eliminates partial-read crashes on the dashboard side.
 */
export function writeFlightData(
  appRoot: string,
  featureSlug: string,
  summaries: readonly ItemSummary[],
  silent = false,
): void {
  const flightDataPath = featurePath(appRoot, featureSlug, "flight-data");
  ensureFeatureDir(appRoot, featureSlug, "flight-data");
  const tmpPath = `${flightDataPath}.tmp`;
  try {
    const envelope = {
      version: 1,
      generatedAt: new Date().toISOString(),
      featureSlug,
      items: summaries,
    };
    fs.writeFileSync(tmpPath, JSON.stringify(envelope, null, 2), "utf-8");
    fs.renameSync(tmpPath, flightDataPath);
    if (!silent) {
      console.log(`✈ Flight data written to ${path.relative(appRoot, flightDataPath)}`);
    }
  } catch {
    // Best-effort cleanup of orphaned tmp file
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    console.warn("  ⚠ Could not write flight data file");
  }
}
