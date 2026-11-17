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

test("a photo link is sent with the bottle, and a failed upload is said on its page", async ({ page }) => {
  await page.goto("/bottles/add");
  const search = page.getByRole("combobox", { name: "Find the label" });
  await search.fill("Pursuit Double Oak");
  await expect(page.getByRole("option", { name: /Double Oak Spirit/ })).toBeVisible();
  await search.press("Enter");
  await expect(page.getByText(/You have \d+ bottles? of this/)).toBeVisible();

  // A private address is refused by the server, so the bottle saves without it.
  await page.getByLabel("Or a link to a photo").fill("http://127.0.0.1/bottle.jpg");
  await page.getByRole("button", { name: "Save bottle" }).click();

  await expect(page).toHaveURL(/\/bottles\/\d+\?photos=failed$/);
  await expect(page.getByText("The bottle saved, but its photos didn't upload.", { exact: false })).toBeVisible();
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

  const months = page.locator("#expression-ageMonths");
  const years = page.locator("#expression-ageYears");
  const statement = page.locator("#expression-ageStatement");
  await months.fill("63");
  await months.press("Tab");
  await expect(years).toHaveValue("5");
  await expect(months).toHaveValue("3");
  await expect(statement).not.toBeEditable();
  await statement.click({ clickCount: 3 });
  await expect(statement).toBeEditable();
  await statement.fill("Blend of 5 to 8 years");
  await expect(years).not.toBeEditable();
  await years.click({ clickCount: 3 });
  await expect(years).toBeEditable();

  await page.getByLabel("Distillery not disclosed").check();
  await page.getByLabel("States or provinces").fill("KY, IN, TN");
  await page.getByRole("button", { name: "Add location" }).click();
  await page.getByLabel("Country", { exact: true }).fill("Scotland");
  await page.getByRole("button", { name: "Add location" }).click();
  await page.getByLabel("Country", { exact: true }).fill("Canada");

  await page.getByLabel("Upload label photo").setInputFiles(path.join(__dirname, "fixtures", "bottle.jpg"));
  await expect(page.getByRole("img", { name: "Label photo preview" })).toBeVisible();
  const fill = page.getByRole("slider", { name: "Fill level" });
  await fill.press("ArrowLeft");
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("open");


  await page.getByRole("button", { name: "Save label and bottle" }).click();
  await expect(page).toHaveURL(/\/bottles\/\d+$/);

  await expect(page.getByRole("img", { name: `Pursuit Spirits ${name}` })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuenow", "95");
  for (const place of ["Kentucky", "Indiana", "Tennessee", "Scotland", "Canada"]) {
    await expect(page.getByText(`Undisclosed (${place})`, { exact: true })).toBeVisible();
  }

  // The new label is on file, and the search finds it next time.
  await page.goto("/bottles/add");
  await search.fill(name);
  await expect(page.getByRole("option", { name: new RegExp(name) })).toBeVisible();
});

test("the label suggests matching recipes and distilleries and carries the brand company into creation", async ({ page }) => {
  await page.goto("/bottles/add");
  await page.getByRole("combobox", { name: "Find the label" }).fill("Pursuit Test Blend");
  await page.getByRole("option", { name: "New label: Pursuit Spirits · Test Blend" }).click();

  const chooseCategory = async (name: string) => {
    await page.getByRole("combobox", { name: "Category" }).click();
    await page.locator("[cmdk-input]").fill(name);
    await page.getByRole("option", { name: new RegExp(`^${name} in `) }).click();
  };
  await chooseCategory("Rye");
  const addMashbill = page.getByRole("combobox", { name: "Add mashbills" });
  await addMashbill.click();
  await expect(page.getByRole("option", { name: /78% Corn/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await chooseCategory("Bourbon");
  await addMashbill.click();
  await page.getByRole("option", { name: /78% Corn/ }).click();
  await page.getByRole("button", { name: "Bardstown Bourbon Company", exact: true }).click();
  await expect(page.getByRole("group", { name: "Distilleries", exact: true })).toContainText("Bardstown Bourbon Company");

  await page.getByRole("combobox", { name: "Add distilleries" }).click();
  await page.locator("[cmdk-input]").fill("Tennessee");
  await page.getByRole("option", { name: /Tennessee Distilling Ltd/ }).click();
  const suggestedMashbill = page.getByRole("button", { name: /80% Corn/ });
  await suggestedMashbill.click();
  await expect(page.getByRole("group", { name: "Mashbills", exact: true })).toContainText("80% Corn");

  await page.getByRole("combobox", { name: "Add distilleries" }).click();
  await page.locator("[cmdk-input]").fill("Pursuit Spirits Distillery");
  await page.getByRole("option", { name: /Create with details Pursuit Spirits Distillery/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: "Company" })).toContainText("Pursuit Spirits");
  await expect(dialog.getByLabel("Scotch Region")).toBeHidden();
  await expect(dialog.getByLabel("DSP Number")).toBeVisible();
  await dialog.getByLabel("Country", { exact: true }).fill("Scotland");
  await expect(dialog.getByLabel("Scotch Region")).toBeVisible();
  await expect(dialog.getByLabel("DSP Number")).toBeHidden();
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

test("free-text fields offer past entries", async ({ page }) => {
  const picker = `Bourbon Club ${stamp()}`;
  await page.goto("/bottles/add");
  await pickSeededLabel(page);
  await page.getByLabel("Private Selection").check();
  // Stores are offered as pickers before anything has been typed.
  expect(await suggested(page, "pickedBy")).toContain("P.Club by Pursuit Spirits");
  await page.getByLabel("Picked By").fill(picker);
  await page.getByRole("button", { name: "Save bottle" }).click();
  await expect(page).toHaveURL(/\/bottles\/\d+$/);

  await page.goto("/bottles/add");
  await pickSeededLabel(page);
  await page.getByLabel("Private Selection").check();
  expect(await suggested(page, "pickedBy")).toContain(picker);

  // And the bottle forms elsewhere offer it from the database.
  await page.goto("/bottles/new");
  await page.getByLabel("Private Selection").check();
  expect(await suggested(page, "pickedBy")).toContain(picker);
});
