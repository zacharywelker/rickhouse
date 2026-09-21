import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.E2E_APP_PASSWORD ?? "smoke-test-password";

/** Unique per run, so repeated runs against the same database do not collide. */
const stamp = () => Math.random().toString(36).slice(2, 8);

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page).toHaveURL("/");
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("every taxonomy section is reachable and lists its rows", async ({ page }) => {
  await page.getByRole("link", { name: "Taxonomy" }).click();
  await expect(page).toHaveURL("/admin");

  for (const name of ["Categories", "Companies", "Brands", "Distilleries", "Mashbills", "Finishes", "Stores", "Tags"]) {
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
  }

  await page.goto("/admin/distilleries");
  await expect(page.getByRole("cell", { name: "Bardstown Bourbon Company", exact: true })).toBeVisible();
});

test("creates a distillery and generates its slug", async ({ page }) => {
  const name = `Willett Distillery ${stamp()}`;
  await page.goto("/admin/distilleries");
  await page.getByRole("button", { name: "Add distillery" }).first().click();

  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("State").fill("KY");
  await page.getByLabel("Founded").fill("1936");
  await page.getByRole("button", { name: "Add distillery" }).last().click();

  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

  // Reopening shows the slug that was generated from the name.
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  await expect(page.getByLabel("URL slug")).toHaveValue(/^willett-distillery-/);
});

test("the mashbill editor totals the grains live and blocks a bad sum", async ({ page }) => {
  // Named, so the assertion below is about this run's row and not a
  // identically-proportioned one left by an earlier run.
  const name = `Test Recipe ${stamp()}`;
  await page.goto("/admin/mashbills");
  await page.getByRole("button", { name: "Add mashbill" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill(name);

  await page.getByLabel("Corn", { exact: true }).fill("70");
  await expect(page.getByText("30% short of 100%.")).toBeVisible();

  await page.getByLabel("Rye", { exact: true }).fill("20");
  await expect(page.getByText("10% short of 100%.")).toBeVisible();

  // Saving while short must not reach the database.
  await page.getByRole("button", { name: "Add mashbill" }).last().click();
  await expect(page.getByRole("alert").filter({ hasText: "90" }).first()).toBeVisible();

  await page.getByLabel("Malted barley", { exact: true }).fill("10");
  await expect(page.getByText("Adds up to 100%.")).toBeVisible();

  await page.getByRole("button", { name: "Add mashbill" }).last().click();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row.getByRole("cell", { name: "70% corn · 20% rye · 10% malted barley", exact: true })).toBeVisible();
});

test("creates a distillery inline from the mashbill picker", async ({ page }) => {
  const name = `Inline Distillery ${stamp()}`;
  await page.goto("/admin/mashbills");
  await page.getByRole("button", { name: "Add mashbill" }).first().click();

  // The point of this: the distillery does not exist, and we never leave.
  await page.getByRole("combobox", { name: "Distillery" }).click();
  await page.getByPlaceholder("Search or create").fill(name);
  await page.getByRole("option", { name: `Create ${name}` }).click();

  await expect(page.getByRole("combobox", { name: "Distillery" })).toContainText(name);

  const recipe = `Inline Recipe ${stamp()}`;
  await page.getByLabel("Name", { exact: true }).fill(recipe);
  await page.getByLabel("Corn", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Add mashbill" }).last().click();
  await expect(
    page.getByRole("row").filter({ hasText: recipe }).getByRole("cell", { name: "100% corn", exact: true }),
  ).toBeVisible();

  // And it is a real row, not just a form-local value.
  await page.goto("/admin/distilleries");
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
});

test("a category cannot be parented to its own descendant", async ({ page }) => {
  await page.goto("/admin/categories");
  await page.getByRole("button", { name: "Edit Whiskey" }).click();

  await page.getByRole("combobox", { name: "Parent category" }).click();
  const picker = page.getByRole("listbox");
  // Bourbon sits under American Whiskey, which sits under Whiskey.
  await expect(picker.getByRole("option", { name: "Bourbon" })).toHaveCount(0);
  await expect(picker.getByRole("option", { name: "Rum", exact: true })).toBeVisible();
});

test("deleting a brand in use is blocked and explains why", async ({ page }) => {
  await page.goto("/admin/brands");
  await page.getByRole("button", { name: "Delete Pursuit Spirits" }).click();

  await expect(page.getByText(/1 expression uses this brand/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
});

test("edits an existing row and persists the change", async ({ page }) => {
  const location = `Louisville ${stamp()}`;
  await page.goto("/admin/stores");
  await page.getByRole("button", { name: "Edit P.Club by Pursuit Spirits" }).click();
  await page.getByLabel("Location").fill(location);
  await page.getByRole("button", { name: "Save store" }).click();

  await expect(page.getByRole("cell", { name: location, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: location, exact: true })).toBeVisible();
});

test("rejects a duplicate name with a readable message", async ({ page }) => {
  await page.goto("/admin/finishes");
  await page.getByRole("button", { name: "Add finish" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("French Oak");
  await page.getByRole("button", { name: "Add finish" }).last().click();

  await expect(page.getByRole("alert").filter({ hasText: /already/i }).first()).toBeVisible();
});
