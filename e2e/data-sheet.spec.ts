import { expect, test, type Page } from "@playwright/test";
import { resetDatabase } from "./support/db";
import { signIn } from "./support/auth";
import { assertThrowawayDatabase } from "./support/tournament-field";

/** The data-sheet look (phase 4C, slice 1): rows with chips on the label form, behind a per-browser switch. */

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

async function pick(page: Page, comboboxLabel: string, search: string) {
  await page.getByRole("combobox", { name: comboboxLabel }).click();
  await page.locator("[cmdk-input]").fill(search);
  await page.locator('[cmdk-item]:not([data-value="__create__"])').filter({ has: page.getByText(search, { exact: true }) }).first().click();
}

async function openNewForm(page: Page, look: "new" | "old" = "new") {
  await page.goto(`/expressions/new?look=${look}`);
  await page.getByRole("option", { name: "New label", exact: true }).click();
  await expect(page.getByLabel("Label Name")).toBeVisible();
}

test("the new look draws rows with chips, and a dashed + chip for an empty optional fact", async ({ page }) => {
  await openNewForm(page);
  await pick(page, "Category", "Bourbon");
  for (const label of ["Name", "Strength", "Size and price", "Age"]) await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to the old look" })).toBeVisible();
  const add = page.getByRole("button", { name: "Add UPC / Barcode" });
  await expect(add).toBeVisible();
  await add.click();
  const upc = page.getByLabel("UPC / Barcode");
  await expect(upc).toBeFocused();
  await upc.fill("081234567890");
  await expect(upc).toHaveValue("081234567890");
  await upc.fill("");
  await page.getByLabel("Label Name").click();
  await expect(page.getByRole("button", { name: "Add UPC / Barcode" })).toBeVisible();
});

test("a toggle chip is a real checkbox, and the old look is one click away", async ({ page }) => {
  await openNewForm(page);
  await pick(page, "Category", "Bourbon");
  const cask = page.getByLabel("Cask Strength");
  await expect(cask).not.toBeChecked();
  await page.getByText("Cask Strength", { exact: true }).click();
  await expect(cask).toBeChecked();
  await page.getByRole("button", { name: "Back to the old look" }).click();
  await expect(page.getByRole("button", { name: "Try the new look" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add UPC / Barcode" })).toHaveCount(0);
  await expect(page.getByLabel("UPC / Barcode")).toBeVisible();
});

test("a spirit's own facts are chips too: an unset class is a + chip that opens a select", async ({ page }) => {
  await openNewForm(page);
  await pick(page, "Category", "Tequila");
  await page.getByRole("button", { name: "Add Tequila Class" }).click();
  const select = page.getByLabel("Tequila Class");
  await expect(select).toBeFocused();
  await select.selectOption("reposado");
  await expect(select).toHaveValue("reposado");
});

test("a label made in the new look saves what was typed, and opens the same in either look", async ({ page }) => {
  const name = `Sheet Label ${Date.now()}`;
  await openNewForm(page);
  await pick(page, "Brand", "Pursuit Spirits");
  await pick(page, "Category", "Bourbon");
  await page.getByLabel("Label Name").fill(name);
  await page.getByText("Cask Strength", { exact: true }).click();
  await page.getByRole("button", { name: "Add MSRP" }).click();
  await page.getByLabel("MSRP").fill("69.99");
  await page.getByRole("button", { name: "Add UPC / Barcode" }).click();
  await page.getByLabel("UPC / Barcode").fill("081234567890");
  await page.getByRole("button", { name: "Create Label", exact: true }).click();
  await expect(page).toHaveURL(/\/expressions\/\d+$/);
  const url = page.url();
  for (const look of ["new", "old"]) {
    await page.goto(`${url}/edit?look=${look}`);
    await expect(page.getByLabel("MSRP")).toHaveValue("69.99");
    await expect(page.getByLabel("UPC / Barcode")).toHaveValue("081234567890");
    await expect(page.getByLabel("Cask Strength")).toBeChecked();
  }
});
