import { describe, it, expect } from "vitest";
import { renderTransMd } from "../render-trans.js";
import type { StateSnapshot, SummarySnapshot } from "../../workflow/queries.js";

const baseState: StateSnapshot = {
  feature: "demo-feature",
  workflowName: "storefront",
  started: "2026-04-30T10:00:00Z",
  items: [
    { key: "create-branch", label: "Create branch", agent: null, status: "done" },
    { key: "spec-compiler", label: "Compile spec", agent: "spec-compiler", status: "done" },
    { key: "frontend-developer", label: "Frontend dev", agent: "frontend-developer", status: "in-progress" },
    { key: "backend-developer", label: "Backend dev", agent: "backend-developer", status: "failed" },
    { key: "live-ui", label: "Live UI", agent: null, status: "pending" },
    { key: "publish-pr", label: "Publish PR", agent: null, status: "pending" },
  ],
  errorLog: [
    {
      itemKey: "backend-developer",
      message: "TypeError: cannot read properties of undefined (reading 'foo')",
      timestamp: "2026-04-30T10:05:00Z",
    },
  ],
  held: false,
  cancelled: false,
  cancelReason: null,
};

describe("renderTransMd", () => {
  it("renders header, status, totals and items", () => {
    const md = renderTransMd(baseState, { nowIso: "2026-04-30T10:10:00Z" });
    expect(md).toContain("# Pipeline Transitions — demo-feature");
    expect(md).toContain("Rendered on demand from Temporal workflow state at 2026-04-30T10:10:00Z");
    expect(md).toContain("Workflow: `storefront`");
    expect(md).toContain("## Status: running");
    expect(md).toContain("| Total items | 6 |");
    expect(md).toContain("| Done | 2 |");
    expect(md).toContain("| In-progress | 1 |");
    expect(md).toContain("| Failed | 1 |");
    expect(md).toContain("| Pending | 2 |");
    expect(md).toContain("- ⟳ `frontend-developer` — Frontend dev · agent=`frontend-developer` (in-progress)");
    expect(md).toContain("- ✗ `backend-developer` — Backend dev · agent=`backend-developer` (failed)");
  });

  it("flags held + cancelled state in the header banner", () => {
    const md = renderTransMd(
      { ...baseState, held: true, cancelled: true, cancelReason: "operator-cancelled" },
      { nowIso: "2026-04-30T10:10:00Z" },
    );
    expect(md).toContain("## Status: cancelled — operator-cancelled, held");
  });

  it("includes summary banner + approvals when summary provided", () => {
    const summary: SummarySnapshot = {
      slug: "demo-feature",
      workflowName: "storefront",
      started: baseState.started,
      status: "running",
      batchNumber: 4,
      totals: {
        total: 6, done: 2, pending: 2, inProgress: 1, failed: 1, na: 0, dormant: 0,
        held: false, cancelled: false,
      },
      pendingApprovals: 2,
      lastError: null,
    };
    const md = renderTransMd(baseState, { nowIso: "2026-04-30T10:10:00Z", summary });
    expect(md).toContain("## Status: `running` (batch 4)");
    expect(md).toContain("| Pending approvals | 2 |");
  });

  it("renders error log with truncation", () => {
    const longMsg = "x".repeat(500);
    const md = renderTransMd(
      {
        ...baseState,
        errorLog: [
          { itemKey: "backend-developer", message: longMsg, timestamp: "2026-04-30T10:05:00Z" },
        ],
      },
      { nowIso: "2026-04-30T10:10:00Z" },
    );
    expect(md).toContain("## Errors");
    expect(md).toContain("- `backend-developer` @ 2026-04-30T10:05:00Z");
    expect(md).toContain("…"); // truncation marker
    // Long message is reduced to ≤ 240 chars + ellipsis
    const errorLine = md.split("\n").find((l) => l.includes("xxxx"))!;
    expect(errorLine.length).toBeLessThan(260);
  });

  it("omits Errors section when errorLog is empty", () => {
    const md = renderTransMd(
      { ...baseState, errorLog: [] },
      { nowIso: "2026-04-30T10:10:00Z" },
    );
    expect(md).not.toContain("## Errors");
  });
});
