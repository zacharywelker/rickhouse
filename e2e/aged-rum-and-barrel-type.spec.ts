import { expect, test, type Page } from "@playwright/test";
import { resetDatabase } from "./support/db";
import { signIn } from "./support/auth";
import { openNewLabelForm } from "./support/new-label";
import { assertThrowawayDatabase } from "./support/tournament-field";

/** Phase 4A wave C: the rum Aged toggle, and the Barrel type that replaces Finishes for some spirits. */

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

async function choose(page: Page, category: string) {
  await openNewLabelForm(page);
  await page.getByRole("combobox", { name: "Category" }).click();
  await page.locator("[cmdk-input]").fill(category);
  await page.locator('[cmdk-item]:not([data-value="__create__"])').filter({ has: page.getByText(category, { exact: true }) }).first().click();
}

test("a rum has no age until it is marked aged", async ({ page }) => {
  await choose(page, "Rum");
  await expect(page.getByLabel("Aged")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Age Statement" })).toHaveCount(0);
  await expect(page.getByLabel("Cask Strength")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Finishes" })).toHaveCount(0);
  await page.getByLabel("Aged").check();
  await expect(page.getByRole("textbox", { name: "Age Statement" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Finishes" })).toBeVisible();
});

test("tequila has a Barrel Type where bourbon has Finishes", async ({ page }) => {
  await choose(page, "Tequila");
  await expect(page.getByRole("group", { name: "Barrel Type" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Finishes" })).toHaveCount(0);
  await choose(page, "Bourbon");
  await expect(page.getByRole("group", { name: "Finishes" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Barrel Type" })).toHaveCount(0);
});

test("Corn Whiskey offers Uncharred and Used, takes one, and then stops offering", async ({ page }) => {
  await choose(page, "Corn Whiskey");
  const barrel = page.getByRole("group", { name: "Barrel Type" });
  await expect(barrel).toBeVisible();
  await barrel.getByRole("button", { name: "Uncharred", exact: true }).click();
  await expect(barrel.getByText("Uncharred", { exact: true })).toBeVisible();
  await expect(barrel.getByRole("button", { name: "Used", exact: true })).toHaveCount(0);
  await expect(barrel.getByRole("combobox")).toHaveCount(0);
});
