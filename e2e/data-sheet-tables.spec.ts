import { expect, test, type Page } from "@playwright/test";
import { resetDatabase } from "./support/db";
import { signIn } from "./support/auth";
import { assertThrowawayDatabase } from "./support/tournament-field";

/** The data-sheet look (phase 4C): distilleries, mashbills and finishes are tables with dashed add bars, and each distillery row carries a share and a Stated / Inferred source. */

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

async function pick(page: Page, comboboxLabel: string, search: string, optionLabel?: string) {
  const target = optionLabel ?? search;
  await page.getByRole("combobox", { name: comboboxLabel }).click();
  await page.locator("[cmdk-input]").fill(search);
  await page.locator('[cmdk-item]:not([data-value="__create__"])').filter({ has: page.getByText(target, { exact: true }) }).first().click();
}

async function openNewForm(page: Page) {
  await page.goto("/expressions/new?look=new");
  await page.getByRole("option", { name: "New label", exact: true }).click();
  await expect(page.getByLabel("Label Name")).toBeVisible();
}

test("Distilled by is a table with shares, a total and a Stated / Inferred source", async ({ page }) => {
  await openNewForm(page);
  await pick(page, "Category", "Bourbon");
  await pick(page, "Add distilleries", "Bardstown", "Bardstown Bourbon Company");
  await pick(page, "Add distilleries", "Tennessee", "Tennessee Distilling Ltd.");

  await expect(page.getByRole("columnheader", { name: /^distillery$/i })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /^share$/i })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /^source$/i })).toBeVisible();

  await page.getByLabel("Share of Bardstown Bourbon Company", { exact: true }).fill("60");
  await page.getByLabel("Share of Tennessee Distilling Ltd.", { exact: true }).fill("40");
  await expect(page.getByText("100% ✓", { exact: true })).toBeVisible();

  await page.getByLabel("Share of Tennessee Distilling Ltd.", { exact: true }).fill("30");
  await expect(page.getByText("90%", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("100% ✓", { exact: true })).toHaveCount(0);

  const source = page.getByRole("radiogroup", { name: "Source of Tennessee Distilling Ltd." });
  await source.getByRole("radio", { name: "Inferred", exact: true }).click();
  await expect(source.getByRole("radio", { name: "Inferred", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(source.getByRole("radio", { name: "Stated", exact: true })).toHaveAttribute("aria-checked", "false");
});

test("or not disclosed opens the place form and closing it clears it", async ({ page }) => {
  await openNewForm(page);
  await pick(page, "Category", "Bourbon");

  const toggle = page.getByRole("button", { name: "or not disclosed (pick the place)", exact: true });
  await toggle.click();
  await expect(page.getByText("Country", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "or not disclosed (pick the place)", exact: true }).click();
  await expect(page.getByText("Country", { exact: true })).toHaveCount(0);
});

test("a label's distilleries and shares survive a save and open the same in both looks", async ({ page }) => {
  const name = `Sheet Tables ${Date.now()}`;
  await openNewForm(page);
  await pick(page, "Category", "Bourbon");
  await pick(page, "Brand", "Pursuit Spirits");
  await page.getByLabel("Label Name").fill(name);
  await pick(page, "Add distilleries", "Bardstown", "Bardstown Bourbon Company");
  await pick(page, "Add distilleries", "Tennessee", "Tennessee Distilling Ltd.");
  await page.getByLabel("Share of Bardstown Bourbon Company", { exact: true }).fill("60");
  await page.getByLabel("Share of Tennessee Distilling Ltd.", { exact: true }).fill("40");
  await page.getByRole("button", { name: "Create Label", exact: true }).click();
  await expect(page).toHaveURL(/\/expressions\/\d+$/);
  const url = page.url();

  for (const look of ["new", "old"] as const) {
    await page.goto(`${url}/edit?look=${look}`);
    const inputs = page.locator('input[id^="distilleryLinks-amount-"]');
    await expect(inputs.nth(0)).toHaveValue("60");
    await expect(inputs.nth(1)).toHaveValue("40");
  }
});

test("Mashbill is a table with a Made by column", async ({ page }) => {
  await openNewForm(page);
  await pick(page, "Category", "Bourbon");

  await page.getByRole("combobox", { name: "Add mashbills" }).click();
  await page.locator('[cmdk-item]:not([data-value="__create__"])').first().click();

  await expect(page.getByRole("columnheader", { name: /^recipe$/i })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /^made by$/i })).toBeVisible();
});

test("Finish shows None until one is added", async ({ page }) => {
  await openNewForm(page);
  await pick(page, "Category", "Bourbon");
  await expect(page.getByText("None ✓", { exact: true })).toBeVisible();

  await pick(page, "Add finishes", "French Oak");
  await expect(page.getByText("None ✓", { exact: true })).toHaveCount(0);
});
