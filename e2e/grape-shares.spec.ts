import { expect, test, type Page } from "@playwright/test";
import { resetDatabase } from "./support/db";
import { signIn } from "./support/auth";
import { openNewLabelForm } from "./support/new-label";
import { assertThrowawayDatabase } from "./support/tournament-field";

/** Ingredient shares (2): the grapes of a Cognac, Armagnac or pisco have a share, a total note, and a detail page. */

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

async function addGrape(page: Page, name: string) {
  await page.getByLabel("Add distillate").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

test("a Cognac's grapes have a share, a note when they do not add up, and show on the label's page", async ({ page }) => {
  await openNewLabelForm(page);
  await pick(page, "Brand", "Pursuit Spirits");
  await pick(page, "Category", "Cognac");
  await page.getByLabel("Label Name").fill(`Grape Shares ${Date.now()}`);
  await addGrape(page, "Ugni Blanc");
  await addGrape(page, "Colombard");
  await page.getByLabel("Share of Ugni Blanc").fill("90");
  await expect(page.getByText("The shares add up to 90% so far, not 100%.")).toBeVisible();
  await page.getByLabel("Share of Colombard").fill("5");
  await expect(page.getByText("The shares add up to 95%, not 100%.")).toBeVisible();
  await page.getByLabel("Share of Colombard").fill("10");
  await expect(page.getByText(/shares add up/)).toHaveCount(0);
  await page.getByRole("button", { name: "Create Label", exact: true }).click();
  await expect(page).toHaveURL(/\/expressions\/\d+$/);
  await expect(page.getByText("Ugni Blanc").first()).toBeVisible();
  await expect(page.getByText("90%")).toBeVisible();
  await expect(page.getByText("10%")).toBeVisible();
  // Saved shares come back in the edit form.
  await page.goto(page.url() + "/edit");
  await expect(page.getByLabel("Share of Ugni Blanc")).toHaveValue("90");
});

test("an Armagnac suggests its own grapes, main grapes first", async ({ page }) => {
  await openNewLabelForm(page);
  await pick(page, "Category", "Armagnac");
  const options = await page.locator("datalist option").evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
  expect(options.slice(0, 4)).toEqual(["Ugni Blanc", "Baco 22A", "Folle Blanche", "Colombard"]);
  expect(options).toContain("Mauzac");
  expect(options).not.toContain("Quebranta");
});

test("a Calvados's fruit is a table of shares with an apples subtotal, a total, and the appellation's pear warning", async ({ page }) => {
  await openNewLabelForm(page);
  await pick(page, "Brand", "Pursuit Spirits");
  await pick(page, "Category", "Calvados");
  await page.getByLabel("Label Name").fill(`Fruit Shares ${Date.now()}`);
  await page.getByLabel("Appellation").selectOption("pays-d-auge");
  await page.getByLabel("Share of Bittersweet").fill("40");
  await page.getByLabel("Share of Sweet", { exact: true }).fill("30");
  await page.getByLabel("Share of Pears").fill("30");
  await expect(page.getByRole("row", { name: /Apples \(subtotal\)/ })).toContainText("70%");
  await expect(page.getByRole("row", { name: /^Total/ })).toContainText("100%");
  await expect(page.getByText(/shares add up/)).toHaveCount(0);
  await expect(page.getByText("Pays d'Auge allows at most 30% pears.")).toHaveCount(0);
  await page.getByLabel("Share of Pears").fill("40");
  await expect(page.getByText("Pays d'Auge allows at most 30% pears.")).toBeVisible();
  await expect(page.getByText("The shares add up to 110%, not 100%.")).toBeVisible();
  await page.getByLabel("Share of Pears").fill("30");
  await page.getByRole("button", { name: "Create Label", exact: true }).click();
  await expect(page).toHaveURL(/\/expressions\/\d+$/);
  await expect(page.getByText("Bittersweet apples")).toBeVisible();
  await expect(page.getByText("Apples (total)")).toBeVisible();
  await page.goto(page.url() + "/edit");
  await expect(page.getByLabel("Share of Sweet", { exact: true })).toHaveValue("30");
  await expect(page.getByLabel("Share of Bitter", { exact: true })).toHaveValue("");
});
