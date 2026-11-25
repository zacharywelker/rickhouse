import { expect, test, type Page } from "@playwright/test";
import { resetDatabase } from "./support/db";
import { signIn } from "./support/auth";
import { openNewLabelForm } from "./support/new-label";
import { assertThrowawayDatabase } from "./support/tournament-field";

/** The label form's rules by kind (phase 4A): what each category shows, as the field matrix says. */

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

test("Scotch shows Cooperage and not Entry Proof", async ({ page }) => {
  await choose(page, "Single Malt Scotch Whisky");
  await expect(page.getByText("Cooperage", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Entry Proof")).toHaveCount(0);
});

test("Peat shows for American Single Malt and Japanese whisky, not for Bourbon", async ({ page }) => {
  await choose(page, "American Single Malt");
  await expect(page.getByLabel("Peat")).toBeVisible();
  await choose(page, "Japanese Whisky");
  await expect(page.getByLabel("Peat")).toBeVisible();
  await choose(page, "Bourbon");
  await expect(page.getByLabel("Peat")).toHaveCount(0);
});

test("Cask Strength is not offered for tequila or gin, and is for bourbon", async ({ page }) => {
  await choose(page, "Tequila");
  await expect(page.getByLabel("Cask Strength")).toHaveCount(0);
  await choose(page, "Bourbon");
  await expect(page.getByLabel("Cask Strength")).toBeVisible();
});

test("NAS is not offered for Cognac, and is for Pisco", async ({ page }) => {
  await choose(page, "Cognac");
  await expect(page.getByLabel("NAS")).toHaveCount(0);
  await choose(page, "Pisco");
  await expect(page.getByLabel("NAS")).toBeVisible();
});
