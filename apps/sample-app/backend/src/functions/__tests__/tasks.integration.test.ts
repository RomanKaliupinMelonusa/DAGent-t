// =============================================================================
// Integration Tests — Tasks API (Kanban Task Board)
// =============================================================================
// Run with: RUN_INTEGRATION=true INTEGRATION_API_BASE_URL=<url> npm run test:integration
// These tests hit real Azure Function endpoints and require:
//   - INTEGRATION_API_BASE_URL: e.g. https://func-sample-app-001.azurewebsites.net/api
//   - INTEGRATION_FUNCTION_KEY: Azure Function host key for authLevel:"function"
//   - FUNC_APP_NAME: Azure Function App name (for az CLI settings query)
//   - RESOURCE_GROUP: Azure Resource Group (for az CLI settings query)
// =============================================================================

import { execSync } from "child_process";

const describeIntegration =
  process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;

const BASE_URL = process.env.INTEGRATION_API_BASE_URL ?? "";
const FUNC_KEY = process.env.INTEGRATION_FUNCTION_KEY ?? "";
const FUNC_APP_NAME =
  process.env.FUNC_APP_NAME ?? "func-sample-app-001";
const RESOURCE_GROUP =
  process.env.RESOURCE_GROUP ?? "rg-sample-app-dev";

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
// CRUD Flow — Tasks
// ---------------------------------------------------------------------------

describeIntegration("fn-tasks (live)", () => {
  const testTitle = `Integration Test Task ${Date.now()}`;
  let createdTaskId: string;

  it("POST /tasks — creates a new task (201)", async () => {
    const res = await apiFetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: testTitle }),
    });
    expect(res.status).toBe(201);

    const body: Json = await res.json();
    expect(body.id).toBeDefined();
    expect(body.title).toBe(testTitle);
    expect(body.status).toBe("TODO");
    expect(body.workspaceId).toBe("default");
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();

    createdTaskId = body.id;
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

  it("GET /tasks — includes the created task", async () => {
    const res = await apiFetch("/tasks");
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(Array.isArray(body)).toBe(true);

    const found = body.find((t: Json) => t.id === createdTaskId);
    expect(found).toBeDefined();
    expect(found.title).toBe(testTitle);
    expect(found.status).toBe("TODO");
  });

  it("PATCH /tasks/{id}/status — updates task status (200)", async () => {
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

  it("PATCH /tasks/{nonexistent}/status — returns 404", async () => {
    const res = await apiFetch(
      "/tasks/00000000-0000-0000-0000-000000000000/status",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      },
    );
    expect(res.status).toBe(404);

    const body: Json = await res.json();
    expect(body.error).toBe("NOT_FOUND");
  });

  it("PATCH /tasks/{id}/status — returns 400 for invalid status", async () => {
    const res = await apiFetch(`/tasks/${createdTaskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INVALID" }),
    });
    expect(res.status).toBe(400);

    const body: Json = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
  });
});

// ---------------------------------------------------------------------------
// MAX_TASKS_PER_WORKSPACE — Control Plane Validation
// ---------------------------------------------------------------------------

describeIntegration("MAX_TASKS_PER_WORKSPACE setting (az CLI)", () => {
  it("MAX_TASKS_PER_WORKSPACE is set to 500 on the Function App", () => {
    let settings: Json[];
    try {
      const output = execSync(
        `az functionapp config appsettings list --name ${FUNC_APP_NAME} --resource-group ${RESOURCE_GROUP} -o json`,
        { encoding: "utf-8", timeout: 30000 },
      );
      settings = JSON.parse(output);
    } catch (err) {
      console.error("Failed to query Azure app settings via az CLI:", err);
      fail(
        "MAX_TASKS_PER_WORKSPACE is missing. You must update deploy-backend.yml, commit it to the cicd scope, and ensure it deploys.",
      );
      return; // unreachable, but satisfies TS
    }

    const setting = settings.find(
      (s: Json) => s.name === "MAX_TASKS_PER_WORKSPACE",
    );

    if (!setting || setting.value !== "500") {
      console.error(
        `MAX_TASKS_PER_WORKSPACE is ${setting ? `"${setting.value}"` : "missing"} (expected "500")`,
      );
      fail(
        "MAX_TASKS_PER_WORKSPACE is missing. You must update deploy-backend.yml, commit it to the cicd scope, and ensure it deploys.",
      );
    }

    expect(setting.value).toBe("500");
  });
});
