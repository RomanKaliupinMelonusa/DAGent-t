/**
 * iso-time.test.ts — round-trip parity vs. the platform `Date` formatter.
 *
 * Tests can use the `Date` global because they run outside the workflow
 * sandbox (lint exempts `__tests__/**`). The workflow code under test
 * does not.
 */

import { describe, it, expect } from "vitest";
import { formatIsoFromMs } from "../iso-time.js";

function dateRef(ms: number): string {
  return new Date(ms).toISOString();
}

describe("formatIsoFromMs", () => {
  it("epoch zero", () => {
    expect(formatIsoFromMs(0)).toBe("1970-01-01T00:00:00.000Z");
    expect(formatIsoFromMs(0)).toBe(dateRef(0));
  });

  it("one millisecond before epoch", () => {
    expect(formatIsoFromMs(-1)).toBe("1969-12-31T23:59:59.999Z");
    expect(formatIsoFromMs(-1)).toBe(dateRef(-1));
  });

  it("April 30, 2026 (today-ish)", () => {
    const ms = Date.UTC(2026, 3, 30, 12, 34, 56, 789);
    expect(formatIsoFromMs(ms)).toBe(dateRef(ms));
  });

  it("leap day 2024-02-29", () => {
    const ms = Date.UTC(2024, 1, 29, 0, 0, 0, 0);
    expect(formatIsoFromMs(ms)).toBe("2024-02-29T00:00:00.000Z");
    expect(formatIsoFromMs(ms)).toBe(dateRef(ms));
  });

  it("non-leap year 2100", () => {
    const ms = Date.UTC(2100, 1, 28, 23, 59, 59, 999);
    expect(formatIsoFromMs(ms)).toBe(dateRef(ms));
  });

  it("400-year leap year 2000", () => {
    const ms = Date.UTC(2000, 1, 29, 0, 0, 0, 0);
    expect(formatIsoFromMs(ms)).toBe(dateRef(ms));
  });

  it("sub-second precision", () => {
    for (const ms of [1, 999, 12_345, 999_999]) {
      expect(formatIsoFromMs(ms)).toBe(dateRef(ms));
    }
  });

  it("random sample over ±100 years", () => {
    const baseline = Date.UTC(2026, 3, 30);
    const range = 100 * 365 * 86_400_000;
    for (let i = 0; i < 1000; i++) {
      const ms = baseline + Math.floor((Math.random() - 0.5) * 2 * range);
      expect(formatIsoFromMs(ms)).toBe(dateRef(ms));
    }
  });

  it("rejects non-finite input", () => {
    expect(() => formatIsoFromMs(Number.NaN)).toThrow(RangeError);
    expect(() => formatIsoFromMs(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => formatIsoFromMs(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });
});
