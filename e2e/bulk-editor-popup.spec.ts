import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import { assertThrowawayDatabase, seedTournamentField } from "./support/tournament-field";

/**
 * The bulk editor's popup: the real label and bottle pages over the sheet. Each test uses its own seeded label, so none
 * depends on another. While the popup is open Radix hides the page behind it from role queries, so the sheet is found by
 * a CSS selector and the popup by its `data-popup` attribute.
 */

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
  await page.evaluate(() => window.localStorage.removeItem("bulk-editor:view"));
  await page.reload();
  await expect(page.getByRole("grid", { name: "Bulk editor" })).toBeVisible();
});

const sheet = (page: Page) => page.locator('table[aria-label="Bulk editor"]');
const popup = (page: Page) => page.locator("[data-popup]");
const menu = (page: Page) => page.getByRole("menu");
const rowOf = (page: Page, label: string): Locator => sheet(page).locator("tbody tr", { hasText: label });

async function labelColumn(page: Page): Promise<number> {
  const names = await sheet(page).locator("thead tr:last-child th").allTextContents();
  const index = names.findIndex((name) => name.trim() === "Label");
  expect(index, 'no "Label" column').toBeGreaterThanOrEqual(0);
  return index;
}
const labelCell = async (page: Page, label: string) => rowOf(page, label).first().locator("td").nth(await labelColumn(page));

/** The database's own count of a label, its bottles and the tasting notes on them. */
async function counts(name: string): Promise<{ labels: number; bottles: number; tastings: number }> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    const [row] = await sql<{ labels: string; bottles: string; tastings: string }[]>`
      SELECT count(DISTINCT e.id)::text AS labels, count(DISTINCT b.id)::text AS bottles, count(DISTINCT t.id)::text AS tastings
      FROM expressions e LEFT JOIN bottles b ON b.expression_id = e.id LEFT JOIN tasting_notes t ON t.expression_id = e.id
      WHERE e.name = ${name}`;
    return { labels: Number(row!.labels), bottles: Number(row!.bottles), tastings: Number(row!.tastings) };
  } finally {
    await sql.end();
  }
}

async function chooseFromMenu(page: Page, label: string, item: RegExp | string) {
  await (await labelCell(page, label)).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: item }).click();
}

test("Duplicate bottle opens the existing duplicate page in a popup over the sheet, and a hard load shows it as a full page", async ({ page }) => {
  await chooseFromMenu(page, "Quillon", "Duplicate bottle");
  await expect(page).toHaveURL(/\/bottles\/new\?duplicate=\d+/);
  await expect(popup(page)).toBeVisible();
  await expect(popup(page)).toContainText("Duplicate bottle");
  await expect(sheet(page)).toHaveCount(1);
  const url = page.url();
  await page.goto(url);
  await expect(popup(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Duplicate bottle" })).toBeVisible();
});

test("saving the duplicate closes the popup, adds the bottle to the sheet and leaves the original, copying no tasting", async ({ page }) => {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    await sql`INSERT INTO tasting_notes (owner_id, expression_id, bottle_id, rating)
      SELECT b.owner_id, b.expression_id, b.id, 8.5 FROM bottles b JOIN expressions e ON e.id = b.expression_id WHERE e.name = 'Brevard'`;
  } finally {
    await sql.end();
  }
  expect(await counts("Brevard")).toEqual({ labels: 1, bottles: 1, tastings: 1 });
  await chooseFromMenu(page, "Brevard", "Duplicate bottle");
  await expect(popup(page)).toBeVisible();
  await popup(page).getByRole("button", { name: "Add bottle" }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/bulk-editor$/);
  expect(await counts("Brevard")).toEqual({ labels: 1, bottles: 2, tastings: 1 });
  await expect(rowOf(page, "Brevard")).toHaveCount(2);
});

test("Cancel closes the popup; with something typed in, Escape and Cancel both ask first", async ({ page }) => {
  await chooseFromMenu(page, "Tamsin", "Duplicate bottle");
  await expect(popup(page)).toBeVisible();
  await popup(page).locator("textarea").first().fill("a note");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Discard what you entered?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(popup(page)).toBeVisible();
  await popup(page).getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Discard what you entered?" })).toBeVisible();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/bulk-editor$/);
  expect(await counts("Tamsin")).toMatchObject({ bottles: 1 });
});

test("Cancel with nothing typed closes the popup at once", async ({ page }) => {
  await chooseFromMenu(page, "Corbett", "Duplicate bottle");
  await expect(popup(page)).toBeVisible();
  await popup(page).getByRole("button", { name: "Cancel" }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/bulk-editor$/);
});

test("Duplicate bottle is dimmed where a row is a label: in the Labels-only view, where a label with no bottle appears", async ({ page }) => {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    await sql`INSERT INTO expressions (brand_id, category_id, name, slug, owner_id, proof)
      SELECT brand_id, category_id, 'Bottleless', 'tz-e2e-bottleless', owner_id, 100 FROM expressions WHERE name = 'Marlow'`;
  } finally {
    await sql.end();
  }
  await page.reload();
  // With Bottles on the sheet has one row per bottle, so a label with none only shows in the Labels-only view.
  await page.getByRole("group", { name: "What the sheet shows" }).getByRole("button", { name: "Bottles", exact: true }).click();
  await (await labelCell(page, "Bottleless")).click({ button: "right" });
  await expect(menu(page).getByRole("menuitem", { name: "Duplicate bottle" })).toHaveAttribute("aria-disabled", "true");
});

/** Picks an option from a reference picker's list by clicking it, without typing a search (typing would mark the form changed by itself). */
async function pickFromPicker(page: Page, name: string, option: string) {
  await popup(page).getByRole("combobox", { name }).click();
  await page.locator('[cmdk-item]:not([data-value="__create__"])').filter({ hasText: option }).first().click();
}

test("choosing from a picker and then closing the popup asks first, as typing does", async ({ page }) => {
  await chooseFromMenu(page, "Tamsin", "Duplicate bottle");
  await expect(popup(page)).toBeVisible({ timeout: 12_000 });
  await pickFromPicker(page, "Label", "Marlow");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Discard what you entered?" })).toBeVisible({ timeout: 12_000 });
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(popup(page)).toHaveCount(0, { timeout: 12_000 });
});

test("a popup opened and closed without touching anything closes at once", async ({ page }) => {
  await chooseFromMenu(page, "Quillon", "Duplicate bottle");
  await expect(popup(page)).toBeVisible({ timeout: 12_000 });
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0, { timeout: 12_000 });
});
