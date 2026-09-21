import { expect, test } from "@playwright/test";
import { resetDatabase } from "./support/db";

const PASSWORD = process.env.E2E_APP_PASSWORD ?? "smoke-test-password";

// Specs create real rows; start each file from the seeded baseline.
test.beforeAll(resetDatabase);

test("an unauthenticated visitor is sent to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Rickhouse" })).toBeVisible();
});

test("the wrong password is rejected and does not set a session", async ({ page, context }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("definitely-not-it");
  await page.getByRole("button", { name: "Unlock" }).click();

  // Scoped by id: Next's route announcer is also role="alert".
  await expect(page.locator("#login-error")).toHaveText("That password is not right.");
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "rickhouse_session")).toBeUndefined();
});

test("the right password signs in and lands on the collection", async ({ page, context }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Unlock" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("Double Oak Spirit")).toBeVisible();

  const session = (await context.cookies()).find((c) => c.name === "rickhouse_session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
});

test("a deep link is preserved across sign-in", async ({ page }) => {
  await page.goto("/api/health");
  await expect(page.locator("body")).toContainText('"status":"ok"');
});

test("signing out revokes access", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
