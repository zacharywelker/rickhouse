import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import { assertThrowawayDatabase, seedTournamentField } from "./support/tournament-field";

/** The right-click menu on a bulk editor row. Each test uses its own seeded label (Quillon, Brevard, ...), so none depends on another. */

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
  // Which cells exist depends on the view, and it is remembered in the browser; start from both on.
  await page.evaluate(() => window.localStorage.removeItem("bulk-editor:view"));
  await page.reload();
  await expect(page.getByRole("grid", { name: "Bulk editor" })).toBeVisible();
});

const sheet = (page: Page) => page.getByRole("grid", { name: "Bulk editor" });
const menu = (page: Page) => page.getByRole("menu");
const rowOf = (page: Page, label: string): Locator => sheet(page).locator("tbody tr", { hasText: label });

async function col(page: Page, header: string): Promise<number> {
  const names = await sheet(page).locator("thead tr:last-child th").allTextContents(); // textContent: innerText would be the uppercased text the headers are drawn in
  const index = names.findIndex((name) => name.trim() === header);
  expect(index, `no "${header}" column`).toBeGreaterThanOrEqual(0);
  return index;
}
const labelCell = async (page: Page, label: string) => rowOf(page, label).locator("td").nth(await col(page, "Label"));
async function active(page: Page): Promise<{ row: number; col: number } | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.matches("td[data-r]") ? { row: Number(el.dataset.r), col: Number(el.dataset.c) } : null;
  });
}

/** How many bottles a label has, and whether the label itself exists, straight from the database. */
async function inDatabase(name: string): Promise<{ labels: number; bottles: number }> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    const [row] = await sql<{ labels: string; bottles: string }[]>`
      SELECT count(DISTINCT e.id)::text AS labels, count(b.id)::text AS bottles
      FROM expressions e LEFT JOIN bottles b ON b.expression_id = e.id WHERE e.name = ${name}`;
    return { labels: Number(row!.labels), bottles: Number(row!.bottles) };
  } finally {
    await sql.end();
  }
}

test("right-click on a bottle row opens the app's menu with the two deletes, and Escape puts the cursor back on that cell", async ({ page }) => {
  const cell = await labelCell(page, "Tamsin");
  // Read before the menu opens: while it is open the page behind it is hidden from role queries.
  const [r, c] = [Number(await cell.getAttribute("data-r")), Number(await cell.getAttribute("data-c"))];
  await cell.click({ button: "right" });
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole("menuitem", { name: /Delete label/ })).toBeVisible();
  await expect(menu(page).getByRole("menuitem", { name: /Delete bottle/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  expect(await active(page)).toEqual({ row: r, col: c });
});

test("Shift+F10 opens the menu on the cursor's row", async ({ page }) => {
  const cell = await labelCell(page, "Ostrava");
  await cell.click();
  await page.keyboard.press("Shift+F10");
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole("menuitem", { name: /Delete bottle/ })).toBeVisible();
});

test("right-click on the row's checkbox opens that row's menu", async ({ page }) => {
  await rowOf(page, "Corbett").locator('input[type="checkbox"]').click({ button: "right" });
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole("menuitem", { name: /Delete label/ })).toBeVisible();
});

test("right-click inside an open cell editor shows no app menu", async ({ page }) => {
  const cell = await labelCell(page, "Marlow");
  await cell.click();
  await page.keyboard.press("Enter");
  const editor = sheet(page).locator("input:not([type=checkbox])").first();
  await expect(editor).toBeVisible();
  await editor.click({ button: "right" });
  await expect(menu(page)).toHaveCount(0);
});

test("Delete bottle asks, then removes the bottle and keeps the label", async ({ page }) => {
  expect(await inDatabase("Quillon")).toEqual({ labels: 1, bottles: 1 });
  await (await labelCell(page, "Quillon")).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: /Delete bottle/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Delete 1 bottle?");
  await expect(dialog).toContainText(/Its label stays/);
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => inDatabase("Quillon")).toEqual({ labels: 1, bottles: 0 });
});

test("Delete label from a bottle row names the bottles that go with it, deletes them, and the rows are gone after the refresh", async ({ page }) => {
  expect(await inDatabase("Brevard")).toEqual({ labels: 1, bottles: 1 });
  await (await labelCell(page, "Brevard")).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: /Delete label/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Delete 1 label and the 1 bottle on it.");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => inDatabase("Brevard")).toEqual({ labels: 0, bottles: 0 });
  await expect(rowOf(page, "Brevard")).toHaveCount(0);
});

test("the empty row at the bottom shows Discard new row, dimmed, and no deletes", async ({ page }) => {
  const last = sheet(page).locator("tbody tr").last();
  await last.locator("td").first().click({ button: "right" });
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole("menuitem", { name: "Discard new row" })).toHaveAttribute("aria-disabled", "true");
  await expect(menu(page).getByRole("menuitem", { name: /Delete (label|bottle)/ })).toHaveCount(0);
});

test("Discard new row removes a started new row and leaves the saved ones alone", async ({ page }) => {
  const brand = await col(page, "Brand");
  const rows = sheet(page).locator("tbody tr");
  const last = rows.last();
  await last.locator("td").nth(brand).click();
  await page.keyboard.type("Tz");
  await expect(page.getByRole("listbox").getByRole("option").first()).toContainText("Tz");
  await page.keyboard.press("Enter");
  // The row has a brand now, so it is a started new row and a fresh empty row has appeared below it.
  const started = await rows.count();
  await rows.nth(started - 2).locator("td").nth(brand).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Discard new row" }).click();
  await expect(rows).toHaveCount(started - 1);
  expect(await inDatabase("Tamsin")).toEqual({ labels: 1, bottles: 1 });
});

// ---------------------------------------------------------------------------
// Insert record below
// ---------------------------------------------------------------------------

const insertBelow = async (page: Page, label: string, nth = 0) => {
  await (await labelCell(page, label)).nth(nth).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Insert record below" }).click();
};
const rowIndex = async (row: Locator) => Number(await row.locator("td").first().getAttribute("data-r"));

test("Insert record below puts a new row directly under the clicked one, with its brand and label, and the cursor on it", async ({ page }) => {
  const rows = rowOf(page, "Penhall");
  const at = await rowIndex(rows);
  const before = await sheet(page).locator("tbody tr").count();
  await insertBelow(page, "Penhall");
  await expect(sheet(page).locator("tbody tr")).toHaveCount(before + 1);
  await expect(rows).toHaveCount(2);
  expect(await rowIndex(rows.nth(1))).toBe(at + 1);
  // The new row is a draft: it has no checkbox. Its brand is the same.
  await expect(rows.nth(0).locator('input[type="checkbox"]')).toHaveCount(1);
  await expect(rows.nth(1).locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(rows.nth(1)).toContainText("Tz");
  expect((await active(page))?.row).toBe(at + 1);
});

test("in the Labels-only view Insert fills only the brand", async ({ page }) => {
  await page.getByRole("group", { name: "What the sheet shows" }).getByRole("button", { name: "Bottles", exact: true }).click();
  const at = await rowIndex(rowOf(page, "Ravenel"));
  await insertBelow(page, "Ravenel");
  const created = sheet(page).locator(`tbody tr:has(td[data-r="${at + 1}"])`);
  await expect(created).toContainText("Tz");
  await expect(created).not.toContainText("Ravenel");
});

test("a row inserted and never typed in is not saved, and does not count as unsaved", async ({ page }) => {
  expect(await inDatabase("Marlow")).toEqual({ labels: 1, bottles: 1 });
  await insertBelow(page, "Marlow");
  // Leave it: a new row that has what it needs saves when the cursor goes.
  await sheet(page).locator('tbody tr td[data-r="0"]').first().click();
  await page.waitForTimeout(2500);
  expect(await inDatabase("Marlow")).toEqual({ labels: 1, bottles: 1 });
  await expect(page.getByText(/not saved yet/)).toHaveCount(0);
});

test("typing a value in an inserted row saves a new bottle of that label, which sits with its label after a reload", async ({ page }) => {
  expect(await inDatabase("Ostrava")).toEqual({ labels: 1, bottles: 1 });
  const at = await rowIndex(rowOf(page, "Ostrava"));
  await insertBelow(page, "Ostrava");
  await sheet(page).locator(`td[data-r="${at + 1}"][data-c="${await col(page, "Price paid")}"]`).click();
  await page.keyboard.type("45");
  await page.keyboard.press("Enter");
  await sheet(page).locator('tbody tr td[data-r="0"]').first().click();
  await expect.poll(() => inDatabase("Ostrava")).toEqual({ labels: 1, bottles: 2 });
  await page.reload();
  const rows = rowOf(page, "Ostrava");
  await expect(rows).toHaveCount(2);
  expect((await rowIndex(rows.nth(1))) - (await rowIndex(rows.nth(0)))).toBe(1);
});

test("inserting twice under one row puts both directly below it", async ({ page }) => {
  const rows = rowOf(page, "Tamsin");
  const at = await rowIndex(rows);
  await insertBelow(page, "Tamsin");
  await insertBelow(page, "Tamsin");
  await expect(rows).toHaveCount(3);
  expect([await rowIndex(rows.nth(0)), await rowIndex(rows.nth(1)), await rowIndex(rows.nth(2))]).toEqual([at, at + 1, at + 2]);
});

test("an inserted row stays directly below its row while the sheet is sorted", async ({ page }) => {
  await sheet(page).locator("thead").getByRole("button", { name: /Proof/ }).first().click();
  const rows = rowOf(page, "Corbett");
  const at = await rowIndex(rows);
  await insertBelow(page, "Corbett");
  await expect(rows).toHaveCount(2);
  expect(await rowIndex(rows.nth(1))).toBe(at + 1);
});
