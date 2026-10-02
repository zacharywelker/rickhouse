import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";

/** Unique per run, so repeated runs against the same database do not collide. */
const stamp = () => Math.random().toString(36).slice(2, 8);

// Specs create real rows; start each file from the seeded baseline.
test.beforeAll(resetDatabase);

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("every configuration section is reachable and lists its rows", async ({ page }) => {
  await page.getByRole("link", { name: "Configuration" }).click();
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

/** Adds one grain row to the editor, which starts empty. */
async function addGrain(page: Page, grain: string, percent: string, index: number) {
  await page.getByRole("button", { name: "Add an ingredient" }).click();
  await page.getByLabel(`Grain ${index + 1}`, { exact: true }).fill(grain);
  await page.getByLabel(`${grain} percentage`, { exact: true }).fill(percent);
}

test("the mashbill editor totals the grains live and blocks a bad sum", async ({ page }) => {
  await page.goto("/admin/mashbills");
  await page.getByRole("button", { name: "Add mashbill" }).first().click();

  await addGrain(page, "Corn", "70", 0);
  await expect(page.getByText("30% short of 100%.")).toBeVisible();

  await addGrain(page, "Rye", "20", 1);
  await expect(page.getByText("10% short of 100%.")).toBeVisible();

  // Saving while short must not reach the database.
  await page.getByRole("button", { name: "Add mashbill" }).last().click();
  await expect(page.getByRole("alert").filter({ hasText: "90" }).first()).toBeVisible();

  await addGrain(page, "Malted Barley", "10", 2);
  await expect(page.getByText("Adds up to 100%.")).toBeVisible();

  await page.getByRole("button", { name: "Add mashbill" }).last().click();
  // A mashbill is presented as its recipe, not a name.
  await expect(
    page.getByRole("cell", { name: "70% Corn · 20% Rye · 10% Malted Barley", exact: true }).first(),
  ).toBeVisible();
});

test("a secret mashbill shows its reference name instead of the inferred recipe", async ({ page }) => {
  const name = `Wheated ${stamp()}`;
  await page.goto("/admin/mashbills");
  await page.getByRole("button", { name: "Add mashbill" }).first().click();
  // The reference name only appears once the mashbill is marked secret.
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
  await page.getByLabel("Secret mashbill").click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await addGrain(page, "Corn", "70", 0);
  await addGrain(page, "Wheat", "20", 1);
  await addGrain(page, "Malted Barley", "10", 2);

  await page.getByRole("button", { name: "Add mashbill" }).last().click();
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
});

test("every account starts with generic styles, and can add its own with no recipe", async ({ page }) => {
  await page.goto("/admin/mashbills");
  for (const style of ["High Rye", "Low Rye", "Wheated"]) {
    await expect(page.getByRole("cell", { name: style, exact: true })).toBeVisible();
  }

  const name = `Bottled Oddity ${stamp()}`;
  await page.getByRole("button", { name: "Add mashbill" }).first().click();
  await page.getByLabel("Generic style").click();
  // A style has no recipe, so there are no grains to enter.
  await expect(page.getByRole("button", { name: "Add an ingredient" })).toHaveCount(0);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Add mashbill" }).last().click();
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
});

test("grains typed in lowercase are saved title-cased", async ({ page }) => {
  await page.goto("/admin/mashbills");
  await page.getByRole("button", { name: "Add mashbill" }).first().click();
  await addGrain(page, "corn", "61", 0);
  await addGrain(page, "rye", "27", 1);
  await addGrain(page, "malted barley", "12", 2);
  await page.getByRole("button", { name: "Add mashbill" }).last().click();
  await expect(page.getByRole("cell", { name: "61% Corn · 27% Rye · 12% Malted Barley", exact: true })).toBeVisible();
});

test("the same mashbill cannot be added twice", async ({ page }) => {
  await page.goto("/admin/mashbills");

  await page.getByRole("button", { name: "Add mashbill" }).first().click();
  await addGrain(page, "Corn", "62", 0);
  await addGrain(page, "Rye", "26", 1);
  await addGrain(page, "Malted Barley", "12", 2);
  await page.getByRole("button", { name: "Add mashbill" }).last().click();
  await expect(page.getByRole("cell", { name: "62% Corn · 26% Rye · 12% Malted Barley", exact: true })).toBeVisible();

  // The same recipe again, typed in another order and case.
  await page.getByRole("button", { name: "Add mashbill" }).first().click();
  await addGrain(page, "malted barley", "12", 0);
  await addGrain(page, "Rye", "26", 1);
  await addGrain(page, "CORN", "62", 2);
  await page.getByRole("button", { name: "Add mashbill" }).last().click();
  await expect(page.getByText("That recipe is already a mashbill").first()).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // A generic style that is already there, in another case.
  await page.getByRole("button", { name: "Add mashbill" }).first().click();
  await page.getByLabel("Generic style").click();
  await page.getByLabel("Name", { exact: true }).fill("high rye");
  await page.getByRole("button", { name: "Add mashbill" }).last().click();
  await expect(page.getByText("There is already a mashbill called high rye").first()).toBeVisible();
});

test("the mashbill table sorts by any column, and the sort stays in the URL", async ({ page }) => {
  await page.goto("/admin/mashbills");
  const firstRecipe = () => page.locator("tbody tr").first().locator("td").first();

  await page.getByRole("link", { name: "Sort by Recipe" }).click();
  await expect(page).toHaveURL(/\?sort=name$/);
  await expect(page.getByRole("columnheader", { name: "Sort by Recipe" })).toHaveAttribute("aria-sort", "ascending");
  const ascending = await firstRecipe().innerText();

  await page.getByRole("link", { name: "Sort by Recipe" }).click();
  await expect(page).toHaveURL(/\?sort=name&dir=desc$/);
  await expect(firstRecipe()).not.toHaveText(ascending);

  // Generic styles first when sorting by that column, and still after a reload.
  await page.getByRole("link", { name: "Sort by Generic" }).click();
  await expect(page).toHaveURL(/\?sort=generic$/);
  await page.reload();
  await expect(page.locator("tbody tr").first().locator("td").nth(2)).toHaveText("Yes");
});

// The whole point of the child table: the old fixed columns could hold exactly
// one unusual grain, and lost the second one's name.
test("a recipe can carry two grains the old fixed columns had no room for", async ({ page }) => {
  await page.goto("/admin/mashbills");
  await page.getByRole("button", { name: "Add mashbill" }).first().click();

  await addGrain(page, "Corn", "60", 0);
  await addGrain(page, "Oats", "20", 1);
  await addGrain(page, "Triticale", "10", 2);
  await addGrain(page, "Malted Barley", "10", 3);
  await expect(page.getByText("Adds up to 100%.")).toBeVisible();

  await page.getByRole("button", { name: "Add mashbill" }).last().click();
  // Convention first, then the unusual grains, biggest first.
  await expect(
    page.getByRole("cell", { name: "60% Corn · 10% Malted Barley · 20% Oats · 10% Triticale", exact: true }).first(),
  ).toBeVisible();
});

// Mashbills lost their distillery field in 1daaf55 (the link is per label
// now), so the inline-create path is exercised from the distillery form's
// company picker instead.
test("creates a company inline from the distillery picker", async ({ page }) => {
  const company = `Inline Company ${stamp()}`;
  await page.goto("/admin/distilleries");
  await page.getByRole("button", { name: "Add distillery" }).first().click();

  // The point of this: the company does not exist, and we never leave.
  await page.getByRole("combobox", { name: "Company" }).click();
  await page.getByPlaceholder("Search or create").fill(company);
  await page.getByRole("option", { name: `Create ${company}` }).click();

  await expect(page.getByRole("combobox", { name: "Company" })).toContainText(company);

  const name = `Inline Distillery ${stamp()}`;
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Add distillery" }).last().click();
  await expect(
    page.getByRole("row").filter({ hasText: name }).getByRole("cell", { name: company, exact: true }),
  ).toBeVisible();
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

  await expect(page.getByText(/\d+ labels? uses? this brand/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
});

test("edits an existing row and persists the change", async ({ page }) => {
  const city = `Louisville ${stamp()}`;
  await page.goto("/admin/stores");
  await page.getByRole("button", { name: "Edit P.Club by Pursuit Spirits" }).click();
  await page.getByLabel("City").fill(city);
  await page.getByLabel("State").fill("ky");
  await page.getByLabel("Country").fill("United States");
  await page.getByRole("button", { name: "Save store" }).click();

  // Saved as one tidy place: the state spelled out, the US left off.
  const location = `${city}, Kentucky`;
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
