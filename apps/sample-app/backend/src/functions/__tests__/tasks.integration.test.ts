// =============================================================================
// Integration Tests — Kanban Tasks CRUD Against Live Deployed Endpoints
// =============================================================================
// Run with: RUN_INTEGRATION=true INTEGRATION_API_BASE_URL=<url> npm run test:integration
// Requires:
//   - INTEGRATION_API_BASE_URL: e.g. https://func-sample-app-001.azurewebsites.net/api
//   - INTEGRATION_FUNCTION_KEY: Azure Function host key for authLevel:"function"
//   - FUNC_APP_NAME:            Azure Function App name (for az CLI queries)
//   - RESOURCE_GROUP:           Azure Resource Group name
// =============================================================================

import { execSync } from "child_process";

const describeIntegration =
  process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;

const BASE_URL = process.env.INTEGRATION_API_BASE_URL ?? "";
const FUNC_KEY = process.env.INTEGRATION_FUNCTION_KEY ?? "";
const FUNC_APP_NAME = process.env.FUNC_APP_NAME ?? "";
const RESOURCE_GROUP = process.env.RESOURCE_GROUP ?? "";

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
// CRUD Flow — POST, GET, PATCH
// ---------------------------------------------------------------------------

describeIntegration("fn-tasks — CRUD (live)", () => {
  let createdTaskId: string;
  const uniqueTitle = `Integration Test Task ${Date.now()}`;

  it("POST /tasks returns 201 with created task", async () => {
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

  it("GET /tasks returns array that includes the created task", async () => {
    const res = await apiFetch("/tasks");
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(Array.isArray(body)).toBe(true);

    const found = body.find((t: Json) => t.id === createdTaskId);
    expect(found).toBeDefined();
    expect(found.title).toBe(uniqueTitle);
    expect(found.status).toBe("TODO");
  });

  it("PATCH /tasks/{id}/status returns 200 with updated status", async () => {
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

  // --- Validation: 401 unauthenticated rejection ---

  it("GET /tasks returns 401 without function key", async () => {
    const url = `${BASE_URL}/tasks`;
    const res = await fetch(url);
    expect(res.status).toBe(401);
  });

  // --- Validation: 400 error paths ---

  it("POST /tasks returns 400 for empty title", async () => {
    const res = await apiFetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(res.status).toBe(400);

    const body: Json = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
  });

  it("PATCH /tasks/{id}/status returns 400 for invalid status", async () => {
    const res = await apiFetch(`/tasks/${createdTaskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INVALID" }),
    });
    expect(res.status).toBe(400);

    const body: Json = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
  });

  it("PATCH /tasks/{id}/status returns 404 for nonexistent task", async () => {
    const res = await apiFetch("/tasks/00000000-0000-0000-0000-000000000000/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    expect(res.status).toBe(404);

    const body: Json = await res.json();
    expect(body.error).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// MAX_TASKS_PER_WORKSPACE env var validation via az CLI
// ---------------------------------------------------------------------------

describeIntegration("MAX_TASKS_PER_WORKSPACE app setting (az CLI)", () => {
  it("must be set to 500 on the Function App", () => {
    if (!FUNC_APP_NAME || !RESOURCE_GROUP) {
      console.error(
        "FUNC_APP_NAME or RESOURCE_GROUP not set — skipping az CLI check",
      );
      return;
    }

    let settings: Array<{ name: string; value: string }>;
    try {
      const raw = execSync(
        `az functionapp config appsettings list --name ${FUNC_APP_NAME} --resource-group ${RESOURCE_GROUP} -o json`,
        { timeout: 30_000 },
      ).toString();
      settings = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to query az CLI for app settings:", err);
      fail(
        "MAX_TASKS_PER_WORKSPACE is missing. You must update deploy-backend.yml, commit it to the cicd scope, and ensure it deploys.",
      );
      return;
    }

    const setting = settings.find(
      (s) => s.name === "MAX_TASKS_PER_WORKSPACE",
    );

    if (!setting || setting.value !== "500") {
      console.error(
        `MAX_TASKS_PER_WORKSPACE is ${setting?.value ?? "missing"} (expected "500")`,
      );
      fail(
        "MAX_TASKS_PER_WORKSPACE is missing. You must update deploy-backend.yml, commit it to the cicd scope, and ensure it deploys.",
      );
    } else {
      expect(setting.value).toBe("500");
    }
  });
});
