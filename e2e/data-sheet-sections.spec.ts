import { expect, test, type Page } from "@playwright/test";
import { resetDatabase } from "./support/db";
import { signIn } from "./support/auth";
import { assertThrowawayDatabase } from "./support/tournament-field";

/** The data-sheet look (phase 4C, slice 2): rare fields sit under More, and the Production, Age and About it rows fill from their chips. */

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

test("a Scotch label keeps its rare fields under More", async ({ page }) => {
  await openNewForm(page);
  await pick(page, "Category", "Scotch Whisky");
  await expect(page.getByText("More:", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Still", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "How it's made", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Description", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "How it's made", exact: true }).click();
  await expect(page.getByText("How it's made", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "How it's made", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Description", exact: true }).click();
  await expect(page.getByLabel("Description", { exact: true })).toBeVisible();
});

test("a mezcal's Production row presets how it was made", async ({ page }) => {
  await openNewForm(page);
  await pick(page, "Category", "Mezcal");
  await page.getByRole("button", { name: "Add Production", exact: true }).click();
  await page.getByRole("combobox", { name: "Production", exact: true }).selectOption("ancestral");

  const addCooking = page.getByRole("button", { name: "Add Cooking Method", exact: true });
  if (await addCooking.count()) await addCooking.click();
  await expect(page.getByRole("combobox", { name: "Cooking Method", exact: true })).toHaveValue("pit");

  await expect(page.getByText("Flavor", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Flavor", exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: "Still", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Still Type", exact: true })).toHaveValue("clay-pot");
});

test("a Calvados label has an appellation in the Age row and asks for a vintage year only for a Millésime", async ({ page }) => {
  await openNewForm(page);
  await pick(page, "Category", "Calvados");
  await page.getByRole("button", { name: "Add Appellation", exact: true }).click();
  await page.getByRole("combobox", { name: "Appellation", exact: true }).selectOption("pays-d-auge");
  await expect(page.getByRole("combobox", { name: "Still Type", exact: true })).toHaveValue("pot");
  await expect(page.getByLabel("Vintage Year", { exact: true })).toHaveCount(0);

  const addAge = page.getByRole("button", { name: "Add Age Designation", exact: true });
  if (await addAge.count()) await addAge.click();
  await page.getByRole("combobox", { name: "Age Designation", exact: true }).selectOption("Millésime");
  const addVintage = page.getByRole("button", { name: "Add Vintage Year", exact: true });
  await expect(addVintage).toBeVisible();
  await addVintage.click();
  await expect(page.getByText("Vintage Year", { exact: true }).first()).toBeVisible();
  await expect(addVintage).toHaveCount(0);
});

test("a rum's About it row saves what is typed and opens the same in the old look", async ({ page }) => {
  const name = `Sheet Rum ${Date.now()}`;
  await openNewForm(page);
  await pick(page, "Brand", "Pursuit Spirits");
  await pick(page, "Category", "Rum");
  await page.getByLabel("Label Name").fill(name);
  await page.getByRole("button", { name: "Add Marque", exact: true }).click();
  await page.getByLabel("Marque", { exact: true }).fill("LROK");
  await page.getByRole("button", { name: "Create Label", exact: true }).click();
  await expect(page).toHaveURL(/\/expressions\/\d+$/);
  const url = page.url();

  await page.goto(`${url}/edit?look=old`);
  await expect(page.getByLabel("Marque", { exact: true })).toHaveValue("LROK");
  await page.goto(`${url}/edit?look=new`);
  await expect(page.getByLabel("Marque", { exact: true })).toHaveValue("LROK");
});

test("an agave's Additive Free is in the Production row and a whiskey's is under How it's made", async ({ page }) => {
  await openNewForm(page);
  await pick(page, "Category", "Tequila");
  await expect(
    page.getByLabel("Additive Free", { exact: true }).or(page.getByRole("button", { name: "Add Additive Free", exact: true })),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "How it's made", exact: true })).toHaveCount(0);

  await openNewForm(page);
  await pick(page, "Category", "Canadian Whisky");
  await expect(page.getByRole("button", { name: "How it's made", exact: true })).toBeVisible();
});
