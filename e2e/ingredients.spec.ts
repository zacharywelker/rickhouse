import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import { openNewLabelForm } from "./support/new-label";

const stamp = () => Math.random().toString(36).slice(2, 8);

test.beforeAll(resetDatabase);
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

const EXISTING_OPTION = '[cmdk-item]:not([data-value="__create__"])';
async function pick(page: Page, comboboxLabel: string, search: string) {
  await page.getByRole("combobox", { name: comboboxLabel }).click();
  await page.locator("[cmdk-input]").fill(search);
  await page.locator(EXISTING_OPTION).filter({ has: page.getByText(search, { exact: true }) }).first().click();
}

async function addIngredient(page: Page, kind: string, name: string) {
  await page.goto("/admin/ingredients");
  await page.getByRole("button", { name: "Add ingredient" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Kind").selectOption(kind);
  await page.getByRole("button", { name: "Add ingredient" }).last().click();
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
}

test("an ingredient added in Configuration is offered on a rum label and its chip opens a page", async ({ page }) => {
  const base = `Palm Sugar ${stamp()}`;
  await addIngredient(page, "rum_base", base);
  await expect(page.getByRole("row").filter({ hasText: base })).toContainText("Rum base");

  await openNewLabelForm(page);
  await pick(page, "Brand", "Pursuit Spirits");
  await pick(page, "Category", "Rum");
  await page.getByLabel("Label Name").fill(`Palm Rum ${stamp()}`);
  // Rum shows three preset buttons; any other base, including one added in Configuration, is typed under "Other…" with typeahead.
  const baseGroup = page.getByRole("group", { name: "Base" });
  await baseGroup.getByRole("button", { name: "Other…" }).click();
  await expect(page.locator(`datalist#ingredient-rum_base-suggestions option[value="${base}"]`)).toHaveCount(1);
  await baseGroup.getByLabel("Add base").fill(base);
  await baseGroup.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Create Label", exact: true }).click();
  await expect(page).toHaveURL(/\/expressions\/\d+$/);

  await page.getByRole("link", { name: base }).click();
  await expect(page).toHaveURL(/\/ingredients\/\d+$/);
  await expect(page.getByRole("heading", { name: base })).toBeVisible();
  await expect(page.getByText("Rum base", { exact: true })).toBeVisible();

  // Now in use, so Configuration will not let it go.
  await page.goto("/admin/ingredients");
  await page.getByRole("button", { name: `Delete ${base}` }).click();
  await expect(page.getByText(/1 label uses this ingredient/)).toBeVisible();
});

test("a built-in name is refused", async ({ page }) => {
  await page.goto("/admin/ingredients");
  await page.getByRole("button", { name: "Add ingredient" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("Molasses");
  await page.getByLabel("Kind").selectOption("rum_base");
  await page.getByRole("button", { name: "Add ingredient" }).last().click();
  await expect(page.getByText("Molasses is a built-in choice.").first()).toBeVisible();
});
