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

// A popup is a client-side navigation to a page `next dev` may still have to compile.
const slow = expect.configure({ timeout: 12_000 });

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
  await seedTournamentField();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.goto("/bulk-editor");
  await slow(page.getByRole("grid", { name: "Bulk editor" })).toBeVisible();
  await page.evaluate(() => window.localStorage.removeItem("bulk-editor:view"));
  await page.reload();
  await slow(page.getByRole("grid", { name: "Bulk editor" })).toBeVisible();
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
  await slow(page).toHaveURL(/\/bottles\/new\?duplicate=\d+/);
  await slow(popup(page)).toBeVisible();
  await slow(popup(page)).toContainText("Duplicate bottle");
  await slow(sheet(page)).toHaveCount(1);
  const url = page.url();
  await page.goto(url);
  await slow(popup(page)).toHaveCount(0);
  await slow(page.getByRole("heading", { name: "Duplicate bottle" })).toBeVisible();
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
  await slow(popup(page)).toBeVisible();
  await popup(page).getByRole("button", { name: "Add bottle" }).click();
  await slow(popup(page)).toHaveCount(0);
  await slow(page).toHaveURL(/\/bulk-editor$/);
  expect(await counts("Brevard")).toEqual({ labels: 1, bottles: 2, tastings: 1 });
  await slow(rowOf(page, "Brevard")).toHaveCount(2);
});

test("Cancel closes the popup; with something typed in, Escape and Cancel both ask first", async ({ page }) => {
  await chooseFromMenu(page, "Tamsin", "Duplicate bottle");
  await slow(popup(page)).toBeVisible();
  await popup(page).locator("textarea").first().fill("a note");
  await page.keyboard.press("Escape");
  await slow(page.getByRole("dialog", { name: "Discard what you entered?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await slow(popup(page)).toBeVisible();
  await popup(page).getByRole("button", { name: "Cancel" }).click();
  await slow(page.getByRole("dialog", { name: "Discard what you entered?" })).toBeVisible();
  await page.getByRole("button", { name: "Discard" }).click();
  await slow(popup(page)).toHaveCount(0);
  await slow(page).toHaveURL(/\/bulk-editor$/);
  expect(await counts("Tamsin")).toMatchObject({ bottles: 1 });
});

test("Cancel with nothing typed closes the popup at once", async ({ page }) => {
  await chooseFromMenu(page, "Corbett", "Duplicate bottle");
  await slow(popup(page)).toBeVisible();
  await popup(page).getByRole("button", { name: "Cancel" }).click();
  await slow(popup(page)).toHaveCount(0);
  await slow(page).toHaveURL(/\/bulk-editor$/);
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
  await slow(menu(page).getByRole("menuitem", { name: "Duplicate bottle" })).toHaveAttribute("aria-disabled", "true");
});

// ---------------------------------------------------------------------------
// Duplicate label
// ---------------------------------------------------------------------------

test("Duplicate label opens the New Label form filled from the source, with the name empty, in a popup", async ({ page }) => {
  await chooseFromMenu(page, "Ostrava", "Duplicate label");
  await slow(page).toHaveURL(/\/expressions\/new\?duplicate=\d+/);
  await slow(popup(page)).toBeVisible();
  await slow(popup(page)).toContainText("Duplicate label");
  await slow(sheet(page)).toHaveCount(1);
  await slow(popup(page).locator('input[name="name"]')).toHaveValue("");
  await slow(popup(page).locator('input[name="proof"]')).toHaveValue(/115/);
});

test("saving a duplicated label makes one new label with no bottles, and the source keeps its bottle", async ({ page }) => {
  expect(await counts("Penhall")).toMatchObject({ labels: 1, bottles: 1 });
  await chooseFromMenu(page, "Penhall", "Duplicate label");
  await slow(popup(page)).toBeVisible();
  await popup(page).locator('input[name="name"]').fill("Penhall Copy");
  await popup(page).getByRole("button", { name: "Create Label", exact: true }).click();
  await slow(popup(page)).toHaveCount(0);
  await slow(page).toHaveURL(/\/bulk-editor$/);
  expect(await counts("Penhall Copy")).toMatchObject({ labels: 1, bottles: 0 });
  expect(await counts("Penhall")).toMatchObject({ labels: 1, bottles: 1 });
});

test("a duplicate given the source's own name either saves once or says why, and never makes two by accident", async ({ page }) => {
  await chooseFromMenu(page, "Ravenel", "Duplicate label");
  await slow(popup(page)).toBeVisible();
  await popup(page).locator('input[name="name"]').fill("Ravenel");
  await popup(page).getByRole("button", { name: "Create Label", exact: true }).click();
  await page.waitForTimeout(3000);
  const { labels } = await counts("Ravenel");
  if (await popup(page).isVisible()) {
    // Refused: still one label, and the form says so.
    expect(labels).toBe(1);
    await slow(popup(page).getByRole("alert").first()).toBeVisible();
  } else {
    expect(labels).toBe(2);
  }
});

test("duplicating a label that is not there is a not-found page", async ({ page }) => {
  const response = await page.goto("/expressions/new?duplicate=99999999");
  expect(response?.status()).toBe(404);
});

// ---------------------------------------------------------------------------
// Expand record on saved rows
// ---------------------------------------------------------------------------

const views = (page: Page) => page.getByRole("group", { name: "What the sheet shows" });
/** Turns Labels or Bottles off (the other stays on, so the sheet shows only the other). */
const only = async (page: Page, keep: "Labels" | "Bottles") => views(page).getByRole("button", { name: keep === "Labels" ? "Bottles" : "Labels", exact: true }).click();

async function query<T extends Record<string, unknown>>(run: (sql: postgres.Sql) => Promise<T[]>): Promise<T[]> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}
const idsOf = async (name: string) => {
  const [row] = await query<{ label: number; bottle: number }>((sql) => sql`SELECT e.id AS label, min(b.id) AS bottle FROM expressions e LEFT JOIN bottles b ON b.expression_id = e.id WHERE e.name = ${name} GROUP BY e.id`);
  return { label: Number(row!.label), bottle: Number(row!.bottle) };
};

test("Expand in the Labels-only view opens the label's edit page", async ({ page }) => {
  await only(page, "Labels");
  await chooseFromMenu(page, "Marlow", "Expand record");
  await expect(page).toHaveURL(new RegExp(`/expressions/${(await idsOf("Marlow")).label}/edit`));
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).getByRole("button", { name: "Save Label" })).toBeVisible();
  await expect(sheet(page)).toHaveCount(1);
});

test("Expand in the Bottles-only view opens the bottle's edit page", async ({ page }) => {
  await only(page, "Bottles");
  await chooseFromMenu(page, "Quillon", "Expand record");
  await expect(page).toHaveURL(new RegExp(`/bottles/${(await idsOf("Quillon")).bottle}/edit`));
  await expect(popup(page).getByRole("button", { name: "Save bottle" })).toBeVisible();
});

test("Expand in the Both view opens the label, then the bottle, and saving both closes the popup with both changes kept", async ({ page }) => {
  const ids = await idsOf("Tamsin");
  await chooseFromMenu(page, "Tamsin", "Expand record");
  await expect(popup(page)).toContainText("Step 1 of 2");
  await expect(page).toHaveURL(new RegExp(`/expressions/${ids.label}/edit`));
  await popup(page).locator('input[name="proof"]').fill("88");
  await popup(page).getByRole("button", { name: "Save Label" }).click();
  await expect(popup(page)).toContainText("Step 2 of 2");
  await expect(page).toHaveURL(new RegExp(`/bottles/${ids.bottle}/edit`));
  await popup(page).locator("textarea").first().fill("expanded");
  await popup(page).getByRole("button", { name: "Save bottle" }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/bulk-editor$/);
  const [saved] = await query<{ proof: string; notes: string }>((sql) => sql`SELECT e.proof::text AS proof, b.notes FROM expressions e JOIN bottles b ON b.expression_id = e.id WHERE e.id = ${ids.label}`);
  expect(Number(saved!.proof)).toBe(88);
  expect(saved!.notes).toBe("expanded");
});

test("a cell just typed is saved before the popup opens, so the form shows it", async ({ page }) => {
  await only(page, "Bottles");
  const names = await sheet(page).locator("thead tr:last-child th").allTextContents();
  const price = names.findIndex((name) => name.trim() === "Price paid");
  expect(price, 'no "Price paid" column').toBeGreaterThanOrEqual(0);
  const row = rowOf(page, "Corbett").first();
  await row.locator("td").nth(price).click();
  await page.keyboard.type("77");
  await page.keyboard.press("Enter");
  await (await labelCell(page, "Corbett")).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Expand record" }).click();
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).locator('input[name="pricePaid"]')).toHaveValue(/77/);
});

test("a row whose unsaved cell cannot be saved does not open the popup", async ({ page }) => {
  await only(page, "Bottles");
  const names = await sheet(page).locator("thead tr:last-child th").allTextContents();
  const price = names.findIndex((name) => name.trim() === "Price paid");
  // The sheet's saves are server actions posted to its own url: refuse them.
  await page.route((url) => url.pathname === "/bulk-editor", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
  const row = rowOf(page, "Penhall").first();
  await row.locator("td").nth(price).click();
  await page.keyboard.type("66");
  await page.keyboard.press("Enter");
  await (await labelCell(page, "Penhall")).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Expand record" }).click();
  await page.waitForTimeout(2500);
  await expect(popup(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/bulk-editor$/);
});

test("a chained popup url loaded on its own is the full page, as before", async ({ page }) => {
  const ids = await idsOf("Ravenel");
  await page.goto(`/expressions/${ids.label}/edit?next=${encodeURIComponent(`/bottles/${ids.bottle}/edit?step=2&of=2`)}&step=1&of=2`);
  await expect(popup(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Label" })).toBeVisible();
});

test("Expand is not offered on a new row yet", async ({ page }) => {
  const last = sheet(page).locator("tbody tr").last();
  await last.locator("td").first().click({ button: "right" });
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole("menuitem", { name: "Expand record" })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// The pages take a prefill (a new row's typed values)
// ---------------------------------------------------------------------------

/** Puts a prefill in this tab's storage, as the sheet does, and opens a page with its token. */
async function openWithPrefill(page: Page, path: (token: string) => string, prefill: Record<string, unknown>) {
  const token = `t${Date.now()}`;
  await page.evaluate(([t, value]) => window.sessionStorage.setItem(`bulk-editor:prefill:${t}`, JSON.stringify(value)), [token, prefill] as const);
  await page.goto(path(token));
}
const lookup = async (sql: string): Promise<number> => {
  const [row] = await query<{ id: number }>((db) => db.unsafe(sql) as unknown as Promise<{ id: number }[]>);
  return Number(row!.id);
};

test("/expressions/new?prefill= opens the New Label form with the new row's values filled in", async ({ page }) => {
  const brandId = await lookup("SELECT id FROM brands WHERE name = 'Tz'");
  const categoryId = await lookup("SELECT id FROM categories WHERE name = 'Bourbon' LIMIT 1");
  await openWithPrefill(page, (t) => `/expressions/new?prefill=${t}`, { label: { brandId, name: "Prefilled Label", categoryId, proof: "99" }, bottle: {}, dropped: [], newBrand: null });
  await slow(page.locator('input[name="name"]')).toHaveValue("Prefilled Label");
  await slow(page.locator('input[name="proof"]')).toHaveValue(/99/);
  await slow(page.getByRole("button", { name: "Create Label", exact: true })).toBeVisible();
});

test("/bottles/add?prefill= opens the add-bottle page with a new label and the bottle's values filled in", async ({ page }) => {
  const brandId = await lookup("SELECT id FROM brands WHERE name = 'Tz'");
  const categoryId = await lookup("SELECT id FROM categories WHERE name = 'Bourbon' LIMIT 1");
  await openWithPrefill(page, (t) => `/bottles/add?prefill=${t}`, { label: { brandId, name: "Prefilled Both", categoryId }, bottle: { pricePaid: "45" }, dropped: [], newBrand: null });
  await slow(page.locator("#expression-name")).toHaveValue("Prefilled Both");
  await slow(page.locator("#bottle-pricePaid")).toHaveValue(/45/);
});

test("/bottles/add?expression=&prefill= opens with that label chosen and the bottle's values filled in", async ({ page }) => {
  const labelId = (await idsOf("Marlow")).label;
  await openWithPrefill(page, (t) => `/bottles/add?expression=${labelId}&prefill=${t}`, { label: {}, bottle: { pricePaid: "52" }, dropped: [], newBrand: null });
  await slow(page.locator("#bottle-pricePaid")).toHaveValue(/52/);
});

test("without a prefill the pages are as before", async ({ page }) => {
  await page.goto("/expressions/new");
  await slow(page.getByRole("heading", { name: "New Label" })).toBeVisible();
  await page.goto("/bottles/add");
  await slow(page.getByRole("heading", { name: "Add a bottle" })).toBeVisible();
});
