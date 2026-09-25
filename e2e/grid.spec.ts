import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";

const stamp = () => Math.random().toString(36).slice(2, 8);

const EXISTING_OPTION = '[cmdk-item]:not([data-value="__create__"])';

async function pick(page: Page, comboboxLabel: string, search: string, optionLabel?: string) {
  const target = optionLabel ?? search;
  await page.getByRole("combobox", { name: comboboxLabel }).click();
  await page.locator("[cmdk-input]").fill(search);
  await page.locator(EXISTING_OPTION).filter({ has: page.getByText(target, { exact: true }) }).first().click();
}

// Specs create real rows; start each file from the seeded baseline.
test.beforeAll(resetDatabase);

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("the grid shows the collection with a readable fill gauge", async ({ page }) => {
  await page.goto("/bottles");
  await expect(page.getByRole("heading", { name: "Collection", level: 1 })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();
  // The read-only gauge in the grid is an image with its level in the name.
  await expect(page.getByRole("img", { name: /Double Oak Spirit fill: \d+ percent full/ })).toBeVisible();
});

/** The M4 acceptance criterion. */
test("filtering by a distillery finds the blends it contributed to", async ({ page }) => {
  const soloName = `Finger Lakes Solo ${stamp()}`;

  // A second expression made by Finger Lakes alone. The seeded Pursuit bottle
  // is a blend of Bardstown, Tennessee Distilling and Finger Lakes.
  await page.goto("/expressions/new");
  await pick(page, "Brand", "Pursuit Spirits");
  await pick(page, "Category", "Bourbon");
  await page.getByLabel("Label Name").fill(soloName);
  await page.getByLabel("Proof", { exact: true }).fill("92");
  await pick(page, "Add distilleries", "Finger Lakes", "Finger Lakes Distilling");
  await page.getByRole("button", { name: "Create Label" }).click();
  await expect(page).toHaveURL("/expressions");

  await page.goto("/bottles/new");
  await pick(page, "Label", soloName, `Pursuit Spirits ${soloName}`);
  await page.getByRole("button", { name: "Add bottle" }).click();
  await expect(page).toHaveURL(/\/bottles\/\d+$/);

  await page.goto("/bottles");
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: soloName, exact: true })).toBeVisible();

  // Bardstown only made the blend.
  await page.getByRole("button", { name: "Filter by distillery" }).click();
  await page.getByRole("button", { name: /Bardstown Bourbon Company/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: soloName, exact: true })).toHaveCount(0);

  // Finger Lakes made one alone AND contributed to the blend: both appear.
  await page.goto("/bottles");
  await page.getByRole("button", { name: "Filter by distillery" }).click();
  await page.getByRole("button", { name: /Finger Lakes Distilling/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: soloName, exact: true })).toBeVisible();
});

test("filter state survives a reload, so a view can be bookmarked", async ({ page }) => {
  await page.goto("/bottles");
  await page.getByRole("button", { name: "Filter by distillery" }).click();
  await page.getByRole("button", { name: /Bardstown Bourbon Company/ }).click();
  await page.keyboard.press("Escape");

  await expect(page).toHaveURL(/distillery=\d+/);
  const url = page.url();

  await page.reload();
  await expect(page.getByRole("button", { name: "Filter by distillery" })).toContainText("1");
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();
  expect(page.url()).toBe(url);
});

test("a category filter includes the categories beneath it", async ({ page }) => {
  // The seeded bottle is a Bourbon, which sits under American Whiskey, under
  // Whiskey. Filtering by Whiskey has to find it.
  await page.goto("/bottles");
  await page.getByRole("button", { name: "Filter by category" }).click();
  await page.getByRole("button", { name: /^Whiskey/ }).first().click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();
});

test("range filters narrow and clear", async ({ page }) => {
  await page.goto("/bottles");

  await page.getByRole("button", { name: "Filter by proof" }).click();
  await page.getByLabel("Min", { exact: true }).fill("120");
  await page.keyboard.press("Escape");
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();

  await page.getByRole("button", { name: /Clear \d+ filter/ }).click();
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();
});

test("columns can be hidden and the choice is in the URL", async ({ page }) => {
  await page.goto("/bottles");
  await expect(page.getByRole("columnheader", { name: /MSRP/ })).toBeVisible();

  await page.getByRole("button", { name: "Columns" }).click();
  // The checkbox is driven by the URL, so assert the outcome rather than the
  // control's own state, which only catches up once the navigation lands.
  await page.getByRole("checkbox", { name: "MSRP" }).click();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("columnheader", { name: /MSRP/ })).toHaveCount(0);
  await expect(page).toHaveURL(/hide=msrp/);
});

test("switches to the gallery and back", async ({ page }) => {
  await page.goto("/bottles");
  await page.getByRole("button", { name: "Gallery" }).click();
  await expect(page).toHaveURL(/view=gallery/);
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Double Oak Spirit/ })).toBeVisible();

  await page.getByRole("button", { name: "Table" }).click();
  await expect(page.getByRole("table")).toBeVisible();
});

test("sorting is server-side and reflected in the URL", async ({ page }) => {
  await page.goto("/bottles");
  await page.getByRole("button", { name: "Sort by Proof" }).click();
  await expect(page).toHaveURL(/sort=proof/);
  await page.getByRole("button", { name: "Sort by Proof" }).click();
  await expect(page).toHaveURL(/dir=asc/);
});
