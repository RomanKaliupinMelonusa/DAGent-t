/**
 * reporting/index.ts — Barrel for the reporting subsystem.
 *
 * Re-exports the public surface previously located in src/reporting.ts.
 */

export {
  setModelPricing,
  getModelPricing,
  MODEL_PRICING,
  computeStepCost,
} from "./pricing.js";

export {
  formatDuration,
  outcomeIcon,
  formatUsd,
} from "./format.js";

export { buildCostAnalysisLines } from "./cost.js";

export {
  loadPreviousSummary,
  writeFlightData,
  type PreviousSummaryTotals,
} from "./flight-data.js";

export { writePipelineSummary } from "./summary.js";
export { writeTerminalLog } from "./terminal-log.js";
export { writeChangeManifest } from "./change-manifest.js";
