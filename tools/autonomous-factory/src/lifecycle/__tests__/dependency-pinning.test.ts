/**
 * Tests for dependency-pinning preflight (Session C).
 *
 * Covers the two public entry points:
 *  - checkPinnedDependencies: no-op / happy path / out-of-range / missing pkg / missing lock.
 *  - computeApiDrift: no-op / identical snapshot / removed exports / added exports.
 *
 * The semver-subset matcher (satisfiesRange) is exercised via the pin check's
 * integration rather than as isolated unit tests — same behaviour, fewer moving
 * parts to keep in lockstep.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  checkPinnedDependencies,
  computeApiDrift,
  satisfiesRange,
} from "../dependency-pinning.js";
import type { ApmConfig } from "../../apm/index.js";
import { BootstrapError } from "../../errors.js";

function tmpApp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dep-pin-"));
}

function writeLock(appRoot: string, entries: Record<string, string>): void {
  const packages: Record<string, unknown> = { "": { name: "app" } };
  for (const [pkg, version] of Object.entries(entries)) {
    packages[`node_modules/${pkg}`] = { version };
  }
  fs.writeFileSync(
    path.join(appRoot, "package-lock.json"),
    JSON.stringify({ name: "app", lockfileVersion: 3, packages }, null, 2),
  );
}

function makeConfig(pinned?: Record<string, string>, referenceDir?: string): ApmConfig {
  const cfg: Record<string, unknown> = {};
  if (pinned || referenceDir) {
    cfg.dependencies = {
      ...(pinned ? { pinned } : {}),
      ...(referenceDir ? { reference_dir: referenceDir } : {}),
    };
  }
  return cfg as unknown as ApmConfig;
}

describe("checkPinnedDependencies", () => {
  it("returns null when no pins are declared", () => {
    const appRoot = tmpApp();
    try {
      assert.equal(checkPinnedDependencies(appRoot, makeConfig()), null);
      assert.equal(checkPinnedDependencies(appRoot, undefined), null);
    } finally {
      fs.rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it("passes when installed version satisfies a tilde range", () => {
    const appRoot = tmpApp();
    try {
      writeLock(appRoot, { "@salesforce/retail-react-app": "9.1.7" });
      const report = checkPinnedDependencies(
        appRoot,
        makeConfig({ "@salesforce/retail-react-app": "~9.1.1" }),
      );
      assert.ok(report);
      assert.equal(report.checked[0].installed, "9.1.7");
      assert.equal(report.checked[0].range, "~9.1.1");
    } finally {
      fs.rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it("throws BootstrapError when installed version falls outside a tilde range", () => {
    const appRoot = tmpApp();
    try {
      writeLock(appRoot, { "@salesforce/retail-react-app": "9.2.0" });
      assert.throws(
        () =>
          checkPinnedDependencies(
            appRoot,
            makeConfig({ "@salesforce/retail-react-app": "~9.1.1" }),
          ),
        (err: unknown) =>
          err instanceof BootstrapError &&
          /retail-react-app/.test(err.message) &&
          /~9\.1\.1/.test(err.message) &&
          /9\.2\.0/.test(err.message),
      );
    } finally {
      fs.rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it("throws when a pinned package is missing from package-lock.json", () => {
    const appRoot = tmpApp();
    try {
      writeLock(appRoot, { "some-other-pkg": "1.0.0" });
      assert.throws(
        () =>
          checkPinnedDependencies(
            appRoot,
            makeConfig({ "@salesforce/retail-react-app": "~9.1.1" }),
          ),
        (err: unknown) =>
          err instanceof BootstrapError && /absent from package-lock/.test(err.message),
      );
    } finally {
      fs.rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it("throws when pins are declared but no lock file exists", () => {
    const appRoot = tmpApp();
    try {
      assert.throws(
        () =>
          checkPinnedDependencies(
            appRoot,
            makeConfig({ "@salesforce/retail-react-app": "~9.1.1" }),
          ),
        (err: unknown) => err instanceof BootstrapError && /package-lock\.json/.test(err.message),
      );
    } finally {
      fs.rmSync(appRoot, { recursive: true, force: true });
    }
  });
});

describe("satisfiesRange (narrow grammar)", () => {
  it("accepts exact matches", () => {
    assert.equal(satisfiesRange("1.2.3", "1.2.3"), true);
    assert.equal(satisfiesRange("1.2.4", "1.2.3"), false);
  });
  it("tilde: allows patch bumps only", () => {
    assert.equal(satisfiesRange("9.1.1", "~9.1.1"), true);
    assert.equal(satisfiesRange("9.1.99", "~9.1.1"), true);
    assert.equal(satisfiesRange("9.2.0", "~9.1.1"), false);
    assert.equal(satisfiesRange("10.1.1", "~9.1.1"), false);
  });
  it("caret: allows minor+patch when major>0", () => {
    assert.equal(satisfiesRange("1.5.2", "^1.2.3"), true);
    assert.equal(satisfiesRange("2.0.0", "^1.2.3"), false);
    assert.equal(satisfiesRange("1.2.2", "^1.2.3"), false);
  });
  it("caret: patch-only when major=0", () => {
    assert.equal(satisfiesRange("0.2.9", "^0.2.3"), true);
    assert.equal(satisfiesRange("0.3.0", "^0.2.3"), false);
  });
  it("wildcard segments", () => {
    assert.equal(satisfiesRange("9.1.1", "9.*"), true);
    assert.equal(satisfiesRange("9.2.0", "9.x"), true);
    assert.equal(satisfiesRange("10.0.0", "9.*"), false);
  });
  it("rejects unsupported grammar", () => {
    assert.throws(() => satisfiesRange("1.2.3", ">=1.2.0"));
    assert.throws(() => satisfiesRange("1.2.3", "1.2.0 || 1.3.0"));
  });
});

describe("computeApiDrift", () => {
  function seed(appRoot: string, pkg: string, snapshotExports: string[], installedSrc: Record<string, string>) {
    const tail = pkg.split("/").pop()!;
    const snapshotDir = path.join(appRoot, ".apm/reference", tail);
    fs.mkdirSync(snapshotDir, { recursive: true });
    fs.writeFileSync(
      path.join(snapshotDir, "api-surface.json"),
      JSON.stringify({ version: "1.0.0", exports: snapshotExports }),
    );
    const pkgRoot = path.join(appRoot, "node_modules", pkg, "app/components");
    fs.mkdirSync(pkgRoot, { recursive: true });
    for (const [rel, src] of Object.entries(installedSrc)) {
      const abs = path.join(pkgRoot, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, src);
    }
    fs.writeFileSync(
      path.join(appRoot, "node_modules", pkg, "package.json"),
      JSON.stringify({ version: "1.1.0" }),
    );
  }

  it("returns null when no reference_dir / pins are configured", () => {
    const appRoot = tmpApp();
    try {
      assert.equal(computeApiDrift(appRoot, makeConfig()), null);
    } finally {
      fs.rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it("returns null when snapshots and installed exports are identical", () => {
    const appRoot = tmpApp();
    try {
      seed(
        appRoot,
        "@acme/kit",
        ["app/components/foo/index:Foo"],
        { "foo/index.jsx": "export function Foo() {}" },
      );
      const result = computeApiDrift(
        appRoot,
        makeConfig({ "@acme/kit": "~1.0.0" }, ".apm/reference"),
      );
      assert.equal(result, null);
    } finally {
      fs.rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it("reports removed exports", () => {
    const appRoot = tmpApp();
    try {
      seed(
        appRoot,
        "@acme/kit",
        ["app/components/foo/index:Foo", "app/components/foo/index:Bar"],
        { "foo/index.jsx": "export function Foo() {}" },
      );
      const result = computeApiDrift(
        appRoot,
        makeConfig({ "@acme/kit": "~1.0.0" }, ".apm/reference"),
      );
      assert.ok(result);
      assert.match(result, /Removed/);
      assert.match(result, /~~app\/components\/foo\/index:Bar~~/);
      assert.doesNotMatch(result, /Added/);
    } finally {
      fs.rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it("reports added exports", () => {
    const appRoot = tmpApp();
    try {
      seed(
        appRoot,
        "@acme/kit",
        ["app/components/foo/index:Foo"],
        { "foo/index.jsx": "export function Foo() {}\nexport const Baz = 1" },
      );
      const result = computeApiDrift(
        appRoot,
        makeConfig({ "@acme/kit": "~1.0.0" }, ".apm/reference"),
      );
      assert.ok(result);
      assert.match(result, /Added/);
      assert.match(result, /app\/components\/foo\/index:Baz/);
    } finally {
      fs.rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it("skips packages that have no snapshot", () => {
    const appRoot = tmpApp();
    try {
      // Only installed — no snapshot file.
      const pkgRoot = path.join(appRoot, "node_modules/@acme/kit/app/components");
      fs.mkdirSync(pkgRoot, { recursive: true });
      fs.writeFileSync(path.join(pkgRoot, "index.jsx"), "export function X() {}");
      fs.writeFileSync(
        path.join(appRoot, "node_modules/@acme/kit/package.json"),
        JSON.stringify({ version: "1.0.0" }),
      );
      const result = computeApiDrift(
        appRoot,
        makeConfig({ "@acme/kit": "~1.0.0" }, ".apm/reference"),
      );
      assert.equal(result, null);
    } finally {
      fs.rmSync(appRoot, { recursive: true, force: true });
    }
  });
});
