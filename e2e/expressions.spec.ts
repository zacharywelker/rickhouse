import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { resetDatabase } from "./support/db";

const PASSWORD = process.env.E2E_APP_PASSWORD ?? "smoke-test-password";
const stamp = () => Math.random().toString(36).slice(2, 8);

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page).toHaveURL("/");
}

// Specs create real rows; start each file from the seeded baseline.
test.beforeAll(resetDatabase);

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

/** Rows in an open picker, never the "Create …" row. */
const EXISTING_OPTION = '[cmdk-item]:not([data-value="__create__"])';

/**
 * Selects an existing option in one of the combobox pickers.
 *
 * Matched on the option's own label element rather than its accessible name,
 * because the name also picks up the hint ("in American Whiskey", or the
 * company behind a brand). The create row is excluded by selector: matching it
 * by accident silently creates a duplicate record instead of failing.
 */
async function pick(page: Page, comboboxLabel: string, search: string, optionLabel?: string) {
  const target = optionLabel ?? search;
  await page.getByRole("combobox", { name: comboboxLabel }).click();
  await page.locator("[cmdk-input]").fill(search);
  await page
    .locator(EXISTING_OPTION)
    .filter({ has: page.getByText(target, { exact: true }) })
    .first()
    .click();
}

/** Uses the inline "create new" row rather than selecting something existing. */
async function pickCreate(page: Page, comboboxLabel: string, name: string) {
  await page.getByRole("combobox", { name: comboboxLabel }).click();
  await page.locator("[cmdk-input]").fill(name);
  await page.locator('[cmdk-item][data-value="__create__"]').click();
}

test("the expression form reveals sections for the chosen category", async ({ page }) => {
  await page.goto("/expressions/new");

  // Bourbon is a whiskey category: process fields, no rum fields.
  await pick(page, "Category", "Bourbon");
  await expect(page.getByRole("heading", { name: "Process" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rum detail" })).toBeHidden();
  await expect(page.getByLabel("Bottled in bond")).toBeVisible();

  // Switching to Rum swaps the section.
  await pick(page, "Category", "Rum");
  await expect(page.getByRole("heading", { name: "Rum detail" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Process" })).toBeHidden();
  await expect(page.getByLabel("Marque")).toBeVisible();
});

test("single barrel reveals the pick detail section", async ({ page }) => {
  await page.goto("/expressions/new");
  await expect(page.getByRole("heading", { name: "Single barrel detail" })).toBeHidden();

  await page.getByLabel("Single barrel", { exact: true }).check();
  await expect(page.getByRole("heading", { name: "Single barrel detail" })).toBeVisible();
  await expect(page.getByLabel("Picked by")).toBeVisible();
  await expect(page.getByLabel("Warehouse")).toBeVisible();
});

test("rejects a bottling date before the fill date", async ({ page }) => {
  const name = `Date Check ${stamp()}`;
  await page.goto("/expressions/new");
  await pick(page, "Brand", "Pursuit Spirits");
  await pick(page, "Category", "Bourbon");
  await page.getByLabel("Expression name").fill(name);
  await page.getByLabel("Single barrel", { exact: true }).check();
  await page.getByLabel("Barrel filled").fill("2020-06-01");
  await page.getByLabel("Bottled", { exact: true }).fill("2019-06-01");
  await page.getByRole("button", { name: "Create expression" }).click();

  await expect(page.getByRole("alert").filter({ hasText: /Bottled before it was filled/ }).first()).toBeVisible();
});

test("creates a blended expression with ordered distilleries, then a bottle, then its page", async ({ page }) => {
  const suffix = stamp();
  const name = `Double Oak ${suffix}`;
  const newDistillery = `Inline Cooperage ${suffix}`;

  // --- the expression ---
  await page.goto("/expressions/new");
  await pick(page, "Brand", "Pursuit Spirits");
  await pick(page, "Category", "Bourbon");
  await page.getByLabel("Expression name").fill(name);
  await page.getByLabel("Proof", { exact: true }).fill("108");
  await page.getByLabel("Age statement").fill("NAS (labeled Straight, so at least 2 years)");
  await page.getByLabel("MSRP").fill("69.99");
  await page.getByLabel("UPC / barcode").fill("081234567890");

  // Three distilleries, one of them created without leaving the form.
  await pick(page, "Add distilleries", "Bardstown", "Bardstown Bourbon Company");
  await pick(page, "Add distilleries", "Tennessee", "Tennessee Distilling Ltd.");
  await pickCreate(page, "Add distilleries", newDistillery);

  const distilleryList = page.getByRole("group", { name: "Distilleries" });
  await expect(distilleryList.getByRole("listitem")).toHaveCount(3);

  // Order is meaningful, so check it can be changed.
  await distilleryList.getByRole("button", { name: `Move ${newDistillery} up` }).click();
  await expect(distilleryList.getByRole("listitem").nth(1)).toContainText(newDistillery);

  await pick(page, "Add finishes", "French Oak");
  await page.getByRole("button", { name: "Create expression" }).click();
  await expect(page).toHaveURL("/expressions");
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

  // --- the bottle ---
  await page.goto("/bottles/new");
  await pick(page, "Expression", name, `Pursuit Spirits ${name}`);
  await page.getByLabel("Price paid").fill("69.99");
  await pick(page, "Store", "P.Club", "P.Club by Pursuit Spirits");
  await page.getByLabel("Date acquired").fill("2025-03-27");
  await page.getByRole("button", { name: "Add bottle" }).click();

  // --- its own page ---
  await expect(page).toHaveURL(/\/bottles\/\d+$/);
  await expect(page.getByRole("heading", { name: `Pursuit Spirits ${name}` })).toBeVisible();
  await expect(page.getByText("108", { exact: true })).toBeVisible();
  await expect(page.getByText("54%", { exact: true })).toBeVisible(); // ABV, generated from proof
  await expect(page.getByText("$69.99").first()).toBeVisible();
  await expect(page.getByText("081234567890")).toBeVisible();

  // The blend shows every contributor, in the order chosen.
  const chips = page.getByRole("listitem");
  await expect(chips.filter({ hasText: "Bardstown Bourbon Company" })).toBeVisible();
  await expect(chips.filter({ hasText: newDistillery })).toBeVisible();
  await expect(chips.filter({ hasText: "French Oak" })).toBeVisible();
});

/**
 * Opens the seeded bottle without hardcoding an id. Since M4 the grid links on
 * the expression name, with the brand in its own column.
 */
async function openFirstBottle(page: Page) {
  await page.goto("/bottles");
  await page.getByRole("link", { name: /Double Oak Spirit/ }).first().click();
  await expect(page).toHaveURL(/\/bottles\/\d+$/);
}

test("uploads a photo and makes it the hero", async ({ page }) => {
  await openFirstBottle(page);
  await page
    .getByLabel("Add photos")
    .setInputFiles(path.join(process.cwd(), "e2e/fixtures/bottle.jpg"));

  const gallery = page.getByRole("listitem").filter({ has: page.getByText("Hero") });
  await expect(gallery.first()).toBeVisible({ timeout: 15000 });

  // The stored image is served back through the authenticated route.
  const img = page.locator('img[src^="/api/images/"]').first();
  await expect(img).toBeVisible();
  const src = await img.getAttribute("src");
  const response = await page.request.get(src!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/webp");
});

test("records a tasting note against the bottle", async ({ page }) => {
  const nose = `Brown sugar and toasted oak ${stamp()}`;
  await openFirstBottle(page);
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByLabel("Rating").fill("8.5");
  await page.getByLabel("Nose").fill(nose);
  await page.getByRole("button", { name: "Save note" }).click();

  await expect(page.getByText(nose)).toBeVisible();
  await expect(page.getByText("8.5").first()).toBeVisible();
});

test("refuses to serve a path outside the uploads directory", async ({ page }) => {
  const response = await page.request.get("/api/images/..%2F..%2F..%2Fetc%2Fpasswd");
  expect(response.status()).toBe(404);
});

test("recategorising does not silently wipe the hidden fields", async ({ page }) => {
  const name = `Ester Keeper ${stamp()}`;

  // A rum, with a value that only the rum section can write.
  await page.goto("/expressions/new");
  await pick(page, "Brand", "Pursuit Spirits");
  await pick(page, "Category", "Rum");
  await page.getByLabel("Expression name").fill(name);
  await page.getByLabel("Marque").fill("DOK");
  await page.getByLabel("Esters (g/hLAA)").fill("1500");
  await page.getByRole("button", { name: "Create expression" }).click();
  await expect(page).toHaveURL("/expressions");

  // Recategorise it as a Bourbon, which hides the rum section entirely.
  await page.getByRole("row").filter({ hasText: name }).getByRole("link", { name: /Edit/ }).click();
  await expect(page.getByLabel("Esters (g/hLAA)")).toHaveValue("1500");
  await pick(page, "Category", "Bourbon");
  await expect(page.getByRole("heading", { name: "Rum detail" })).toBeHidden();
  await page.getByRole("button", { name: "Save expression" }).click();
  await expect(page).toHaveURL("/expressions");

  // Switching back must find the esters still there.
  await page.getByRole("row").filter({ hasText: name }).getByRole("link", { name: /Edit/ }).click();
  await pick(page, "Category", "Rum");
  await expect(page.getByLabel("Esters (g/hLAA)")).toHaveValue("1500");
  await expect(page.getByLabel("Marque")).toHaveValue("DOK");
});
