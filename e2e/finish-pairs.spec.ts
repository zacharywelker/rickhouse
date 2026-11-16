import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import { assertThrowawayDatabase } from "./support/tournament-field";
import { openNewLabelForm } from "./support/new-label";

/**
 * The 2026 Blue Note Special Reserve (bluenotebourbon.com): nine components, three mashbills, eight finishes.
 * Building it from empty is the stress test for pairing finishes with mashbills.
 */
const MASHBILLS = ["84/8/8", "70/22/8", "70/21/9"] as const;
const COMPONENTS: Array<{ finish: string; lines: Array<[typeof MASHBILLS[number], number]> }> = [
  { finish: "Cognac", lines: [["84/8/8", 3], ["70/21/9", 12]] },
  { finish: "Madeira", lines: [["70/21/9", 2]] },
  { finish: "Sherry", lines: [["70/22/8", 3]] },
  { finish: "Port", lines: [["84/8/8", 3]] },
  { finish: "Vino de Naranja", lines: [["70/21/9", 41]] },
  { finish: "Vanilla Cognac", lines: [["70/21/9", 15]] },
  { finish: "Apricot Brandy", lines: [["70/21/9", 11]] },
  { finish: "Winter Bock", lines: [["70/21/9", 10]] },
];

const stamp = () => Math.random().toString(36).slice(2, 8);
const url = process.env.DATABASE_URL ?? "";
function sql() {
  assertThrowawayDatabase(url);
  return postgres(url, { max: 1, onnotice: () => {} });
}

test.beforeAll(async () => {
  expect(url, "DATABASE_URL must name the throwaway database the app is running against").not.toBe("");
  await resetDatabase();
  const db = sql();
  try {
    const [admin] = await db<{ id: number }[]>`SELECT id FROM users WHERE username = 'admin'`;
    for (const name of MASHBILLS) await db`INSERT INTO mashbills (owner_id, name, is_secret) VALUES (${admin!.id}, ${name}, true)`;
    for (const { finish } of COMPONENTS) await db`INSERT INTO finishes (owner_id, name, slug) VALUES (${admin!.id}, ${finish}, ${finish.toLowerCase().replace(/\W+/g, "-")})`;
  } finally {
    await db.end();
  }
});
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

const EXISTING_OPTION = '[cmdk-item]:not([data-value="__create__"])';
async function pickFrom(page: Page, comboboxName: string, search: string) {
  await page.getByRole("combobox", { name: comboboxName }).click();
  await page.locator("[cmdk-input]").fill(search);
  await page.locator(EXISTING_OPTION).filter({ has: page.getByText(search, { exact: true }) }).first().click();
}
const finishRow = (page: Page, name: string): Locator => page.locator("li").filter({ has: page.getByRole("button", { name: `Remove ${name}`, exact: true }) });

async function buildBlueNote(page: Page, name: string) {
  await openNewLabelForm(page);
  await pickFrom(page, "Brand", "Pursuit Spirits");
  await pickFrom(page, "Category", "Bourbon");
  await page.getByLabel("Label Name").fill(name);
  for (const mashbill of MASHBILLS) await pickFrom(page, "Add mashbills", mashbill);
  // A share box only appears once there is more than one thing to share between, so add everything first.
  for (const { finish, lines } of COMPONENTS) {
    await pickFrom(page, "Add finishes", finish);
    const row = finishRow(page, finish);
    for (const [index, [mashbill]] of lines.entries()) {
      if (index > 0) await row.getByRole("button", { name: "+ Add mashbill" }).click();
      await row.getByLabel("Mashbill", { exact: true }).nth(index).selectOption({ label: mashbill });
    }
  }
  for (const { finish, lines } of COMPONENTS) {
    const row = finishRow(page, finish);
    for (const [index, [, share]] of lines.entries()) await row.getByLabel(/^Share of /).nth(index).fill(String(share));
  }
}

test("builds the Blue Note Special Reserve from empty, saves it, and reopens it unchanged", async ({ page }) => {
  await buildBlueNote(page, `Blue Note ${stamp()}`);

  // The totals are computed, not typed: 84/8/8 = 6, 70/22/8 = 3, 70/21/9 = 91, and the blend adds to 100.
  await expect(page.getByRole("status").filter({ hasText: "Total of the blend" })).toContainText("100% ✓");
  const mashbillField = page.getByRole("group", { name: "Mashbills" });
  await expect(mashbillField.locator("li").filter({ hasText: "84/8/8" })).toContainText("6%");
  await expect(mashbillField.locator("li").filter({ hasText: "70/22/8" })).toContainText("3%");
  await expect(mashbillField.locator("li").filter({ hasText: "70/21/9" })).toContainText("91%");
  // Cognac is on two mashbills, so its own share is the read-only sum.
  await expect(finishRow(page, "Cognac")).toContainText("Cognac total: 15%");

  // Set E2E_SHOT_DIR to keep a picture of the filled-in fields (used for the pull request).
  if (process.env.E2E_SHOT_DIR) {
    await mashbillField.scrollIntoViewIfNeeded();
    await page.getByRole("group", { name: "Finishes" }).screenshot({ path: `${process.env.E2E_SHOT_DIR}/blue-note-finishes.png` });
    await mashbillField.screenshot({ path: `${process.env.E2E_SHOT_DIR}/blue-note-mashbills.png` });
  }

  await page.getByRole("button", { name: "Create Label", exact: true }).click();
  await expect(page).toHaveURL(/\/expressions\/(\d+)$/);
  const id = Number(page.url().match(/\/expressions\/(\d+)$/)![1]);

  await page.goto(`/expressions/${id}/edit`);
  await expect(page.getByRole("status").filter({ hasText: "Total of the blend" })).toContainText("100% ✓");
  for (const { finish, lines } of COMPONENTS) {
    const row = finishRow(page, finish);
    for (const [index, [mashbill, share]] of lines.entries()) {
      await expect(row.getByLabel("Mashbill", { exact: true }).nth(index)).toHaveValue(await row.getByLabel("Mashbill", { exact: true }).nth(index).locator("option", { hasText: mashbill }).getAttribute("value") ?? "");
      await expect(row.getByLabel(/^Share of /).nth(index)).toHaveValue(String(share));
    }
  }

  const db = sql();
  try {
    const rows = await db<{ count: string }[]>`SELECT count(*)::text FROM expression_finish_mashbills WHERE expression_id = ${id}`;
    expect(Number(rows[0]!.count)).toBe(9);
  } finally {
    await db.end();
  }
});

test("a share total that is not 100 is refused with the difference named", async ({ page }) => {
  await buildBlueNote(page, `Blue Note off ${stamp()}`);
  await finishRow(page, "Winter Bock").getByLabel(/^Share of /).fill("11");
  await expect(page.getByRole("status").filter({ hasText: "Total of the blend" })).toContainText("1 over");
  await page.getByRole("button", { name: "Create Label", exact: true }).click();
  await expect(page).not.toHaveURL(/\/expressions\/\d+$/);
});

test("a label with one mashbill and one finish shows no pairing controls at all", async ({ page }) => {
  await openNewLabelForm(page);
  await pickFrom(page, "Brand", "Pursuit Spirits");
  await pickFrom(page, "Category", "Bourbon");
  await page.getByLabel("Label Name").fill(`Plain ${stamp()}`);
  await pickFrom(page, "Add mashbills", "84/8/8");
  await pickFrom(page, "Add finishes", "Port");
  await expect(page.getByLabel("Mashbill", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(/^Share of /)).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Total of the blend" })).toHaveCount(0);
});

test("pairs survive a category change that hides the finishes field", async ({ page }) => {
  await buildBlueNote(page, `Blue Note moved ${stamp()}`);
  await page.getByRole("button", { name: "Create Label", exact: true }).click();
  await expect(page).toHaveURL(/\/expressions\/(\d+)$/);
  const id = Number(page.url().match(/\/expressions\/(\d+)$/)![1]);

  await page.goto(`/expressions/${id}/edit`);
  await pickFrom(page, "Category", "Vodka");
  await expect(page.getByRole("group", { name: "Finishes" })).toHaveCount(0);
  await page.getByRole("button", { name: "Save Label", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/expressions/${id}$`));

  const db = sql();
  try {
    const rows = await db<{ count: string }[]>`SELECT count(*)::text FROM expression_finish_mashbills WHERE expression_id = ${id}`;
    expect(Number(rows[0]!.count)).toBe(9);
  } finally {
    await db.end();
  }
});
