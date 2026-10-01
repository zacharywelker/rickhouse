import path from "node:path";
import { expect, test } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";

/**
 * The search-first Add bottle page (/bottles/add) and the label's own page.
 * Seeded baseline: Pursuit Spirits' Double Oak Spirit, a Bourbon with one
 * bottle, and the P.Club store.
 */

const stamp = () => Math.random().toString(36).slice(2, 8);

test.beforeAll(resetDatabase);

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("a brand and a label name typed together find the label", async ({ page }) => {
  await page.goto("/bottles/add");
  const search = page.getByRole("combobox", { name: "Find the label" });
  // The brand on file is "Pursuit Spirits"; nobody types that.
  await search.fill("pursuit double oak");
  await expect(page.getByRole("option", { name: /Pursuit Spirits Double Oak Spirit/ })).toBeVisible();
  // One slip in a longer word is forgiven; a word that isn't there is not.
  await search.fill("dubble oak");
  await expect(page.getByRole("option", { name: /Double Oak Spirit/ })).toBeVisible();
  await search.fill("double maple");
  await expect(page.getByRole("option", { name: /Double Oak Spirit/ })).toBeHidden();
});

test("picking a label and saving adds a bottle of it, photos and all", async ({ page }) => {
  await page.goto("/bottles/add");
  const search = page.getByRole("combobox", { name: "Find the label" });
  await search.fill("Pursuit Double Oak");
  await expect(page.getByRole("option", { name: /Double Oak Spirit/ })).toBeVisible();
  await search.press("Enter");

  await expect(page.getByText(/You have 1 bottle of this/)).toBeVisible();
  await expect(page.getByLabel("Price Paid")).toBeFocused();
  await page.getByLabel("Price Paid").fill("74.99");
  await page.getByLabel("Private Selection").check();
  await page.getByLabel("Barrel Number").fill("B-1234");
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures", "bottle.jpg"));
  await page.getByRole("button", { name: "Save bottle" }).click();

  await expect(page).toHaveURL(/\/bottles\/\d+$/);
  await expect(page.getByRole("img", { name: "Pursuit Spirits Double Oak Spirit" })).toBeVisible();

  // The label's page lists both bottles, the pick told apart by its barrel.
  await page.getByRole("link", { name: "Double Oak Spirit", exact: true }).click();
  await expect(page).toHaveURL(/\/expressions\/\d+$/);
  await expect(page.getByRole("link", { name: /barrel B-1234/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Standard release" })).toBeVisible();
});

test("a new label starts from the search, and both save together", async ({ page }) => {
  // No category in the name, so the category is left to be chosen.
  const name = `Toasted Barrel ${stamp()}`;
  await page.goto("/bottles/add");
  const search = page.getByRole("combobox", { name: "Find the label" });
  await search.fill(`Pursuit ${name}`);
  const newRow = page.getByRole("option", { name: `New label: Pursuit Spirits · ${name}` });
  await expect(newRow).toBeVisible();
  await newRow.click();

  // The brand on file is recognised, and the rest is the name, as typed.
  await expect(page.getByRole("combobox", { name: "Brand" })).toContainText("Pursuit Spirits");
  await expect(page.getByLabel("Label Name")).toHaveValue(name);

  // Nothing is saved while the label is missing what it needs.
  await page.getByRole("button", { name: "Save label and bottle" }).click();
  await expect(page.getByText("Check the highlighted fields on the label.")).toBeVisible();

  await page.getByRole("combobox", { name: "Category" }).click();
  await page.locator("[cmdk-input]").fill("Rye");
  await page.locator('[cmdk-item]:not([data-value="__create__"])').filter({ hasText: /^Rye/ }).first().click();
  await page.getByLabel("Proof", { exact: true }).first().fill("117.6");
  await page.getByLabel("Price Paid").fill("89.99");

  // Save and add another: the trip carries over, the label starts again.
  await page.getByLabel("Date Acquired").fill("2026-09-30");
  await page.getByRole("button", { name: "Save and add another" }).click();
  await expect(page.getByText(/This haul: 1 bottle/)).toBeVisible();
  await expect(search).toBeFocused();

  await search.fill(name);
  await expect(page.getByRole("option", { name: new RegExp(name) })).toBeVisible();
  await search.press("Enter");
  await expect(page.getByLabel("Date Acquired")).toHaveValue("2026-09-30");
  await expect(page.getByLabel("Price Paid")).toHaveValue("");
});

test("the switch in Configuration makes Add bottle search-first", async ({ page }) => {
  await page.goto("/bottles/new");
  await expect(page).toHaveURL("/bottles/new");

  await page.goto("/admin");
  const toggle = page.getByLabel("Search-first Add bottle");
  await toggle.check();
  await expect(toggle).toBeChecked();

  await page.goto("/bottles/new");
  await expect(page).toHaveURL("/bottles/add");
  await expect(page.getByRole("combobox", { name: "Find the label" })).toBeVisible();

  await page.goto("/admin");
  await page.getByLabel("Search-first Add bottle").uncheck();
  await expect(page.getByLabel("Search-first Add bottle")).not.toBeChecked();
  await page.goto("/bottles/new");
  await expect(page).toHaveURL("/bottles/new");
});

test("the switch is each account's own", async ({ browser }) => {
  const admin = await browser.newPage();
  await signIn(admin);
  await admin.goto("/admin");
  await admin.getByLabel("Search-first Add bottle").check();
  await expect(admin.getByLabel("Search-first Add bottle")).toBeChecked();

  const member = await browser.newPage();
  await signIn(member, "member");
  await member.goto("/bottles/new");
  await expect(member).toHaveURL("/bottles/new");

  await admin.getByLabel("Search-first Add bottle").uncheck();
  await expect(admin.getByLabel("Search-first Add bottle")).not.toBeChecked();
});
