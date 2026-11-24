import { expect, test, type Page } from "@playwright/test";
import { openNewLabelForm } from "./support/new-label";
import { MEMBER, signIn, signOut } from "./support/auth";
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
  await expect(page.getByRole("img", { name: /Double Oak Spirit fill: / })).toBeVisible();
});

/** The M4 acceptance criterion. */
test("filtering by a distillery finds the blends it contributed to", async ({ page }) => {
  const soloName = `Finger Lakes Solo ${stamp()}`;

  // A second expression made by Finger Lakes alone. The seeded Pursuit bottle
  // is a blend of Bardstown, Tennessee Distilling and Finger Lakes.
  await openNewLabelForm(page);
  await pick(page, "Brand", "Pursuit Spirits");
  await pick(page, "Category", "Bourbon");
  await page.getByLabel("Label Name").fill(soloName);
  await page.getByLabel("Proof", { exact: true }).fill("92");
  await pick(page, "Add distilleries", "Finger Lakes", "Finger Lakes Distilling");
  await page.getByRole("button", { name: "Create Label", exact: true }).click();
  await expect(page).toHaveURL(/\/expressions\/\d+$/);

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

test("a hand-picked group's id in the URL shows only its bottles, and an id that is not yours shows none", async ({ page }) => {
  await page.goto("/groups/new");
  await page.getByLabel("Name").fill("Shelf one");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/groups\/\d+/);
  const groupId = new URL(page.url()).pathname.match(/\/groups\/(\d+)/)![1];
  const bottle = page.getByRole("link", { name: "Double Oak Spirit", exact: true });
  // A page that crashed would also show no bottle, so each "none" below also needs the Collection to have rendered.
  const collection = page.getByRole("heading", { name: "Collection", level: 1 });

  // An empty group shows nothing.
  await page.goto(`/bottles?group=${groupId}`);
  await expect(collection).toBeVisible();
  await expect(bottle).toHaveCount(0);

  // Put the seeded bottle in it, from the bottle's own page.
  await page.goto("/bottles");
  await bottle.click();
  await page.getByRole("button", { name: "Add to group" }).click();
  await page.getByText("Shelf one").click();
  await expect(page.getByRole("link", { name: "Shelf one" })).toBeVisible();

  await page.goto(`/bottles?group=${groupId}`);
  await expect(bottle).toBeVisible();

  // A group id that does not exist for this account matches nothing.
  await page.goto("/bottles?group=999999");
  await expect(collection).toBeVisible();
  await expect(bottle).toHaveCount(0);

  // An id too big for the database is read as "no group" (the plain Collection), not a server error.
  await page.goto("/bottles?group=9999999999");
  await expect(collection).toBeVisible();
  await expect(bottle).toBeVisible();
});

test("another account's real group id shows none of your bottles and no error", async ({ page }) => {
  // The member makes a group; the admin (who owns the seeded bottle) then asks for it by id.
  await signOut(page);
  await signIn(page, MEMBER.username);
  await page.goto("/groups/new");
  await page.getByLabel("Name").fill("Member shelf");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/groups\/\d+/);
  const theirGroup = new URL(page.url()).pathname.match(/\/groups\/(\d+)/)![1];

  await signOut(page);
  await signIn(page);
  await page.goto(`/bottles?group=${theirGroup}`);
  await expect(page.getByRole("heading", { name: "Collection", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Double Oak Spirit", exact: true })).toHaveCount(0);
});
