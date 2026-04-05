// =============================================================================
// Integration Tests — Kanban Task Board (fn-tasks) Against Live Endpoints
// =============================================================================
// Run with: RUN_INTEGRATION=true INTEGRATION_API_BASE_URL=<url> npm run test:integration
// These tests hit real Azure Function endpoints and require:
//   - INTEGRATION_API_BASE_URL: e.g. https://func-sample-app-001.azurewebsites.net/api
//   - INTEGRATION_FUNCTION_KEY: Azure Function host key for authLevel:"function"
//
// Also validates CI/CD configuration:
//   - MAX_TASKS_PER_WORKSPACE app setting via az CLI control-plane query
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
// CRUD Flow — POST → GET → PATCH
// ---------------------------------------------------------------------------

describeIntegration("fn-tasks (live)", () => {
  let createdTaskId: string;
  const uniqueTitle = `Integration Test Task ${Date.now()}`;

  it("POST /tasks → 201 creates a task", async () => {
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

  it("GET /tasks → 200 includes the created task", async () => {
    const res = await apiFetch("/tasks");
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(Array.isArray(body)).toBe(true);

    const found = body.find((t: Json) => t.id === createdTaskId);
    expect(found).toBeDefined();
    expect(found.title).toBe(uniqueTitle);
    expect(found.status).toBe("TODO");
  });

  it("PATCH /tasks/{id}/status → 200 updates status", async () => {
    const res = await apiFetch(`/tasks/${createdTaskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(body.id).toBe(createdTaskId);
    expect(body.status).toBe("IN_PROGRESS");
    expect(body.updatedAt).toBeDefined();
  });

  it("POST /tasks → 400 rejects invalid body", async () => {
    const res = await apiFetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);

    const body: Json = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
  });

  it("PATCH /tasks/nonexistent-id/status → 404 for missing task", async () => {
    const res = await apiFetch("/tasks/nonexistent-id-12345/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    expect(res.status).toBe(404);

    const body: Json = await res.json();
    expect(body.error).toBe("NOT_FOUND");
  });

  it("PATCH /tasks/{id}/status → 400 rejects invalid status", async () => {
    const res = await apiFetch(`/tasks/${createdTaskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INVALID" }),
    });
    expect(res.status).toBe(400);

    const body: Json = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
  });

  it("GET /tasks → 401 without function key", async () => {
    const url = `${BASE_URL}/tasks`;
    const res = await fetch(url);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// CI/CD Configuration Validation — MAX_TASKS_PER_WORKSPACE
// ---------------------------------------------------------------------------

describeIntegration("CI/CD configuration (live)", () => {
  const FUNC_APP_NAME =
    process.env.FUNC_APP_NAME ?? "func-sample-app-001";
  const RESOURCE_GROUP =
    process.env.RESOURCE_GROUP ?? "rg-sample-app-dev";

  it("MAX_TASKS_PER_WORKSPACE is set to 500 on the Function App", () => {
    let settingsJson: string;
    try {
      settingsJson = execSync(
        `az functionapp config appsettings list --name ${FUNC_APP_NAME} --resource-group ${RESOURCE_GROUP} --output json`,
        { encoding: "utf-8", timeout: 30_000 },
      );
    } catch (err) {
      console.error(
        "Failed to query Function App settings via az CLI:",
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
        `MAX_TASKS_PER_WORKSPACE setting: ${JSON.stringify(maxTasksSetting)}`,
      );
      fail(
        "MAX_TASKS_PER_WORKSPACE is missing. You must update deploy-backend.yml, commit it to the cicd scope, and ensure it deploys.",
      );
    }

    expect(maxTasksSetting!.value).toBe("500");
  });
});
