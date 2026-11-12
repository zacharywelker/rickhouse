import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
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
/** The open cell editors (the row checkboxes are inputs too). */
const editors = (page: Page) => sheet(page).locator("input:not([type=checkbox])");

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
  // The Store cell is a pick-list now, so the run goes on to it, and past it to Purchased.
  expect(await active(page)).toEqual({ row: 3, col: store });
  await page.keyboard.press("Tab");
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

/** The open autocomplete's box (the page also has the Sort select, which is a combobox too). */
const combo = (page: Page) => sheet(page).getByRole("combobox");
const lastRow = async (page: Page) => (await sheet(page).locator("tbody tr").count()) - 1;

test("the empty row at the bottom is live: Tab takes an existing brand and moves to its Label", async ({ page }) => {
  const [brand, label] = [await col(page, "Brand"), await col(page, "Label")];
  const row = await lastRow(page);
  await expect(cell(page, row, brand)).toContainText("Add a bottle");
  const existing = (await cell(page, 0, brand).innerText()).trim();

  await cell(page, row, brand).click();
  await page.keyboard.type(existing.slice(0, 4));
  await expect(page.getByRole("listbox").getByRole("option").first()).toContainText(existing);
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
  await expect(page.getByRole("listbox").getByRole("option", { name: /Create/ })).toBeVisible();
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
  await expect(page.getByRole("listbox").getByRole("option").first()).toContainText("Bourbon");
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
  await expect(page.getByRole("listbox").getByRole("option", { name: /Create/ })).toHaveCount(0);
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

// ---------------------------------------------------------------------------
// Finding rows: search, filters, sort
// ---------------------------------------------------------------------------

const searchBox = (page: Page) => page.getByRole("searchbox", { name: "Search the sheet" });
const countLine = (page: Page) => page.getByText(/^(Showing \d+ of \d+ |\d+ )(bottles|labels)$/).first();
/** The saved rows' Label cells (not the empty row at the bottom). */
const labelNames = async (page: Page) => (await sheet(page).locator("tbody tr td:nth-child(2)").allTextContents()).map((t) => t.trim()).slice(0, -1);

test("search narrows the sheet and the count says how many of how many; the empty row stays", async ({ page }) => {
  const all = (await countLine(page).innerText()).match(/^(\d+) /)![1]!;
  const word = (await cell(page, 0, 0).locator(".truncate").first().innerText()).trim().split(" ")[0]!;
  await searchBox(page).fill(word);
  const shown = (await sheet(page).locator("tbody tr").count()) - 1;
  expect(shown).toBeGreaterThan(0);
  await expect(countLine(page)).toHaveText(`Showing ${shown} of ${all} bottles`);
  await expect(sheet(page).locator("tbody tr").last().locator("td").first()).toContainText("Add a bottle");
  await searchBox(page).fill("qqqqqqqq");
  await expect(page.getByText(/match\. Clear the filters/)).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(countLine(page)).toHaveText(`${all} bottles`);
});

test("a row typed while the sheet is filtered stays on screen, and clearing the filter places it normally", async ({ page }) => {
  const word = (await cell(page, 0, 0).locator(".truncate").first().innerText()).trim().split(" ")[0]!;
  await searchBox(page).fill(word);
  const brand = await col(page, "Brand");
  const row = await lastRow(page);
  await cell(page, row, brand).click();
  await page.keyboard.type("Zebra Hollow");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Doesnt Match The Search");
  await page.keyboard.press("Enter");
  await page.keyboard.type("bou");
  await page.keyboard.press("Tab");
  await cell(page, row + 1, brand).click(); // leave the row: it saves and joins the saved rows
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(1500); // read back: the saved row is now in the data, and must not be filtered out
  expect((await labelNames(page)).filter((n) => n === "Doesnt Match The Search")).toHaveLength(1);
  await page.getByRole("button", { name: "Clear filters" }).click();
  const names = await labelNames(page);
  expect(names.filter((n) => n === "Doesnt Match The Search")).toHaveLength(1);
  expect(names.length).toBeGreaterThan(2);
});

test("sort by a column, an edited row does not jump, and the header flips it", async ({ page }) => {
  const price = await col(page, "Price paid");
  await page.getByLabel("Sort by").selectOption("pricePaid");
  await expect(sheet(page).locator("th[aria-sort]")).toHaveAttribute("aria-sort", "ascending");
  const values = async () => (await sheet(page).locator(`tbody tr td:nth-child(${price + 1})`).allTextContents()).slice(0, -1).map((t) => Number(t.replace(/[^0-9.]/g, "")) || null);
  const asc = (await values()).filter((v): v is number => v !== null);
  expect(asc).toEqual([...asc].sort((a, b) => a - b));
  // Giving a bottle a price of $1 would put it first in this order, but the row stays where it is, even once saved and read back.
  const before = await labelNames(page);
  await cell(page, 1, price).click();
  await page.keyboard.type("1");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(1500);
  expect(await labelNames(page)).toEqual(before);
  await expect(cell(page, 1, price)).toHaveText("$1.00");
  // Asking for the other direction sorts by what the rows hold now.
  await sheet(page).locator("thead th button", { hasText: "Price paid" }).click();
  await expect(sheet(page).locator("th[aria-sort]")).toHaveAttribute("aria-sort", "descending");
  const desc = (await values()).filter((v): v is number => v !== null);
  expect(desc).toEqual([...desc].sort((a, b) => b - a));
  await page.getByLabel("Sort by").selectOption("");
  await expect(sheet(page).locator("th[aria-sort]")).toHaveCount(0);
});

test("a range filter narrows the sheet, the panel says how many are set, and Clear empties the boxes", async ({ page }) => {
  await page.getByRole("button", { name: "Labels", exact: true }).click(); // bottles alone: where Price paid is offered
  const price = await col(page, "Price paid");
  const total = Number((await countLine(page).innerText()).match(/^(\d+) /)![1]);
  await page.getByRole("button", { name: /^More filters/ }).click();
  await page.getByLabel("Price paid, at least").fill("50");
  const shown = (await sheet(page).locator("tbody tr").count()) - 1;
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(total);
  const prices = (await sheet(page).locator(`tbody tr td:nth-child(${price + 1})`).allTextContents()).slice(0, -1).map((t) => Number(t.replace(/[^0-9.]/g, "")));
  expect(prices.every((p) => p >= 50)).toBe(true);
  await expect(countLine(page)).toHaveText(`Showing ${shown} of ${total} bottles`);
  await expect(page.getByRole("button", { name: /^More filters/ })).toContainText("1");
  await page.getByLabel("Proof, at most").fill("1"); // nothing has a proof that low
  await expect(page.getByText(/match\. Clear the filters/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: /^More filters/ }).click();
  await expect(page.getByLabel("Price paid, at least")).toHaveValue("");
  await expect(page.getByLabel("Proof, at most")).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(countLine(page)).toHaveText(`${total} bottles`);
});

test("age, distillery, mashbill and finish can be sorted, each starting ascending", async ({ page }) => {
  for (const [column, header] of [["age", "Age"], ["distilleries", "Distillery"], ["mashbills", "Mashbill"], ["finishes", "Finish"]] as const) {
    await page.getByLabel("Sort by").selectOption(column);
    const sorted = sheet(page).locator("th[aria-sort]");
    await expect(sorted).toHaveCount(1);
    await expect(sorted).toHaveAttribute("aria-sort", "ascending");
    await expect(sorted).toContainText(header);
    // The direction button, then another column: that one starts ascending again.
    await page.getByLabel(/Ascending: switch/).click();
    await expect(sorted).toHaveAttribute("aria-sort", "descending");
  }
});

test("store and price paid are offered only when looking at bottles alone; in the other views they are off", async ({ page }) => {
  const total = Number((await countLine(page).innerText()).match(/^(\d+) /)![1]);
  const panel = async () => {
    await page.getByRole("button", { name: /^More filters/ }).click();
  };
  // Labels and Bottles together: neither is offered.
  await expect(page.getByRole("button", { name: "Filter by store" })).toHaveCount(0);
  await panel();
  await expect(page.getByLabel("Price paid, at least")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Bottles alone: both are, and one narrows the sheet.
  await page.getByRole("button", { name: "Labels", exact: true }).click();
  await expect(page.getByRole("button", { name: "Filter by store" })).toBeVisible();
  await panel();
  await page.getByLabel("Price paid, at least").fill("50");
  await page.keyboard.press("Escape");
  const narrowed = await countLine(page).innerText();
  expect(narrowed).toMatch(new RegExp(`^Showing \\d+ of ${total} bottles$`));

  // Back to both: it is off, not applied and not counted, and the sheet is whole again.
  await page.getByRole("button", { name: "Labels", exact: true }).click();
  await expect(countLine(page)).toHaveText(`${total} bottles`);
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^More filters/ })).not.toContainText("1");

  // And on again: the value was kept.
  await page.getByRole("button", { name: "Labels", exact: true }).click();
  await expect(countLine(page)).toHaveText(narrowed);
});

// ---------------------------------------------------------------------------
// The rail
// ---------------------------------------------------------------------------

const rail = (page: Page) => page.getByRole("complementary", { name: "Row details" });

test("the rail follows the cursor, says where facts come from, and is not a live region", async ({ page }) => {
  await expect(rail(page)).toContainText("Click a cell");
  const last = (await lastRow(page)) - 1;
  const [first, second] = [(await cell(page, 0, 1).locator(".truncate").first().innerText()).trim(), (await cell(page, last, 1).locator(".truncate").first().innerText()).trim()];
  expect(first).not.toBe(second);
  await cell(page, 0, 1).click();
  await expect(rail(page)).toContainText(first);
  await expect(rail(page)).toContainText(/from the label/i);
  await expect(rail(page)).toContainText(/this bottle/i);
  await cell(page, last, 1).click();
  await expect(rail(page)).toContainText(second);
  // By keyboard too.
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowUp");
  // Display only, and never announced: nothing in it can be typed into or is a live region.
  await expect(rail(page).locator("input, textarea, select, [contenteditable]")).toHaveCount(0);
  await expect(rail(page).locator("[aria-live], [role=status], [role=alert], [role=log]")).toHaveCount(0);
  expect(await rail(page).getAttribute("aria-live")).toBeNull();
});

test("the rail can be hidden to a slim tab and shown again, and the choice is remembered", async ({ page }) => {
  await expect(rail(page).getByRole("button", { name: "Hide the details panel" })).toBeVisible(); // open at this width
  await rail(page).getByRole("button", { name: "Hide the details panel" }).click();
  await expect(rail(page).getByRole("button", { name: "Show the details panel" })).toBeVisible();
  expect((await rail(page).boundingBox())!.width).toBeLessThan(50);
  await page.reload();
  await expect(sheet(page)).toBeVisible();
  await expect(rail(page).getByRole("button", { name: "Show the details panel" })).toBeVisible();
  await rail(page).getByRole("button", { name: "Show the details panel" }).click();
  await page.reload();
  await expect(rail(page).getByRole("button", { name: "Hide the details panel" })).toBeVisible();
});

test("the rail starts hidden on a narrower window, until it is chosen", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(rail(page).getByRole("button", { name: "Show the details panel" })).toBeVisible();
  await expect(rail(page).getByRole("button", { name: "Hide the details panel" })).toBeHidden();
  await rail(page).getByRole("button", { name: "Show the details panel" }).click();
  await expect(rail(page).getByRole("button", { name: "Hide the details panel" })).toBeVisible();
});

test("using a filter does not count as clicking away: a finished new row is saved by leaving it, not by that", async ({ page }) => {
  const [brand, label] = [await col(page, "Brand"), await col(page, "Label")];
  const row = await lastRow(page);
  const total = await countLine(page).innerText();
  const [b, l] = [(await cell(page, 0, brand).locator(".truncate").first().innerText()).trim(), (await cell(page, 0, label).locator(".truncate").first().innerText()).trim()];
  await cell(page, row, brand).click();
  await page.keyboard.type(b);
  await page.keyboard.press("Tab");
  await page.keyboard.type(l);
  await page.keyboard.press("Tab"); // an existing label: the row is complete and would save when the cursor leaves it
  await page.getByRole("button", { name: "Filter by category" }).click();
  await page.locator("[data-radix-popper-content-wrapper]").first().getByRole("button").first().click(); // pressing inside the popover
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("status")).toContainText("1 row not saved yet"); // still the new row being entered
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(countLine(page)).toHaveText(total); // nothing was added to the shelf
});

// ---------------------------------------------------------------------------
// On your shelf (in the rail)
// ---------------------------------------------------------------------------

const shelfText = async (page: Page) => ((await rail(page).locator("section", { has: page.getByRole("heading", { name: "On your shelf" }) }).textContent()) ?? "").replace(/\s+/g, " ").trim();
const ORDINALS = ["zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

test("On your shelf: counts from the sheet's own rows, the next bottle's place, and no filter changes a count", async ({ page }) => {
  const [brand, label] = [await col(page, "Brand"), await col(page, "Label")];
  const rows = (await lastRow(page)) ;
  const pairs: Array<[string, string]> = [];
  for (let r = 0; r < rows; r++) pairs.push([(await cell(page, r, brand).locator(".truncate").first().innerText()).trim(), (await cell(page, r, label).locator(".truncate").first().innerText()).trim()]);
  const [b, l] = pairs[0]!;
  const ofBrand = pairs.filter(([x]) => x === b).length;
  const ofLabel = pairs.filter(([x, y]) => x === b && y === l).length;
  const labelCount = new Set(pairs.filter(([x]) => x === b).map(([, y]) => y)).size;

  await cell(page, rows, brand).click();
  await expect.poll(() => shelfText(page)).toContain("Choose a brand");
  await page.keyboard.type(b);
  await page.keyboard.press("Tab");
  await expect.poll(() => shelfText(page)).toContain(`${ofBrand} ${ofBrand === 1 ? "bottle" : "bottles"} from ${labelCount} ${b} ${labelCount === 1 ? "label" : "labels"}`);
  await page.keyboard.type(l);
  await page.keyboard.press("Tab");
  const chosen = await shelfText(page);
  expect(chosen).toContain(`Your ${ORDINALS[ofBrand + 1]} ${b} bottle`);
  expect(chosen).toContain(`${ORDINALS[ofLabel + 1]![0]!.toUpperCase()}${ORDINALS[ofLabel + 1]!.slice(1)} ${l}`);
  expect(chosen).toMatch(/labels? · 1 not saved/); // the summary counts it, as does the label's own row
  expect(chosen).toContain("+ 1 not saved");

  // A filter that hides rows changes no count: the rail says just what it said.
  await page.getByLabel("Sort by").selectOption(""); // (no sort: keep the sheet as it is)
  await searchBox(page).fill("qqqqqqqq");
  expect(await shelfText(page)).toBe(chosen);
  await searchBox(page).fill("");
});

test("On your shelf: a label that is new, and a brand that is new, say so and what saving does", async ({ page }) => {
  const [brand, label] = [await col(page, "Brand"), await col(page, "Label")];
  const row = await lastRow(page);
  const b = (await cell(page, 0, brand).locator(".truncate").first().innerText()).trim();
  await cell(page, row, brand).click();
  await page.keyboard.type(b);
  await page.keyboard.press("Tab");
  await page.keyboard.type("A Label Nobody Has");
  await page.keyboard.press("Enter"); // create it
  await expect.poll(() => shelfText(page)).toContain("New label");
  expect(await shelfText(page)).toContain(`Saving adds it under ${b}`);
  expect(await shelfText(page)).toContain("First A Label Nobody Has");
  await page.keyboard.press("Escape");

  await cell(page, row + 1, brand).click();
  await page.keyboard.type("Brand Nobody Has");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Its First Label");
  await page.keyboard.press("Enter");
  await expect.poll(() => shelfText(page)).toContain("New brand");
  expect(await shelfText(page)).toContain("Saving creates the brand and its first label");
  expect(await shelfText(page)).toContain("Your first Brand Nobody Has bottle");
  void label;
});

// ---------------------------------------------------------------------------
// The form's other fields (parity with the old Bulk add)
// ---------------------------------------------------------------------------

const fieldsButton = (page: Page) => page.getByRole("button", { name: /^Fields/ });
/** Switch columns on in the Fields picker, by the name the picker lists them under. */
async function showColumns(page: Page, ...names: Array<string | RegExp>) {
  await fieldsButton(page).click();
  for (const name of names) await page.getByLabel(name, { exact: typeof name === "string" }).check();
  await page.keyboard.press("Escape");
}
const bothSwitch = (page: Page, name: "Labels" | "Bottles") => page.getByRole("group", { name: "What the sheet shows" }).getByRole("button", { name, exact: true });

test("the form's other fields are columns, grouped by section and hidden until switched on", async ({ page }) => {
  await fieldsButton(page).click();
  for (const group of ["Label: Process", "Label: Rum detail", "Label: Strength and age", "Bottle: Release", "Bottle: Single-barrel detail"]) {
    await expect(page.getByRole("group", { name: group })).toBeVisible();
  }
  await expect(page.getByLabel("Batch", { exact: true })).not.toBeChecked();
  await page.getByLabel("Batch", { exact: true }).check();
  await page.keyboard.press("Escape");
  expect(await sheet(page).locator("thead tr:last-child th").allTextContents().then((t) => t.map((x) => x.trim()))).toContain("Batch");
  await fieldsButton(page).click();
  await page.getByRole("button", { name: "Defaults" }).click(); // back to the shelf columns
  await page.keyboard.press("Escape");
  expect(await sheet(page).locator("thead tr:last-child th").allTextContents().then((t) => t.map((x) => x.trim()))).not.toContain("Batch");
});

test("Cask / Bonded is one cell: a letter picks, it saves, and it is there after a reload", async ({ page }) => {
  await bothSwitch(page, "Bottles").click(); // the label itself: nothing is locked
  const designation = await col(page, "Cask / BiB");
  await cell(page, 0, designation).click();
  await page.keyboard.type("b"); // the first choice starting with B: Bottled in Bond
  await expect(editors(page)).toHaveCount(0); // a choice is a list, not a typed box
  await expect(sheet(page).locator("select")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(cell(page, 0, designation)).toContainText("Bottled in Bond");
  await reloaded(page);
  await expect(cell(page, 0, designation)).toContainText("Bottled in Bond");
});

test("Single barrel / pick: a private pick opens its pick details before it has saved", async ({ page }) => {
  await showColumns(page, "Pick name", "Picked By");
  const [pick, pickName] = [await col(page, "Single barrel / pick"), await col(page, "Pick name")];
  await cell(page, 0, pickName).click();
  await page.keyboard.press("Enter");
  await expect(editors(page)).toHaveCount(0); // not a private pick yet: nothing to type into
  await cell(page, 0, pick).click();
  await page.keyboard.type("p"); // Private pick
  await page.keyboard.press("Enter");
  // A private pick is not a single barrel (it can be a blend of barrels): the cell says only what was chosen.
  await expect(cell(page, 0, pick)).toHaveText("Private pick");
  await cell(page, 0, pickName).click();
  await page.keyboard.press("Enter");
  await expect(editors(page)).toHaveCount(1); // opened at once, before the save was read back
  await page.keyboard.type("Binnys Pick");
  await page.keyboard.press("Enter");
  await reloaded(page);
  await expect(cell(page, 0, pick)).toHaveText("Private pick");
  await expect(cell(page, 0, pickName)).toContainText("Binnys Pick");
});

test("a yes/no cell is flipped with Space, saves, and is cleared with Delete", async ({ page }) => {
  await bothSwitch(page, "Bottles").click();
  await showColumns(page, "Straight");
  const straight = await col(page, "Straight");
  await cell(page, 0, straight).click();
  await page.keyboard.press("Space");
  await expect(cell(page, 0, straight)).toHaveText("Yes");
  await expect(editors(page)).toHaveCount(0); // flipped, not opened
  await reloaded(page);
  await expect(cell(page, 0, straight)).toHaveText("Yes");
  await cell(page, 0, straight).click();
  await page.keyboard.press("Delete");
  await expect(cell(page, 0, straight)).toHaveText("—");
  await reloaded(page);
  await expect(cell(page, 0, straight)).toHaveText("—");
});

test("a field that is not used for this spirit says so and cannot be edited", async ({ page }) => {
  await bothSwitch(page, "Bottles").click();
  await showColumns(page, /^Esters/i);
  const esters = (await sheet(page).locator("thead tr:last-child th").allTextContents()).findIndex((t) => /^esters/i.test(t.trim()));
  expect(esters).toBeGreaterThanOrEqual(0);
  await expect(cell(page, 0, esters).locator("span[title]").first()).toHaveAttribute("title", "Not used for this spirit"); // a bourbon has no esters
  await cell(page, 0, esters).click();
  await page.keyboard.press("Enter");
  await expect(editors(page)).toHaveCount(0);
  await expect(sheet(page).locator("select")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Deleting (these remove rows, so they come last)
// ---------------------------------------------------------------------------

const tick = (page: Page, row: number) => cell(page, row, 0).locator('input[type="checkbox"]');
const deleteBar = (page: Page) => page.getByRole("button", { name: "Delete selected" });
const totalOf = async (page: Page) => Number((await countLine(page).innerText()).match(/(\d+) (bottles|labels)$/)![1]);

test("a ticked row shows a bar with the count; only the bottle is deleted, and its label stays", async ({ page }) => {
  const last = (await lastRow(page)) - 1;
  const label = (await cell(page, last, 1).locator(".truncate").first().innerText()).trim();
  const before = await totalOf(page);
  await expect(deleteBar(page)).toHaveCount(0);
  await tick(page, last).check();
  await expect(page.getByText("1 bottle selected")).toBeVisible();
  await deleteBar(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Delete 1 bottle?");
  await expect(dialog).toContainText(/Its label stays, even if this was the last bottle on it\./);
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(countLine(page)).toHaveText(`${before - 1} bottles`);
  // The label is still there: look at the labels.
  await page.getByRole("group", { name: "What the sheet shows" }).getByRole("button", { name: "Bottles", exact: true }).click();
  await expect(sheet(page).locator("tbody tr td:nth-child(2)", { hasText: label }).first()).toBeVisible();
});

test("in the Labels-only view the confirmation names the bottles that go with a label, and they are deleted", async ({ page }) => {
  await page.getByRole("group", { name: "What the sheet shows" }).getByRole("button", { name: "Bottles", exact: true }).click();
  const countCol = await col(page, "Bottles");
  const labels = await totalOf(page);
  // A label that has bottles.
  let target = -1;
  let bottlesOn = 0;
  for (let r = 0; r < (await lastRow(page)); r++) {
    const n = Number((await cell(page, r, countCol).innerText()).trim());
    if (n > 0) { target = r; bottlesOn = n; break; }
  }
  expect(target).toBeGreaterThanOrEqual(0);
  await tick(page, target).check();
  await expect(page.getByText("1 label selected")).toBeVisible();
  await deleteBar(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(`Delete 1 label and the ${bottlesOn} ${bottlesOn === 1 ? "bottle" : "bottles"} on it.`);
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(countLine(page)).toHaveText(`${labels - 1} labels`);
});

test("only rows that can be seen are counted or deleted: a ticked row that is filtered out is left alone", async ({ page }) => {
  await tick(page, 0).check();
  await expect(page.getByText("1 bottle selected")).toBeVisible();
  await searchBox(page).fill("qqqqqqqq");
  await expect(deleteBar(page)).toHaveCount(0); // nothing visible is ticked
  await searchBox(page).fill("");
  await expect(page.getByText("1 bottle selected")).toBeVisible(); // still ticked when it is back
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(deleteBar(page)).toHaveCount(0);
});

test("the header box ticks every row shown, and Shift+Space ticks the row the cursor is on", async ({ page }) => {
  const total = await totalOf(page);
  await page.getByLabel("Select every row shown").check();
  await expect(page.getByText(`${total} bottles selected`)).toBeVisible();
  await page.getByLabel("Select every row shown").uncheck();
  await expect(deleteBar(page)).toHaveCount(0);
  await cell(page, 1, 0).click();
  await page.keyboard.press("Shift+Space");
  await expect(page.getByText("1 bottle selected")).toBeVisible();
  await expect(tick(page, 1)).toBeChecked();
  expect(await sheet(page).locator("input:not([type=checkbox])").count()).toBe(0); // it did not start typing into a cell
});

test("the confirmation does not count as clicking away: a finished new row is not saved by it", async ({ page }) => {
  const [brand, label] = [await col(page, "Brand"), await col(page, "Label")];
  const row = await lastRow(page);
  const [b, l] = [(await cell(page, 0, brand).locator(".truncate").first().innerText()).trim(), (await cell(page, 0, label).locator(".truncate").first().innerText()).trim()];
  await cell(page, row, brand).click();
  await page.keyboard.type(b);
  await page.keyboard.press("Tab");
  await page.keyboard.type(l);
  await page.keyboard.press("Tab"); // a finished row, waiting for the cursor to leave it
  await tick(page, 0).check();
  await deleteBar(page).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("status")).toContainText("1 row not saved yet");
});

// ---------------------------------------------------------------------------
// The picking cells: store, release, label name
// ---------------------------------------------------------------------------

const listbox = (page: Page) => page.getByRole("listbox");

test("a store is picked from the list or made with Enter on Create, never by a typo, and is there after a reload", async ({ page }) => {
  const store = await col(page, "Store");
  await cell(page, 0, store).click();
  await page.keyboard.type("Binnys Beverage");
  // Nothing by that name: the list offers to make it, and says so.
  await expect(listbox(page).getByRole("option", { name: /Create .Binnys Beverage./ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(cell(page, 0, store)).toContainText("Binnys Beverage");
  await expect(cell(page, 0, store)).toContainText("new");
  expect(await active(page)).toEqual({ row: 1, col: store }); // Enter drops down, as in any cell
  await reloaded(page);
  await expect(cell(page, 0, store)).toHaveText("Binnys Beverage");

  // The next rows pick the store that now exists. A slip is only a hint, and Tab takes the close match it names instead of making a store.
  await cell(page, 1, store).click();
  await page.keyboard.type("Binnys Beverag");
  await page.keyboard.press("Tab");
  await expect(cell(page, 1, store)).toHaveText("Binnys Beverage");
  await cell(page, 2, store).click();
  await page.keyboard.type("Binnyz Beverage");
  await expect(listbox(page)).toContainText("close match");
  await page.keyboard.press("Tab");
  await expect(cell(page, 2, store)).toHaveText("Binnys Beverage");
  // Nothing close: Tab neither takes nor makes anything, it says so and stays.
  await cell(page, 3, store).click();
  await page.keyboard.type("Zzzqqq");
  await page.keyboard.press("Tab");
  await expect(editors(page)).toHaveCount(1);
  await expect(listbox(page).locator("xpath=..").getByRole("alert")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cell(page, 3, store)).toHaveText("—");
  await reloaded(page);
  await expect(cell(page, 1, store)).toHaveText("Binnys Beverage");
  await expect(cell(page, 2, store)).toHaveText("Binnys Beverage");
  await expect(cell(page, 3, store)).toHaveText("—");
  // One store, however many bottles are in it.
  const db = postgres(process.env.DATABASE_URL!);
  try {
    expect(Number((await db`select count(*)::int as n from stores where name = 'Binnys Beverage'`)[0]!.n)).toBe(1);
  } finally {
    await db.end();
  }

  // Delete empties it.
  await cell(page, 0, store).click();
  await page.keyboard.press("Delete");
  await expect(cell(page, 0, store)).toHaveText("—");
  await reloaded(page);
  await expect(cell(page, 0, store)).toHaveText("—");
});

test("a release and a label name are picked from the bottle's own label, and cannot be made here", async ({ page }) => {
  await showColumns(page, "Release", "Label Version");
  const [release, version, name] = [await col(page, "Release"), await col(page, "Label Version"), await col(page, "Label")];
  const labelName = (await cell(page, 0, name).innerText()).split("\n")[0]!.trim();
  const db = postgres(process.env.DATABASE_URL!);
  try {
    const [label] = await db`select id from expressions where name = ${labelName} limit 1`;
    await db`insert into expression_releases (expression_id, name) values (${label!.id}, 'Spring 2024 Release')`;
    await db`insert into expression_names (expression_id, name) values (${label!.id}, 'Old Label Name')`;
  } finally {
    await db.end();
  }
  await page.reload();
  await expect(sheet(page)).toBeVisible();

  await cell(page, 0, release).click();
  await page.keyboard.press("Enter");
  await expect(listbox(page).getByRole("option")).toHaveCount(1);
  await expect(listbox(page).getByRole("option", { name: /Create/ })).toHaveCount(0);
  await page.keyboard.type("Spring");
  await page.keyboard.press("Tab");
  await expect(cell(page, 0, release)).toHaveText("Spring 2024 Release");
  await cell(page, 0, version).click();
  await page.keyboard.type("Old");
  await page.keyboard.press("Tab");
  await expect(cell(page, 0, version)).toHaveText("Old Label Name");
  await reloaded(page);
  await expect(cell(page, 0, release)).toHaveText("Spring 2024 Release");
  await expect(cell(page, 0, version)).toHaveText("Old Label Name");

  // A name that is not one of this label's cannot be made here: the list says where it is added.
  await cell(page, 0, release).click();
  await page.keyboard.type("Brand new release");
  await page.keyboard.press("Enter");
  await expect(listbox(page).locator("xpath=..").getByRole("alert")).toBeVisible();
  await expect(listbox(page).locator("xpath=..")).toContainText("added on the label's page");
  await page.keyboard.press("Escape");
  await expect(cell(page, 0, release)).toHaveText("Spring 2024 Release");
});
