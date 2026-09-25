import { expect, type Page } from "@playwright/test";

/**
 * Accounts `npm run db:reset` creates (scripts/reset.ts), both with this
 * password and no pending password change.
 */
export const PASSWORD = process.env.E2E_PASSWORD ?? "smoke-test-password";
export const ADMIN = { username: "admin", email: "admin@example.com" };
export const MEMBER = { username: "member", email: "member@example.com" };

/**
 * Sign-in is rate limited per client IP, and the suite signs in far more
 * often than a person would. Each page poses as its own client behind a
 * proxy — the app takes a lone X-Forwarded-For entry as the client — so
 * specs don't share a bucket. auth.spec.ts tests the limit itself.
 */
export async function asFreshClient(page: Page): Promise<void> {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.18.${octet()}.${octet()}` });
}

export async function fillSignIn(page: Page, login: string, password: string): Promise<void> {
  await page.getByLabel("Username or email").fill(login);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock" }).click();
}

export async function signIn(page: Page, username = ADMIN.username, password = PASSWORD): Promise<void> {
  await asFreshClient(page);
  await page.goto("/login");
  await fillSignIn(page, username, password);
  await expect(page).toHaveURL("/");
}
