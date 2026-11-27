import { expect, test, type Page } from "@playwright/test";
import { resetDatabase } from "./support/db";
import { signIn } from "./support/auth";
import { openNewLabelForm } from "./support/new-label";
import { assertThrowawayDatabase } from "./support/tournament-field";

/** Phase 4A wave B: the retired fields are gone from the label form, and every spirit has the Still field. */

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

test("tequila no longer offers Still Proof", async ({ page }) => {
  await choose(page, "Tequila");
  await expect(page.getByLabel("Still Proof")).toHaveCount(0);
  await expect(page.getByLabel("Cask Strength")).toHaveCount(0);
});

test("amaro and liqueur no longer ask for Country and Region", async ({ page }) => {
  for (const category of ["Amaro", "Herbal Liqueur"]) {
    await choose(page, category);
    await expect(page.getByLabel("Region", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Country", { exact: true })).toHaveCount(0);
  }
});

test("every spirit has the Still Type field, and Blend is one of its choices", async ({ page }) => {
  for (const category of ["Bourbon", "Tequila", "Cognac", "Gin", "Vodka", "Amaro"]) {
    await choose(page, category);
    const still = page.getByLabel("Still Type");
    await expect(still, category).toBeVisible();
  }
  const options = await page.getByLabel("Still Type").locator("option").allInnerTexts();
  expect(options).toEqual(["Unknown", "Pot", "Column", "Blend", "Coffey", "3-chamber", "Clay pot"]);
});
