/**
 * src/temporal/__tests__/skeleton.integration.test.ts
 *
 * End-to-end smoke test for the Session 2 skeleton pipeline workflow.
 * Spawns the compiled worker against a real Temporal cluster, runs the
 * `run-skeleton` client, and asserts the printed result captures the
 * expected DAG dispatch order.
 *
 * Pattern is identical to `hello.integration.test.ts`:
 *   - skip (NOT fail) when no cluster is reachable, so `npm test` stays
 *     usable on a laptop without docker;
 *   - spawn the worker from compiled JS (TestWorkflowEnvironment is
 *     broken in this workspace — see Session 1 memory).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(__dirname, "../../..");
const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const taskQueue = `dagent-it-skeleton-${Date.now()}`;

async function isReachable(addr: string): Promise<boolean> {
  const [host, portStr] = addr.split(":");
  const port = Number(portStr);
  return await new Promise<boolean>((res) => {
    const sock = connect({ host, port, timeout: 1500 });
    sock.once("connect", () => {
      sock.end();
      res(true);
    });
    sock.once("error", () => res(false));
    sock.once("timeout", () => {
      sock.destroy();
      res(false);
    });
  });
}

let worker: ChildProcessWithoutNullStreams | null = null;

describe("skeletonPipeline workflow — integration", () => {
  let clusterReachable = false;

  beforeAll(async () => {
    clusterReachable = await isReachable(address);
    if (!clusterReachable) {
      console.warn(
        `[skeleton.integration] Temporal cluster not reachable at ${address}; suite will skip.`,
      );
      return;
    }
    worker = spawn(
      "node",
      ["dist/temporal/worker/main.js"],
      {
        cwd: repoDir,
        env: { ...process.env, TEMPORAL_ADDRESS: address, TEMPORAL_TASK_QUEUE: taskQueue },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    await new Promise<void>((res, rej) => {
      const timer = setTimeout(() => rej(new Error("worker did not start in 30s")), 30_000);
      worker!.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        process.stdout.write(`[worker] ${text}`);
        if (text.includes("connected")) {
          clearTimeout(timer);
          res();
        }
      });
      worker!.stderr.on("data", (chunk: Buffer) => process.stderr.write(`[worker] ${chunk}`));
      worker!.once("exit", (code) => {
        clearTimeout(timer);
        rej(new Error(`worker exited early code=${code}`));
      });
    });
  });

  afterAll(async () => {
    if (worker && !worker.killed) {
      worker.kill("SIGTERM");
      await new Promise<void>((res) => worker!.once("exit", () => res()));
    }
  });

  it("walks the DAG to completion", async () => {
    if (!clusterReachable) {
      console.warn("[skeleton.integration] skipping: no Temporal cluster.");
      return;
    }
    const out = await new Promise<string>((res, rej) => {
      const proc = spawn(
        "node",
        ["dist/temporal/client/run-skeleton.js"],
        {
          cwd: repoDir,
          env: { ...process.env, TEMPORAL_ADDRESS: address, TEMPORAL_TASK_QUEUE: taskQueue },
        },
      );
      let buf = "";
      proc.stdout.on("data", (c) => (buf += c.toString()));
      proc.stderr.on("data", (c) => process.stderr.write(`[client] ${c}`));
      proc.once("exit", (code) =>
        code === 0 ? res(buf) : rej(new Error(`client exited code=${code}\n${buf}`)),
      );
    });
    // Result must indicate completion of all 4 fixture nodes.
    expect(out).toContain('"finalScheduleKind":"complete"');
    expect(out).toContain('"totalItems":4');
    // A must dispatch first; D must be last (depends on B & C).
    const match = out.match(/"completed":\[([^\]]+)\]/);
    expect(match, "completed array must be present").not.toBeNull();
    const completed = JSON.parse(`[${match![1]!}]`) as string[];
    expect(completed).toHaveLength(4);
    expect(completed[0]).toBe("A");
    expect(completed[3]).toBe("D");
  });
});
