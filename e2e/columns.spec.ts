import { expect, test, type Page } from "@playwright/test";
import { MEMBER, signIn } from "./support/auth";
import { resetDatabase } from "./support/db";

const stamp = () => Math.random().toString(36).slice(2, 8);

async function noSidewaysPageScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

// Specs create real rows; start each file from the seeded baseline.
test.beforeAll(resetDatabase);

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("the labels table shows six columns by default and can show any other field", async ({ page }) => {
  await page.goto("/expressions");
  for (const name of [/Brand/, /Label/, /Category/, /Proof/, /MSRP/, /Bottles/]) {
    await expect(page.getByRole("columnheader", { name })).toBeVisible();
  }
  await expect(page.getByRole("columnheader", { name: /UPC/ })).toHaveCount(0);

  await page.getByRole("button", { name: /Columns/ }).click();
  await page.getByRole("checkbox", { name: "Distilleries", exact: true }).click();
  await page.getByRole("checkbox", { name: "MSRP", exact: true }).click();
  await page.keyboard.press("Escape");

  // The choice is part of the view, so it lives in the URL like sorting does.
  await expect(page).toHaveURL(/cols=/);
  await expect(page.getByRole("columnheader", { name: "Distilleries" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Bardstown Bourbon Company/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /MSRP/ })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("columnheader", { name: "Distilleries" })).toBeVisible();

  await page.getByRole("button", { name: /Columns/ }).click();
  await expect(page.getByRole("checkbox", { name: "Label", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Defaults" }).click();
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/cols=/);
  await expect(page.getByRole("columnheader", { name: /MSRP/ })).toBeVisible();
});

test("the bulk editor and the labels table only ever see your own collection", async ({ browser }) => {
  const brand = `Member Brand ${stamp()}`;
  const member = await browser.newPage();
  await signIn(member, MEMBER.username);
  await member.goto("/bulk-editor");
  const sheet = member.getByRole("grid", { name: "Bulk editor" });
  await expect(sheet).toBeVisible();
  await member.evaluate(() => window.localStorage.removeItem("bulk-editor:view"));
  await member.getByRole("group", { name: "What the sheet shows" }).getByRole("button", { name: "Bottles", exact: true }).click(); // labels
  const first = sheet.locator('td[data-r="0"][data-c="0"]');
  await expect(async () => {
    await first.click();
    await expect(first).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();

  // The admin's brand is not offered; the member makes their own, deliberately, with Create.
  await member.keyboard.type("Pursuit");
  await expect(member.getByRole("listbox").getByRole("option", { name: /Pursuit Spirits/ })).toHaveCount(0);
  await member.keyboard.press("Control+A");
  await member.keyboard.type(brand);
  await member.keyboard.press("Enter");
  // Categories are shared; label names only have to be unique per account.
  await member.keyboard.type("Double Oak Spirit");
  await member.keyboard.press("Enter");
  await member.keyboard.type("Bourbon");
  await member.keyboard.press("Enter");
  await member.getByRole("heading", { name: "Bulk editor" }).click(); // leaving the finished row saves it
  await expect(member.getByRole("status")).toHaveCount(0, { timeout: 10_000 });
  await member.waitForTimeout(800);

  await member.goto("/expressions?cols=brand,name,distilleries");
  await expect(member.getByText("1 label", { exact: true })).toBeVisible();
  await expect(member.getByRole("cell", { name: brand, exact: true })).toBeVisible();
  await expect(member.getByRole("cell", { name: /Bardstown/ })).toHaveCount(0);

  const admin = await browser.newPage();
  await signIn(admin);
  await admin.goto("/expressions?cols=brand,name");
  await expect(admin.getByRole("cell", { name: "Pursuit Spirits" }).first()).toBeVisible();
  await expect(admin.getByRole("cell", { name: brand })).toHaveCount(0);
  await admin.goto("/bulk-editor");
  await expect(admin.getByRole("grid", { name: "Bulk editor" })).toBeVisible();
  await expect(admin.getByText(brand)).toHaveCount(0);
});

test("wide grids scroll inside themselves, not the page", async ({ page }) => {
  await page.goto("/bulk-editor");
  await expect(page.getByRole("button", { name: /Fields/ })).toBeVisible();
  await noSidewaysPageScroll(page);

  await page.goto("/expressions");
  await page.getByRole("button", { name: /Columns/ }).click();
  await page.getByRole("button", { name: "Show all" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Finishes" })).toBeVisible();
  await noSidewaysPageScroll(page);
});

test("the old Bulk add addresses go to the bulk editor", async ({ page }) => {
  for (const url of ["/expressions/bulk", "/bottles/bulk"]) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/bulk-editor$/);
    await expect(page.getByRole("grid", { name: "Bulk editor" })).toBeVisible();
  }
});

test("the tables are for looking: no inline edit, and one way to the bulk editor", async ({ page }) => {
  for (const url of ["/expressions", "/bottles"]) {
    await page.goto(url);
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Bulk add" })).toHaveCount(0);
  }
  await page.goto("/expressions");
  await page.getByRole("link", { name: "Bulk editor" }).click();
  await expect(page).toHaveURL(/\/bulk-editor$/);
});
