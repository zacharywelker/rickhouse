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

test("Enter straight after typing waits for the results, as a barcode scanner needs", async ({ page }) => {
  await page.goto("/bottles/add");
  const search = page.getByRole("combobox", { name: "Find the label" });
  // No pause between typing and Enter: the results for this text aren't in yet.
  await search.fill("Pursuit Double Oak Spirit");
  await search.press("Enter");
  await expect(page.getByText(/You have \d+ bottles? of this/)).toBeVisible();
  await expect(page.getByLabel("Label Name")).toBeHidden();
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

/** Picks the seeded label from the search, ready for the bottle's fields. */
async function pickSeededLabel(page: import("@playwright/test").Page) {
  const search = page.getByRole("combobox", { name: "Find the label" });
  await search.fill("Pursuit Double Oak Spirit");
  await expect(page.getByRole("option", { name: /^Pursuit Spirits Double Oak Spirit/ })).toBeVisible();
  await search.press("Enter");
  await expect(page.getByLabel("Price Paid")).toBeFocused();
}

/** The values a text field offers from past entries. */
const suggested = (page: import("@playwright/test").Page, field: string) =>
  page.locator(`datalist#bottle-${field}-suggestions option`).evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value),
  );

test("free-text fields offer past entries, and a haul's own entries straight away", async ({ page }) => {
  const picker = `Bourbon Club ${stamp()}`;
  await page.goto("/bottles/add");
  await pickSeededLabel(page);
  await page.getByLabel("Private Selection").check();
  // Stores are offered as pickers before anything has been typed.
  expect(await suggested(page, "pickedBy")).toContain("P.Club by Pursuit Spirits");
  await page.getByLabel("Picked By").fill(picker);
  await page.getByRole("button", { name: "Save and add another" }).click();
  await expect(page.getByText(/This haul: 1 bottle/)).toBeVisible();

  await pickSeededLabel(page);
  await page.getByLabel("Private Selection").check();
  expect((await suggested(page, "pickedBy"))[0]).toBe(picker);

  // And the bottle forms elsewhere offer it from the database.
  await page.goto("/bottles/new");
  await page.getByLabel("Private Selection").check();
  expect(await suggested(page, "pickedBy")).toContain(picker);
});

test("a haul becomes a group, and bottles added after join it", async ({ page }) => {
  const name = `Haul ${stamp()}`;
  await page.goto("/bottles/add");
  await pickSeededLabel(page);
  await page.getByLabel("Price Paid").fill("50");
  await page.getByRole("button", { name: "Save and add another" }).click();
  await expect(page.getByText(/This haul: 1 bottle/)).toBeVisible();

  await page.getByRole("button", { name: "Make this haul a group" }).click();
  const groupName = page.getByLabel("Group name");
  await expect(groupName).toHaveValue(/^Haul, /);
  await groupName.fill(name);
  // Enter makes the group; it must not submit the bottle form around it.
  await groupName.press("Enter");
  await expect(page.getByRole("link", { name })).toBeVisible();
  await expect(page.getByText("Bottles you add from here go in it too.")).toBeVisible();

  await pickSeededLabel(page);
  await page.getByLabel("Price Paid").fill("60");
  await page.getByRole("button", { name: "Save, last of the haul" }).click();
  await expect(page.getByRole("heading", { name: "That’s the haul." })).toBeVisible();
  await expect(page.getByText("2 bottles")).toBeVisible();

  await page.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/groups\/\d+$/);
  await expect(page.getByRole("button", { name: /^Remove .* from this group$/ })).toHaveCount(2);
});
