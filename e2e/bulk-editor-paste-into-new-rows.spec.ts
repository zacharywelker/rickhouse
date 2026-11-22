import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import { assertThrowawayDatabase, seedTournamentField } from "./support/tournament-field";

/** Pasting into a new row. A new row's cells carry a status glyph's text ("Cannot save", "Not saved yet"), so its cells are matched by what they contain. */

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

// CSS keeps the sheet addressable while a menu or dialog hides it from role queries.
const sheet = (page: Page) => page.locator('table[aria-label="Bulk editor"]');
const menu = (page: Page) => page.getByRole("menu");
const rowOf = (page: Page, label: string): Locator => sheet(page).locator("tbody tr", { hasText: label });

async function col(page: Page, header: string): Promise<number> {
  const names = await sheet(page).locator("thead tr:last-child th").allTextContents(); // textContent: innerText would be the uppercased text the headers are drawn in
  const index = names.findIndex((name) => name.trim() === header);
  expect(index, `no "${header}" column`).toBeGreaterThanOrEqual(0);
  return index;
}
const labelCell = async (page: Page, label: string) => rowOf(page, label).locator("td").nth(await col(page, "Label"));
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

const insertBelow = async (page: Page, label: string, nth = 0) => {
  await (await labelCell(page, label)).nth(nth).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Insert record below" }).click();
};
const rowIndex = async (row: Locator) => Number(await row.locator("td").first().getAttribute("data-r"));

/** Pastes text at the cursor, as the browser delivers a Ctrl+V. */
const paste = (page: Page, text: string) =>
  page.evaluate((t) => {
    const data = new DataTransfer();
    data.setData("text/plain", t);
    document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
const pasteNotice = (page: Page) => page.locator("[aria-live=polite]").filter({ hasText: /Pasted|Cleared/ });

const rowAt = (page: Page, index: number) => sheet(page).locator(`tbody tr:has(td[data-r="${index}"])`);
const cell = (page: Page, row: number, column: number) => sheet(page).locator(`td[data-r="${row}"][data-c="${column}"]`);

test("a pasted row fills the inserted row it lands on, which keeps its place and its brand and label", async ({ page }) => {
  const at = await rowIndex(rowOf(page, "Quillon"));
  const [brand, label, price] = [await col(page, "Brand"), await col(page, "Label"), await col(page, "Price paid")];
  await insertBelow(page, "Quillon");
  const before = await sheet(page).locator("tbody tr").count();
  await cell(page, at + 1, price).click();
  await paste(page, "45");
  await expect(cell(page, at + 1, price)).toHaveText("$45.00");
  await expect(cell(page, at + 1, brand)).toContainText("Tz");
  await expect(cell(page, at + 1, label)).toContainText("Quillon");
  expect(await rowIndex(rowOf(page, "Quillon").nth(1))).toBe(at + 1);
  await expect(sheet(page).locator("tbody tr")).toHaveCount(before);
  await expect(pasteNotice(page)).toContainText("Pasted 1 cell");
  await expect(pasteNotice(page)).not.toContainText("Added");
  expect(await inDatabase("Quillon")).toEqual({ labels: 1, bottles: 1 });
});

test("a pasted row fills a new row that was typed, and a blank pasted cell leaves what it has", async ({ page }) => {
  const [brand, label, category] = [await col(page, "Brand"), await col(page, "Label"), await col(page, "Category")];
  const at = await rowIndex(sheet(page).locator("tbody tr").last());
  const typedLabel = "Brevard Typed";
  await cell(page, at, brand).click();
  await page.keyboard.type("Tz");
  await page.keyboard.press("Enter");
  await expect(cell(page, at, brand)).toContainText("Tz");
  await cell(page, at, label).click();
  await page.keyboard.type(typedLabel);
  await expect(page.locator('[role="option"]').filter({ hasText: 'Create “Brevard Typed”' })).toBeVisible();
  // TODO(verify): Confirm the Create option's quotation marks and that Enter chooses it without leaving this draft.
  await page.keyboard.press("Enter");
  await expect(cell(page, at, label)).toContainText(typedLabel);
  const before = await sheet(page).locator("tbody tr").count();
  expect(category).toBe(brand + 2);
  await cell(page, at, brand).click();
  await paste(page, "\t\t77");
  await expect(cell(page, at, brand)).toContainText("Tz");
  await expect(cell(page, at, label)).toContainText(typedLabel);
  await expect(cell(page, at, label)).not.toContainText("Choose");
  // TODO(verify): In Both view the third column is Category; confirm Task 3 intends 77 to wait here as category text, rather than a numeric column.
  await expect(cell(page, at, category)).toContainText("77");
  await expect(cell(page, at, category)).toContainText("Choose");
  await expect(sheet(page).locator("tbody tr")).toHaveCount(before);
  expect(await inDatabase(typedLabel)).toEqual({ labels: 0, bottles: 0 });
  expect(await inDatabase("Brevard")).toEqual({ labels: 1, bottles: 1 });
});

test("pasting at the empty row still makes new rows, the first at the empty row's place", async ({ page }) => {
  const [brand, label] = [await col(page, "Brand"), await col(page, "Label")];
  const rows = sheet(page).locator("tbody tr");
  const before = await rows.count();
  const at = await rowIndex(rows.last());
  await cell(page, at, brand).click();
  await paste(page, "Tz\tTamsin Paste One\nTz\tTamsin Paste Two");
  await expect(pasteNotice(page)).toContainText("Added 2 new rows");
  await expect(rows).toHaveCount(before + 2);
  for (const [offset, name] of ["Tamsin Paste One", "Tamsin Paste Two"].entries()) {
    await expect(cell(page, at + offset, brand)).toContainText("Tz");
    await expect(cell(page, at + offset, label)).toContainText(name);
    await expect(cell(page, at + offset, label)).toContainText("Choose");
    expect(await rowIndex(rowOf(page, name))).toBe(at + offset);
    expect(await inDatabase(name)).toEqual({ labels: 0, bottles: 0 });
  }
  expect(await rowIndex(rows.last())).toBe(at + 2);
  expect(await inDatabase("Tamsin")).toEqual({ labels: 1, bottles: 1 });
});

test("one paste across a saved row, an inserted row and past the end does each in order", async ({ page }) => {
  // Tamsin is the last saved row, so a row inserted below it sits directly above the empty row at the bottom.
  const at = await rowIndex(rowOf(page, "Tamsin"));
  const price = await col(page, "Price paid");
  await insertBelow(page, "Tamsin");
  const before = await sheet(page).locator("tbody tr").count();
  await cell(page, at, price).click();
  // Four rows: the saved row, the inserted row, the empty row, and one past the end.
  await paste(page, "41\n42\n43\n44");
  for (const [offset, value] of ["$41.00", "$42.00", "$43.00", "$44.00"].entries()) {
    await expect(cell(page, at + offset, price)).toHaveText(value);
  }
  // The empty row and the row past it were made, so two more rows (and a fresh empty one) than before.
  await expect(sheet(page).locator("tbody tr")).toHaveCount(before + 2);
  await expect(rowOf(page, "Tamsin")).toHaveCount(2);
  expect(await rowIndex(rowOf(page, "Tamsin").nth(1))).toBe(at + 1);
  await expect(pasteNotice(page)).toContainText("Pasted 2 cells");
  await expect(pasteNotice(page)).toContainText("Added 2 new rows");
  expect(await inDatabase("Tamsin")).toEqual({ labels: 1, bottles: 1 });
});

test("a pasted brand different from the inserted row's clears its label and keeps its place", async ({ page }) => {
  const at = await rowIndex(rowOf(page, "Marlow"));
  const [brand, label, category] = [await col(page, "Brand"), await col(page, "Label"), await col(page, "Category")];
  await insertBelow(page, "Marlow");
  const before = await sheet(page).locator("tbody tr").count();
  await expect(cell(page, at + 1, category)).toHaveText("Bourbon");
  await cell(page, at + 1, brand).click();
  await paste(page, "Pursuit Spirits"); // Existing brand supplied by resetDatabase's example seed.
  await expect(cell(page, at + 1, brand)).toContainText("Pursuit Spirits");
  await expect(cell(page, at + 1, label)).toContainText("—");
  await expect(cell(page, at + 1, category)).toContainText("—");
  expect(await rowIndex(rowAt(page, at + 1))).toBe(at + 1);
  expect(await rowIndex(rowOf(page, "Marlow"))).toBe(at);
  await expect(sheet(page).locator("tbody tr")).toHaveCount(before);
  await expect(pasteNotice(page)).toContainText("Pasted 1 cell");
  expect(await inDatabase("Marlow")).toEqual({ labels: 1, bottles: 1 });
});

test("a pasted label that does not exist waits to be chosen on the row it lands on, replacing what was waiting there", async ({ page }) => {
  const at = await rowIndex(rowOf(page, "Ostrava"));
  const label = await col(page, "Label");
  await insertBelow(page, "Ostrava");
  const before = await sheet(page).locator("tbody tr").count();
  await cell(page, at + 1, label).click();
  await paste(page, "Ostrava Waiting First");
  await expect(cell(page, at + 1, label)).toContainText("Ostrava Waiting First");
  await expect(cell(page, at + 1, label)).toContainText("Choose");
  await paste(page, "Ostrava Waiting Second");
  await expect(cell(page, at + 1, label)).toContainText("Ostrava Waiting Second");
  await expect(cell(page, at + 1, label)).toContainText("Choose");
  await expect(cell(page, at + 1, label)).not.toContainText("Ostrava Waiting First");
  await expect(sheet(page).locator("tbody tr")).toHaveCount(before);
  expect(await inDatabase("Ostrava Waiting First")).toEqual({ labels: 0, bottles: 0 });
  expect(await inDatabase("Ostrava Waiting Second")).toEqual({ labels: 0, bottles: 0 });
  expect(await inDatabase("Ostrava")).toEqual({ labels: 1, bottles: 1 });
});

test("a paste into an inserted row whose label exists saves nothing until the cursor leaves it", async ({ page }) => {
  const at = await rowIndex(rowOf(page, "Penhall"));
  const price = await col(page, "Price paid");
  expect(await inDatabase("Penhall")).toEqual({ labels: 1, bottles: 1 });
  await insertBelow(page, "Penhall");
  await cell(page, at + 1, price).click();
  await paste(page, "45");
  await expect(cell(page, at + 1, price)).toHaveText("$45.00");
  await expect(pasteNotice(page)).toContainText("Pasted 1 cell");
  await expect(cell(page, at + 1, price)).toBeFocused();
  // TODO(verify): Choose a deterministic idle/save barrier for proving that no delayed save happens while focus stays on this row.
  await page.waitForTimeout(2500); // Same observation window as the row-menu unsaved-insert spec.
  expect(await inDatabase("Penhall")).toEqual({ labels: 1, bottles: 1 });
  await cell(page, at, price).click();
  await expect.poll(() => inDatabase("Penhall"), { timeout: 15000 }).toEqual({ labels: 1, bottles: 2 });
  await page.reload();
  await expect(rowOf(page, "Penhall")).toHaveCount(2);
  await expect(rowOf(page, "Penhall").nth(1).locator("td").nth(price)).toHaveText("$45.00");
});

test("ten rows pasted at the empty row after two inserts give ten rows with keys of their own", async ({ page }) => {
  const [brand, label] = [await col(page, "Brand"), await col(page, "Label")];
  await insertBelow(page, "Ravenel");
  await insertBelow(page, "Ravenel");
  const insertedAt = await rowIndex(rowOf(page, "Ravenel").first());
  const rows = sheet(page).locator("tbody tr");
  const before = await rows.count();
  const at = await rowIndex(rows.last());
  const names = Array.from({ length: 10 }, (_, i) => `Ravenel Paste ${i + 1}`);
  await cell(page, at, brand).click();
  await paste(page, names.map((name) => `Tz\t${name}`).join("\n"));
  await expect(pasteNotice(page)).toContainText("Added 10 new rows");
  await expect(rows).toHaveCount(before + 10);
  for (const [offset, name] of names.entries()) {
    await expect(cell(page, at + offset, brand)).toContainText("Tz");
    await expect(cell(page, at + offset, label)).toContainText(name);
    await expect(cell(page, at + offset, label)).toContainText("Choose");
    expect(await rowIndex(rowAt(page, at + offset))).toBe(at + offset);
    expect(await inDatabase(name)).toEqual({ labels: 0, bottles: 0 });
  }
  for (const offset of [1, 2]) {
    await expect(cell(page, insertedAt + offset, brand)).toContainText("Tz");
    await expect(cell(page, insertedAt + offset, label)).toContainText("Ravenel");
  }
  expect(await rowIndex(rows.last())).toBe(at + 10);
  expect(await inDatabase("Ravenel")).toEqual({ labels: 1, bottles: 1 });
});
