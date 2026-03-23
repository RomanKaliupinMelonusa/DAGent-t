// =============================================================================
// E2E — Demo Login Flow
// =============================================================================

import { test, expect } from "@playwright/test";

const DEMO_USER = process.env.DEMO_USER ?? "demo";
const DEMO_PASS = process.env.DEMO_PASS ?? "demopass";

test.describe("Demo Login", () => {
  test("shows login form when unauthenticated", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("demo-username")).toBeVisible();
    await expect(page.getByTestId("demo-password")).toBeVisible();
    await expect(page.getByTestId("demo-login-submit")).toBeVisible();
  });

  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("demo-username").fill("wrong");
    await page.getByTestId("demo-password").fill("wrong");
    await page.getByTestId("demo-login-submit").click();

    await expect(page.getByTestId("demo-login-error")).toBeVisible();
  });

  test("logs in with valid credentials and shows user name", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("demo-username").fill(DEMO_USER);
    await page.getByTestId("demo-password").fill(DEMO_PASS);
    await page.getByTestId("demo-login-submit").click();

    await expect(page.getByTestId("user-display-name")).toBeVisible();
    await expect(page.getByTestId("user-display-name")).toHaveText("Demo User");
  });

  test("sign out returns to login form", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("demo-username").fill(DEMO_USER);
    await page.getByTestId("demo-password").fill(DEMO_PASS);
    await page.getByTestId("demo-login-submit").click();

    await expect(page.getByTestId("sign-out-button")).toBeVisible();
    await page.getByTestId("sign-out-button").click();

    await expect(page.getByTestId("demo-username")).toBeVisible();
  });
});
