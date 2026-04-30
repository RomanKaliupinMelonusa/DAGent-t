/**
 * reporting/pricing.ts — Model pricing and per-step cost computation.
 */
/**
 * Model pricing per million tokens (USD).
 * Default: Anthropic Claude Opus 4 direct pricing.
 * Note: actual cost may differ under GitHub Copilot API billing.
 * Override via config.model_pricing in apm.yml.
 */
let modelPricing = {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheReadPerMillion: 1.5,
    cacheWritePerMillion: 3.75,
};
/** Override model pricing from APM config (call once at startup). */
export function setModelPricing(pricing) {
    modelPricing = { ...modelPricing, ...pricing };
}
/** Read-only access to current model pricing. */
export function getModelPricing() { return modelPricing; }
/**
 * @deprecated Use getModelPricing() instead. Kept for backward compatibility.
 */
export const MODEL_PRICING = modelPricing;
/** Compute estimated USD cost for a single pipeline step based on token usage */
export function computeStepCost(s) {
    return (s.inputTokens * modelPricing.inputPerMillion +
        s.outputTokens * modelPricing.outputPerMillion +
        s.cacheReadTokens * modelPricing.cacheReadPerMillion +
        s.cacheWriteTokens * modelPricing.cacheWritePerMillion) / 1_000_000;
}
//# sourceMappingURL=pricing.js.map