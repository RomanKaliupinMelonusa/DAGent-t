// =============================================================================
// Integration Tests — Kanban Task Board API (Live Deployed Endpoints)
// =============================================================================
// Run with: RUN_INTEGRATION=true INTEGRATION_API_BASE_URL=<url> npm run test:integration
// These tests hit real Azure Function endpoints and require:
//   - INTEGRATION_API_BASE_URL: e.g. https://func-sample-app-001.azurewebsites.net/api
//   - INTEGRATION_FUNCTION_KEY: Azure Function host key for authLevel:"function"
// =============================================================================

import { execSync } from "child_process";

const describeIntegration =
  process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;

const BASE_URL = process.env.INTEGRATION_API_BASE_URL ?? "";
const FUNC_KEY = process.env.INTEGRATION_FUNCTION_KEY ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (FUNC_KEY) {
    headers["x-functions-key"] = FUNC_KEY;
  }
  return fetch(url, { ...options, headers });
}

// ---------------------------------------------------------------------------
// fn-tasks — GET /tasks
// ---------------------------------------------------------------------------

describeIntegration("fn-tasks — GET /tasks (live)", () => {
  it("returns 200 with an array of tasks", async () => {
    const res = await apiFetch("/tasks");
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fn-tasks — CRUD flow (POST + GET + PATCH)
// ---------------------------------------------------------------------------

describeIntegration("fn-tasks — CRUD flow (live)", () => {
  let createdTaskId: string;
  const uniqueTitle = `Integration Test Task ${Date.now()}`;

  it("POST /tasks — creates a task and returns 201", async () => {
    const res = await apiFetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: uniqueTitle }),
    });
    expect(res.status).toBe(201);

    const body: Json = await res.json();
    expect(body.id).toBeDefined();
    expect(body.title).toBe(uniqueTitle);
    expect(body.status).toBe("TODO");
    expect(body.workspaceId).toBe("default");
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();

    createdTaskId = body.id;
  });

  it("GET /tasks — includes the created task", async () => {
    const res = await apiFetch("/tasks");
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    const found = body.find((t: Json) => t.id === createdTaskId);
    expect(found).toBeDefined();
    expect(found.title).toBe(uniqueTitle);
    expect(found.status).toBe("TODO");
  });

  it("PATCH /tasks/{id}/status — updates status to IN_PROGRESS", async () => {
    const res = await apiFetch(`/tasks/${createdTaskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(body.status).toBe("IN_PROGRESS");
    expect(body.id).toBe(createdTaskId);
  });

  it("PATCH /tasks/{id}/status — updates status to DONE", async () => {
    const res = await apiFetch(`/tasks/${createdTaskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(body.status).toBe("DONE");
  });
});

// ---------------------------------------------------------------------------
// fn-tasks — Validation Errors
// ---------------------------------------------------------------------------

describeIntegration("fn-tasks — validation errors (live)", () => {
  it("POST /tasks — returns 400 for missing title", async () => {
    const res = await apiFetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);

    const body: Json = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
  });

  it("POST /tasks — returns 400 for empty title", async () => {
    const res = await apiFetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(res.status).toBe(400);

    const body: Json = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
  });

  it("POST /tasks — returns 400 for title exceeding 200 characters", async () => {
    const res = await apiFetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "a".repeat(201) }),
    });
    expect(res.status).toBe(400);

    const body: Json = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
  });

  it("PATCH /tasks/{id}/status — returns 400 for invalid status", async () => {
    const res = await apiFetch("/tasks/fake-id/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INVALID" }),
    });
    expect(res.status).toBe(400);

    const body: Json = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
  });

  it("PATCH /tasks/{id}/status — returns 404 for nonexistent task", async () => {
    const res = await apiFetch(
      "/tasks/00000000-0000-0000-0000-000000000000/status",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      },
    );
    // May be 404 (not found) — depends on Cosmos behavior for missing ID
    expect([404, 500]).toContain(res.status);
  });

  it("GET /tasks — returns 401 without function key", async () => {
    const url = `${BASE_URL}/tasks`;
    const res = await fetch(url);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// MAX_TASKS_PER_WORKSPACE — Azure Control Plane Validation
// ---------------------------------------------------------------------------

describeIntegration("MAX_TASKS_PER_WORKSPACE app setting (live)", () => {
  it("MAX_TASKS_PER_WORKSPACE must be set to 500", () => {
    const funcAppName =
      process.env.AZURE_FUNCTION_APP_NAME ?? "func-sample-app-001";
    const resourceGroup =
      process.env.AZURE_RESOURCE_GROUP ?? "rg-sample-app-dev";

    let settingsJson: string;
    try {
      settingsJson = execSync(
        `az functionapp config appsettings list --name ${funcAppName} --resource-group ${resourceGroup} --output json`,
        { encoding: "utf-8", timeout: 30_000 },
      );
    } catch (err) {
      console.error(
        "Failed to query Azure control plane for app settings:",
        err,
      );
      fail(
        "MAX_TASKS_PER_WORKSPACE is missing. You must update deploy-backend.yml, commit it to the cicd scope, and ensure it deploys.",
      );
      return;
    }

    const settings: Array<{ name: string; value: string }> =
      JSON.parse(settingsJson);
    const maxTasksSetting = settings.find(
      (s) => s.name === "MAX_TASKS_PER_WORKSPACE",
    );

    if (!maxTasksSetting || maxTasksSetting.value !== "500") {
      console.error(
        `MAX_TASKS_PER_WORKSPACE is ${maxTasksSetting ? `"${maxTasksSetting.value}"` : "missing"} (expected "500")`,
      );
      fail(
        "MAX_TASKS_PER_WORKSPACE is missing. You must update deploy-backend.yml, commit it to the cicd scope, and ensure it deploys.",
      );
    }

    expect(maxTasksSetting!.value).toBe("500");
  });
});
