import { expect, test, type Locator, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import { assertThrowawayDatabase, seedTournamentField } from "./support/tournament-field";

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
  await seedTournamentField();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.goto("/bulk-editor");
  await expect(page.getByRole("grid", { name: "Bulk editor" })).toBeVisible();
  // Which cells can be edited depends on the view, and it is remembered in the browser; start from both on.
  await page.evaluate(() => window.localStorage.removeItem("bulk-editor:view"));
});

const sheet = (page: Page) => page.getByRole("grid", { name: "Bulk editor" });
const editors = (page: Page) => sheet(page).locator("input");

/** The column's position in the sheet, from its header, so the specs do not depend on the default column order. */
async function col(page: Page, header: string): Promise<number> {
  const names = await sheet(page).locator("thead tr:last-child th").allTextContents(); // textContent: innerText would be the uppercased text the headers are drawn in
  const index = names.findIndex((name) => name.trim() === header);
  expect(index, `no "${header}" column`).toBeGreaterThanOrEqual(0);
  return index;
}
const cell = (page: Page, row: number, column: number): Locator => sheet(page).locator(`td[data-r="${row}"][data-c="${column}"]`);
async function active(page: Page): Promise<{ row: number; col: number } | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.matches("td[data-r]") ? { row: Number(el.dataset.r), col: Number(el.dataset.c) } : null;
  });
}

/** A saved row is saved once the sheet has stopped saying so; the value then survives a reload. */
async function reloaded(page: Page) {
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(800); // the sheet reads the saves back
  await page.reload();
  await expect(sheet(page)).toBeVisible();
}

test("shows the bottles as text, and mounts an editor only when one is wanted", async ({ page }) => {
  const price = await col(page, "Price paid");
  await expect(editors(page)).toHaveCount(0);
  await cell(page, 1, price).click();
  await expect(cell(page, 1, price)).toHaveAttribute("aria-selected", "true");
  await expect(editors(page)).toHaveCount(0);
  await page.keyboard.type("5");
  await expect(editors(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(editors(page)).toHaveCount(0);
});

test("typing replaces a value, Enter keeps it and drops to the next row in the same column", async ({ page }) => {
  const price = await col(page, "Price paid");
  await cell(page, 1, price).click();
  await page.keyboard.type("52");
  await expect(editors(page)).toHaveValue("52");
  await page.keyboard.press("Enter");
  await expect(cell(page, 1, price)).toHaveText("$52.00");
  expect(await active(page)).toEqual({ row: 2, col: price });
  // A saved row saves as soon as the cell is finished: it is still there after a reload.
  await reloaded(page);
  await expect(cell(page, 1, price)).toHaveText("$52.00");
});

test("Tab skips what cannot be edited, and Enter returns to the column the run started in", async ({ page }) => {
  const [price, store, purchased] = [await col(page, "Price paid"), await col(page, "Store"), await col(page, "Purchased")];
  expect(store).toBe(price + 1);
  await cell(page, 3, price).click();
  await page.keyboard.type("30");
  await page.keyboard.press("Tab");
  // Store is a pick-list for a later step, so the run goes straight to Purchased.
  expect(await active(page)).toEqual({ row: 3, col: purchased });
  await page.keyboard.press("Enter");
  await expect(editors(page)).toHaveCount(1);
  await page.keyboard.type("11012025");
  await page.keyboard.press("Enter");
  await expect(cell(page, 3, purchased)).toHaveText("Nov 1, 2025");
  // Enter after a run of Tabs goes back to where the run began.
  expect(await active(page)).toEqual({ row: 4, col: price });
});

test("Escape cancels, a bad value stays open and says why, and a leading decimal point is kept", async ({ page }) => {
  const price = await col(page, "Price paid");
  const before = await cell(page, 5, price).innerText();
  await cell(page, 5, price).click();
  await page.keyboard.type("999");
  await page.keyboard.press("Escape");
  await expect(cell(page, 5, price)).toHaveText(before);
  expect(await active(page)).toEqual({ row: 5, col: price });

  await page.keyboard.type("-5");
  await page.keyboard.press("Enter");
  await expect(editors(page)).toHaveCount(1);
  // Inside the sheet: Next has an alert of its own for route changes.
  await expect(sheet(page).getByRole("alert")).toContainText("At least 0");
  await page.keyboard.press("Escape");

  await cell(page, 6, price).click();
  await page.keyboard.type(".5");
  await page.keyboard.press("Enter");
  await expect(cell(page, 6, price)).toHaveText("$0.50");
});

test("Delete clears a cell and that is saved too", async ({ page }) => {
  const price = await col(page, "Price paid");
  await cell(page, 2, price).click();
  await page.keyboard.type("44");
  await page.keyboard.press("Enter");
  await expect(cell(page, 2, price)).toHaveText("$44.00");
  await cell(page, 2, price).click();
  await page.keyboard.press("Delete");
  await expect(cell(page, 2, price)).toHaveText("—");
  await reloaded(page);
  await expect(cell(page, 2, price)).toHaveText("—");
});

test("a label's own facts are read-only on a bottle row, and editable when the row is the label", async ({ page }) => {
  const proof = await col(page, "Proof");
  await cell(page, 1, proof).click();
  await page.keyboard.press("Enter");
  await page.keyboard.type("123");
  await expect(editors(page)).toHaveCount(0);
  await expect(cell(page, 1, proof).locator("span[title]").first()).toHaveAttribute("title", "Triple-click to edit");

  await page.getByRole("button", { name: "Bottles", exact: true }).click();
  const msrp = await col(page, "MSRP");
  await cell(page, 1, msrp).click();
  await page.keyboard.type("59.99");
  await page.keyboard.press("Enter");
  await expect(cell(page, 1, msrp)).toHaveText("$59.99");
});

test("the arrow keys move, and Tab off the last cell leaves the sheet", async ({ page }) => {
  await cell(page, 2, 3).click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  expect(await active(page)).toEqual({ row: 3, col: 4 });
  await page.keyboard.press("Control+End");
  const last = await active(page);
  expect(last?.col).toBe((await sheet(page).locator("thead tr:last-child th").count()) - 1);
  await page.keyboard.press("Tab");
  expect(await active(page)).toBeNull();
});

test("Brand and Label stay put while the sheet scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  const left = (n: number) => sheet(page).locator("thead tr:last-child th").nth(n).evaluate((el) => Math.round(el.getBoundingClientRect().left - (el.closest("div")?.getBoundingClientRect().left ?? 0)));
  const [brand, name] = [await left(0), await left(1)];
  await sheet(page).evaluate((table) => {
    (table.parentElement as HTMLElement).scrollLeft = 400;
  });
  expect([await left(0), await left(1)]).toEqual([brand, name]);
});

// ---------------------------------------------------------------------------
// New rows: the Brand, Label and Category autocompletes (nothing is saved yet)
// ---------------------------------------------------------------------------

const combo = (page: Page) => page.getByRole("combobox");
const lastRow = async (page: Page) => (await sheet(page).locator("tbody tr").count()) - 1;

test("the empty row at the bottom is live: Tab takes an existing brand and moves to its Label", async ({ page }) => {
  const [brand, label] = [await col(page, "Brand"), await col(page, "Label")];
  const row = await lastRow(page);
  await expect(cell(page, row, brand)).toContainText("Add a bottle");
  const existing = (await cell(page, 0, brand).innerText()).trim();

  await cell(page, row, brand).click();
  await page.keyboard.type(existing.slice(0, 4));
  await expect(page.getByRole("option").first()).toContainText(existing);
  await page.keyboard.press("Tab");
  await expect(cell(page, row, brand)).toContainText(existing);
  expect(await active(page)).toEqual({ row, col: label });
  // A fresh empty row appears below, so there is always one to type into.
  await expect(sheet(page).locator("tbody tr")).toHaveCount(row + 2);
});

test("a typo never makes a brand: Tab is blocked, Enter on Create makes it, and clicking away makes nothing", async ({ page }) => {
  const brand = await col(page, "Brand");
  const row = await lastRow(page);

  await cell(page, row, brand).click();
  await page.keyboard.type("Zzyzx Distilling");
  await expect(page.getByRole("option", { name: /Create/ })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(combo(page)).toHaveCount(1); // still open
  await expect(page.getByRole("alert").filter({ hasText: "Press Enter to create" })).toBeVisible();

  await page.keyboard.press("Escape");
  await cell(page, row, brand).click();
  await page.keyboard.type("Zzyzx Distilling");
  await sheet(page).locator("th").first().click(); // click away
  await expect(combo(page)).toHaveCount(0);
  await expect(cell(page, row, brand)).toContainText("Add a bottle");

  await cell(page, row, brand).click();
  await page.keyboard.type("Zzyzx Distilling");
  await page.keyboard.press("Enter");
  await expect(cell(page, row, brand)).toContainText("Zzyzx Distilling");
  await expect(cell(page, row, brand)).toContainText("new");
  await expect(page.getByRole("status")).toContainText("1 row not saved yet");
});

test("a new label under a new brand takes its category from the closed list, and Discard removes the row", async ({ page }) => {
  const [brand, label, category] = [await col(page, "Brand"), await col(page, "Label"), await col(page, "Category")];
  const row = await lastRow(page);
  await cell(page, row, brand).click();
  await page.keyboard.type("Zzyzx Distilling");
  await page.keyboard.press("Enter");
  expect(await active(page)).toEqual({ row, col: label });
  await page.keyboard.type("Cask One");
  await page.keyboard.press("Enter");
  expect(await active(page)).toEqual({ row, col: category });
  await page.keyboard.type("bou");
  await expect(page.getByRole("option").first()).toContainText("Bourbon");
  await page.keyboard.press("Tab");
  await expect(cell(page, row, category)).toContainText("Bourbon");

  await page.getByRole("button", { name: "Discard" }).click();
  await expect(cell(page, row, brand)).toContainText("Add a bottle");
});

// ---------------------------------------------------------------------------
// Label fields and bottle fields: locks, and moving a bottle
// ---------------------------------------------------------------------------

test("a label's fact is locked on a bottle row; triple-click opens it and says how many bottles it changes", async ({ page }) => {
  const proof = await col(page, "Proof");
  await expect(cell(page, 1, proof).locator("svg")).toHaveCount(1);
  await page.keyboard.type("5"); // nothing is focused on the sheet yet
  await cell(page, 1, proof).click({ clickCount: 3 });
  await expect(cell(page, 1, proof)).toContainText(/all \d+/);
  await page.keyboard.press("Enter");
  await expect(page.getByText(/^Changes \d+ bottles?$/)).toBeVisible();
  await page.keyboard.type("101");
  await page.keyboard.press("Enter");
  await expect(cell(page, 1, proof)).toContainText("101");
  // Saved for the label, so every bottle on it; after a reload the cell is locked again and holds the new value.
  await reloaded(page);
  await expect(cell(page, 1, proof)).toContainText("101");
  await expect(cell(page, 1, proof).locator("span[title]").first()).toHaveAttribute("title", "Triple-click to edit");
});

test("Bottles only shows no label facts, and Brand moves a bottle to a label that exists, never a new one", async ({ page }) => {
  await page.getByRole("button", { name: "Labels", exact: true }).click();
  const names = await sheet(page).locator("thead tr:last-child th").allTextContents();
  expect(names.map((n) => n.trim())).not.toContain("Proof");
  await cell(page, 0, 0).click();
  await page.keyboard.press("Enter");
  await page.keyboard.type("zzzzzz");
  await expect(page.getByRole("option", { name: /Create/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // Move it to the label on the last saved row (the one after it is the empty row for a new bottle).
  const last = (await lastRow(page)) - 1;
  const target = `${(await cell(page, last, 0).innerText()).trim()} ${(await cell(page, last, 1).innerText()).trim()}`;
  const moved = (await cell(page, last, 1).innerText()).trim();
  const countOf = async () => (await sheet(page).locator("tbody tr td:nth-child(2)").allTextContents()).filter((t) => t.trim() === moved).length;
  const before = await countOf();
  await page.keyboard.press("Enter");
  await page.keyboard.type(target);
  await page.keyboard.press("Enter");
  // The bottle goes to its label's place at once, and is still there after a reload.
  expect(await countOf()).toBe(before + 1);
  await reloaded(page);
  expect(await countOf()).toBe(before + 1);
});

/** Brand and Label text of a row, for telling rows apart. */
const rowName = async (page: Page, row: number) =>
  `${(await cell(page, row, 0).locator(".truncate").first().innerText()).trim()} ${(await cell(page, row, 1).locator(".truncate").first().innerText()).trim()}`;
const scrollTop = (page: Page) => sheet(page).evaluate((table) => (table.parentElement as HTMLElement).scrollTop);

test("Enter after moving a bottle drops to the row that was below it, and the view stays where it was", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  const below = await rowName(page, 1);
  const target = await rowName(page, (await lastRow(page)) - 1);
  expect(target).not.toBe(await rowName(page, 0));
  await cell(page, 0, 0).click();
  await page.keyboard.press("Enter");
  await page.keyboard.type(target);
  await page.keyboard.press("Enter");
  const at = await active(page);
  expect(at?.col).toBe(0);
  // The cursor is on what was the second row, now first; the moved bottle is down in its label's place.
  expect(await rowName(page, at!.row)).toBe(below);
  expect(await rowName(page, 0)).toBe(below); // the moved bottle has left the top
  expect(await scrollTop(page)).toBe(0);
});

test("Tab after moving a bottle stays with its row, and the view goes with it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  const label = await col(page, "Label");
  const target = await rowName(page, (await lastRow(page)) - 1);
  expect(target).not.toBe(await rowName(page, 0));
  await cell(page, 0, 0).click();
  await page.keyboard.press("Enter");
  await page.keyboard.type(target);
  await page.keyboard.press("Tab");
  const at = await active(page);
  expect(at?.col).toBe(label);
  expect(await rowName(page, at!.row)).toBe(target); // the same bottle, in its new place
  expect(at!.row).toBeGreaterThan(3); // and that place is a long way down
  await expect(cell(page, at!.row, label)).toBeInViewport();
});

// ---------------------------------------------------------------------------
// Saving as you go
// ---------------------------------------------------------------------------

/** The corner notice: always in the page so it is announced when text appears, and never focused. */
const notice = (page: Page) => page.locator('[aria-live="polite"]').last();

test("a new row with no category is outlined only after the cursor leaves it, and the notice names what it needs", async ({ page }) => {
  const [brand, category] = [await col(page, "Brand"), await col(page, "Category")];
  const row = await lastRow(page);
  await cell(page, row, brand).click();
  await page.keyboard.type("Quincy Distilling");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Rough Draft");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape"); // on the Category cell, left empty
  await expect(notice(page)).toHaveText(""); // still in the row: nothing is said
  await cell(page, 0, brand).click(); // leave it
  await expect(notice(page)).toContainText("Quincy Distilling Rough Draft cannot save until you select a category");
  await expect(cell(page, row, category)).toContainText("Needs a category");
  await expect(cell(page, row, brand).locator(".sr-only")).toHaveText("Cannot save");
  expect(await page.evaluate(() => document.activeElement?.closest('[aria-live="polite"]') !== null)).toBe(false);
  await page.getByRole("button", { name: "Go to it" }).click();
  expect(await active(page)).toEqual({ row, col: category });
  await page.keyboard.press("Enter");
  await page.keyboard.type("bou");
  await page.keyboard.press("Tab");
  await cell(page, 0, brand).click();
  await expect(notice(page)).toHaveText("", { timeout: 10_000 });
});

test("a complete new row saves when the cursor leaves it, and is a saved row after a reload", async ({ page }) => {
  const [brand, price] = [await col(page, "Brand"), await col(page, "Price paid")];
  const row = await lastRow(page);
  await cell(page, row, brand).click();
  await page.keyboard.type("Pennywise Spirits");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Saved Straight Away");
  await page.keyboard.press("Enter");
  await page.keyboard.type("bou");
  await page.keyboard.press("Tab");
  await cell(page, row + 1, brand).click(); // the empty row below: leaves this one
  await reloaded(page);
  const names = await sheet(page).locator("tbody tr td:nth-child(2)").allTextContents();
  expect(names.filter((n) => n.includes("Saved Straight Away"))).toHaveLength(1);
  await expect(sheet(page).locator("tbody tr").last().locator("td").first()).toContainText("Add a bottle");
  void price;
});

test("the view follows a saved row to where it sorts, but never while the next row is being typed", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 560 }); // short enough that the sorted place is off screen
  const brand = await col(page, "Brand");
  const row = await lastRow(page);
  await cell(page, row, brand).scrollIntoViewIfNeeded();
  await cell(page, row, brand).click();
  await page.keyboard.type("Aaa Follows Me");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Found Again");
  await page.keyboard.press("Enter");
  await page.keyboard.type("bou");
  await page.keyboard.press("Tab");
  await cell(page, row + 1, brand).click(); // leave the row: it saves, and sorts to the top
  await page.keyboard.type("Zed"); // and start the next one
  await page.waitForTimeout(3000); // long enough for the save to be read back
  // The editor for the next row is still open, in view, with what was typed: nothing was taken from under it.
  await expect(combo(page)).toHaveValue("Zed");
  await expect(combo(page)).toBeInViewport();
  await page.keyboard.press("Escape");
  // Once the typing stops the view goes to the saved row.
  await expect(sheet(page).locator("tbody tr", { hasText: "Found Again" })).toBeInViewport({ timeout: 15_000 });
});
