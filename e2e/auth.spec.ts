import { expect, test, type Page } from "@playwright/test";
import { ADMIN, MEMBER, PASSWORD, asFreshClient, fillSignIn, signIn } from "./support/auth";
import { resetDatabase } from "./support/db";

const SESSION_COOKIE = "rickhouse.session_token";

// Specs create real rows; start each file from the seeded baseline.
test.beforeAll(resetDatabase);

test.beforeEach(async ({ page }) => {
  await asFreshClient(page);
});

/** Creates a member from the Users page and returns its temporary password. */
async function createMember(page: Page, username: string): Promise<string> {
  await page.goto("/system/users");
  await page.getByLabel("Name", { exact: true }).fill(`Test ${username}`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(`${username}@example.com`);
  await page.getByRole("button", { name: "Create account" }).click();
  const password = page.getByRole("status").locator("code");
  await expect(password).toBeVisible();
  return (await password.textContent())?.trim() ?? "";
}

test("an unauthenticated visitor is sent to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Rickhouse" })).toBeVisible();
});

test("the wrong password is rejected and does not set a session", async ({ page, context }) => {
  await page.goto("/login");
  await fillSignIn(page, ADMIN.username, "definitely-not-it");

  // Scoped by id: Next's route announcer is also role="alert".
  await expect(page.locator("#login-error")).toHaveText("That username or password is not right.");
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
});

test("the right password signs in and lands on the collection", async ({ page, context }) => {
  await page.goto("/login");
  await fillSignIn(page, ADMIN.username, PASSWORD);

  await expect(page).toHaveURL("/");
  await expect(page.getByText("Double Oak Spirit")).toBeVisible();

  const session = (await context.cookies()).find((c) => c.name === SESSION_COOKIE);
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
});

test("the email address works as well as the username", async ({ page }) => {
  await page.goto("/login");
  await fillSignIn(page, ADMIN.email.toUpperCase(), PASSWORD);
  await expect(page).toHaveURL("/");
});

test("a deep link is preserved across sign-in", async ({ page }) => {
  await page.goto("/bottles?q=oak");
  await expect(page).toHaveURL(/\/login\?next=/);
  await fillSignIn(page, ADMIN.username, PASSWORD);
  await expect(page).toHaveURL("/bottles?q=oak");
});

test("a crafted next= cannot send you off-site after sign-in", async ({ page }) => {
  await page.goto("/login?next=/%5Cexample.com");
  await fillSignIn(page, ADMIN.username, PASSWORD);
  await expect(page).toHaveURL("/");
});

test("signing out revokes access", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("sign-in attempts are rate limited per client", async ({ page }) => {
  await page.goto("/login");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await fillSignIn(page, ADMIN.username, "definitely-not-it");
    await expect(page.locator("#login-error")).toHaveText("That username or password is not right.");
  }
  // Even the right password is turned away until the window passes.
  await fillSignIn(page, ADMIN.username, PASSWORD);
  await expect(page.locator("#login-error")).toHaveText("Too many tries. Give it a minute and try again.");

  // Someone else is unaffected.
  await asFreshClient(page);
  await fillSignIn(page, ADMIN.username, PASSWORD);
  await expect(page).toHaveURL("/");
});

test("members don't see or reach the admin-only sections", async ({ page }) => {
  await signIn(page, MEMBER.username);
  await page.getByRole("button", { name: /Account menu/ }).click();
  await expect(page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Account settings" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);

  for (const path of ["/system/users", "/system/backups"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
  }
});

test("admins reach Users and Backups from the menu under their name", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: /Account menu/ }).click();
  const admin = page.getByRole("navigation", { name: "Admin" });
  await expect(admin.getByRole("link", { name: "Backups" })).toBeVisible();
  await admin.getByRole("link", { name: "Users" }).click();
  await expect(page).toHaveURL("/system/users");
  await expect(page.getByRole("heading", { name: "Users", level: 1 })).toBeVisible();
});

test("the header shows only the first name, and profile edits show up there", async ({ page }) => {
  await signIn(page, MEMBER.username);
  await page.goto("/account");
  await page.getByLabel("Name", { exact: true }).fill("Morgan Member-Smith");
  await page.getByLabel("Username", { exact: true }).fill("morgan");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Account menu/ })).toHaveText("Morgan");

  // The new username signs in; the old one no longer does.
  await page.getByRole("button", { name: "Sign out" }).click();
  await fillSignIn(page, MEMBER.username, PASSWORD);
  await expect(page.locator("#login-error")).toBeVisible();
  await fillSignIn(page, "morgan", PASSWORD);
  await expect(page).toHaveURL("/");

  // Put it back for the tests after this one.
  await page.goto("/account");
  await page.getByLabel("Name", { exact: true }).fill("Member");
  await page.getByLabel("Username", { exact: true }).fill(MEMBER.username);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("a username someone else has is refused", async ({ page }) => {
  await signIn(page, MEMBER.username);
  await page.goto("/account");
  await page.getByLabel("Username", { exact: true }).fill(ADMIN.username);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already uses that username" })).toBeVisible();
});

test("Better Auth's own admin endpoints are closed to the browser", async ({ page }) => {
  await signIn(page);
  const response = await page.request.get("/api/auth/admin/list-users");
  expect(response.status()).toBe(404);
});

test("a new account signs in with its temporary password, then must choose its own", async ({ page, browser }) => {
  await signIn(page);
  const temporary = await createMember(page, "newbie");
  expect(temporary).toMatch(/^\w{6}(-\w{6}){3}$/);

  const other = await browser.newPage();
  await asFreshClient(other);
  await other.goto("/login");
  await fillSignIn(other, "newbie", temporary);
  await expect(other).toHaveURL("/account/setup");

  // Every other page sends them back until they do.
  await other.goto("/bottles");
  await expect(other).toHaveURL("/account/setup");

  await other.getByLabel("New password", { exact: true }).fill("a brand new password");
  await other.getByLabel("Confirm new password").fill("a brand new password");
  await other.getByRole("button", { name: "Save and continue" }).click();
  await expect(other).toHaveURL("/");

  // The temporary password is gone for good.
  await other.getByRole("button", { name: "Sign out" }).click();
  await fillSignIn(other, "newbie", temporary);
  await expect(other.locator("#login-error")).toBeVisible();
  await fillSignIn(other, "newbie", "a brand new password");
  await expect(other).toHaveURL("/");
  await other.close();
});

test("deactivating an account signs it out and shuts the door", async ({ page, browser }) => {
  await signIn(page);
  const temporary = await createMember(page, "leaver");

  const other = await browser.newPage();
  await asFreshClient(other);
  await other.goto("/login");
  await fillSignIn(other, "leaver", temporary);
  await expect(other).toHaveURL("/account/setup");

  const row = page.locator("tr[data-username='leaver']");
  await row.getByRole("button", { name: "Deactivate" }).click();
  await expect(row.getByText("Deactivated")).toBeVisible();

  // Their open session is gone...
  await other.reload();
  await expect(other).toHaveURL(/\/login/);
  // ...and the right password now lands on the cut-off page.
  await fillSignIn(other, "leaver", temporary);
  await expect(other).toHaveURL("/cut-off");
  await expect(other.getByRole("heading", { name: "Cut off." })).toBeVisible();
  await other.close();
});

test("an admin cannot demote, deactivate or delete themselves", async ({ page }) => {
  await signIn(page);
  await page.goto("/system/users");
  const me = page.locator(`tr[data-username='${ADMIN.username}']`);
  await expect(me.getByText("You")).toBeVisible();
  await expect(me.getByRole("button")).toHaveCount(0);
});

test("changing your password keeps you signed in and retires the old one", async ({ page }) => {
  await signIn(page, MEMBER.username);
  await page.goto("/account");
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByLabel("New password", { exact: true }).fill("member's new password");
  await page.getByLabel("Confirm new password").fill("member's new password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();

  await page.goto("/bottles");
  await expect(page).toHaveURL("/bottles");

  await page.getByRole("button", { name: "Sign out" }).click();
  await fillSignIn(page, MEMBER.username, PASSWORD);
  await expect(page.locator("#login-error")).toBeVisible();
});
