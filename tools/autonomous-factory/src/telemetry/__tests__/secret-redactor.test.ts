/**
 * secret-redactor.test.ts — Track B3 unit coverage.
 *
 * Covers:
 *   - Identity return when no environment is supplied / no secret keys.
 *   - Key name denylist match (key/secret/token/password/connection/credential).
 *   - Minimum-length gate avoids replacing trivial values ("yes", "on").
 *   - Longer secrets replace before shorter when both match (ordering
 *     guarantee).
 *   - Literal replacement — values containing regex metacharacters are
 *     replaced safely.
 *   - Replacement token format `[REDACTED:KEY]`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildSecretRedactor } from "../secret-redactor.js";

describe("buildSecretRedactor (Track B3)", () => {
  it("returns identity when env is undefined", () => {
    const redact = buildSecretRedactor(undefined);
    assert.equal(redact("hello world"), "hello world");
  });

  it("returns identity when no keys match the denylist", () => {
    const redact = buildSecretRedactor({ REGION: "eastus", STAGE: "dev" });
    assert.equal(redact("region=eastus stage=dev"), "region=eastus stage=dev");
  });

  it("returns identity when matching keys have short values", () => {
    // "SECRET_MODE=on" — key matches, but value is below default 8-char gate.
    const redact = buildSecretRedactor({ SECRET_MODE: "on" });
    assert.equal(redact("flag=on"), "flag=on");
  });

  it("redacts a matching secret value in a log chunk", () => {
    const redact = buildSecretRedactor({
      API_KEY: "abcdef-0123456789",
      REGION: "eastus",
    });
    const out = redact('{"auth":"abcdef-0123456789","region":"eastus"}');
    assert.equal(out, '{"auth":"[REDACTED:API_KEY]","region":"eastus"}');
  });

  it("recognizes all documented key-name patterns", () => {
    const redact = buildSecretRedactor({
      AZURE_KEY: "key-value-aaaaaaaa",
      API_SECRET: "secret-value-bbbb",
      AUTH_TOKEN: "token-value-cccc",
      USER_PASSWORD: "pw-value-dddddddd",
      AZURE_CONNECTION: "conn-string-eeee",
      GITHUB_CREDENTIAL: "cred-value-ffff",
    });
    const input = [
      "key-value-aaaaaaaa",
      "secret-value-bbbb",
      "token-value-cccc",
      "pw-value-dddddddd",
      "conn-string-eeee",
      "cred-value-ffff",
    ].join(" ");
    const out = redact(input);
    assert.equal(
      out,
      "[REDACTED:AZURE_KEY] [REDACTED:API_SECRET] [REDACTED:AUTH_TOKEN] [REDACTED:USER_PASSWORD] [REDACTED:AZURE_CONNECTION] [REDACTED:GITHUB_CREDENTIAL]",
    );
  });

  it("handles values with regex metacharacters (literal replacement)", () => {
    const tricky = "p.a*s+w^o$r|d\\with/special(chars)[]{}";
    const redact = buildSecretRedactor({ DB_PASSWORD: tricky });
    assert.equal(
      redact(`connect=${tricky};timeout=5`),
      "connect=[REDACTED:DB_PASSWORD];timeout=5",
    );
  });

  it("orders replacement by descending length when values overlap", () => {
    // A short secret is a prefix of a longer secret. We must replace
    // the longer one first so its full span is redacted.
    const redact = buildSecretRedactor({
      SHORT_KEY: "abcdefgh",
      LONGER_TOKEN: "abcdefgh_plus_tail",
    });
    const out = redact("use abcdefgh_plus_tail for auth");
    assert.equal(out, "use [REDACTED:LONGER_TOKEN] for auth");
  });

  it("replaces every occurrence of a secret in the chunk", () => {
    const redact = buildSecretRedactor({ API_TOKEN: "tok-11112222" });
    const out = redact("tok-11112222\ntok-11112222\nnope");
    assert.equal(out, "[REDACTED:API_TOKEN]\n[REDACTED:API_TOKEN]\nnope");
  });

  it("is case-insensitive on key names", () => {
    const redact = buildSecretRedactor({ my_api_Key: "kkkkkkkkkkkk" });
    assert.equal(redact("kkkkkkkkkkkk"), "[REDACTED:my_api_Key]");
  });

  it("respects a custom minValueLength option", () => {
    const redact = buildSecretRedactor(
      { API_KEY: "abc" }, // 3 chars
      { minValueLength: 2 },
    );
    assert.equal(redact("val=abc"), "val=[REDACTED:API_KEY]");
  });

  it("respects a custom keyPattern option", () => {
    const redact = buildSecretRedactor(
      { CUSTOM_SEAL: "sealed-value-1234" },
      { keyPattern: /seal/i },
    );
    assert.equal(redact("x=sealed-value-1234"), "x=[REDACTED:CUSTOM_SEAL]");
  });
});
