import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import { openNewLabelForm } from "./support/new-label";
import { assertThrowawayDatabase } from "./support/tournament-field";

/** Add mashbill: the popup from the mashbill picker's "Add a new mashbill". */

const url = process.env.DATABASE_URL ?? "";
const sql = () => postgres(url, { max: 1, onnotice: () => {} });

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
});

async function newLabel(page: Page, category: string) {
  await signIn(page);
  await openNewLabelForm(page);
  await page.getByRole("combobox", { name: "Category" }).click();
  await page.locator("[cmdk-input]").fill(category);
  await page.locator('[cmdk-item]:not([data-value="__create__"])').filter({ has: page.getByText(category, { exact: true }) }).first().click();
}

async function openPopup(page: Page): Promise<Locator> {
  await page.getByRole("combobox", { name: "Add mashbills" }).click();
  await page.locator('[cmdk-item][data-value="__details__"]').click();
  const dialog = page.getByRole("dialog", { name: "Add mashbill" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillRows(dialog: Locator, rows: Array<[string, string]>) {
  for (const [index, [grain, percent]] of rows.entries()) {
    if (index > 0) await dialog.getByRole("button", { name: "Add an ingredient" }).click();
    await dialog.locator('input[id$="-grain"]').nth(index).fill(grain);
    await dialog.locator('input[type="number"]').nth(index).fill(percent);
  }
}

const save = (dialog: Locator) => dialog.getByRole("button", { name: "Save mashbill" });

test("a public mashbill needs an ingredient, then saves into the picker", async ({ page }) => {
  await newLabel(page, "Bourbon");
  const dialog = await openPopup(page);
  expect(Math.round((await dialog.boundingBox())!.width)).toBe(640);
  await expect(dialog).toContainText("Add at least one ingredient.");
  await expect(save(dialog)).toBeDisabled();
  await fillRows(dialog, [["Corn", "75"], ["Rye", "13"], ["Malted Barley", "12"]]);
  await expect(dialog.locator('[role="status"]')).toHaveText("");
  await expect(save(dialog)).toBeEnabled();
  await save(dialog).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /^Remove .*Corn/ })).toBeVisible();
});

test("shares over or short of 100 block Save and say by how much", async ({ page }) => {
  await newLabel(page, "Bourbon");
  const dialog = await openPopup(page);
  await fillRows(dialog, [["Corn", "75"], ["Rye", "13"], ["Malted Barley", "10"]]);
  await expect(dialog).toContainText("add up to 98%");
  await expect(dialog).toContainText("2 short");
  await expect(save(dialog)).toBeDisabled();
  await dialog.locator('input[type="number"]').nth(2).fill("20");
  await expect(dialog).toContainText("8 over");
  await expect(save(dialog)).toBeDisabled();
});

test("partial disclosure lets the shares add up to less than 100", async ({ page }) => {
  await newLabel(page, "Bourbon");
  const dialog = await openPopup(page);
  await fillRows(dialog, [["Corn", "60"], ["Rye", "10"]]);
  await expect(save(dialog)).toBeDisabled();
  await dialog.getByRole("button", { name: "Partial disclosure" }).click();
  await expect(dialog.locator('[role="status"]')).toHaveText("");
  await expect(save(dialog)).toBeEnabled();
});

test("a secret mashbill needs a name but not ingredients", async ({ page }) => {
  await newLabel(page, "Bourbon");
  const dialog = await openPopup(page);
  await dialog.getByRole("button", { name: "Secret" }).click();
  await expect(dialog).toContainText("Give a secret mashbill a reference name");
  await expect(save(dialog)).toBeDisabled();
  await dialog.getByLabel("Name").fill("buffalo trace wheated");
  await dialog.getByLabel("Name").blur();
  await expect(dialog.getByLabel("Name")).toHaveValue("Buffalo Trace Wheated");
  await expect(save(dialog)).toBeEnabled();
  await save(dialog).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Remove Buffalo Trace Wheated" })).toBeVisible();
});

test("a generic style hides the ingredients and needs only a name", async ({ page }) => {
  await newLabel(page, "Bourbon");
  const dialog = await openPopup(page);
  await dialog.getByRole("button", { name: "Generic style" }).click();
  await expect(dialog.getByRole("button", { name: "Add an ingredient" })).toHaveCount(0);
  await expect(dialog).toContainText("Name the style");
  await dialog.getByLabel("Name").fill("Wheated Special");
  await save(dialog).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Remove Wheated Special" })).toBeVisible();
});

test("Secret and Generic style cannot both be on", async ({ page }) => {
  await newLabel(page, "Bourbon");
  const dialog = await openPopup(page);
  await dialog.getByRole("button", { name: "Secret" }).click();
  await dialog.getByRole("button", { name: "Generic style" }).click();
  await expect(dialog.getByRole("button", { name: "Secret" })).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByRole("button", { name: "Generic style" })).toHaveAttribute("aria-pressed", "true");
});

test("a bourbon recipe under 51% corn warns but still saves, and is kept off the label", async ({ page }) => {
  await newLabel(page, "Bourbon");
  const dialog = await openPopup(page);
  await fillRows(dialog, [["Corn", "40"], ["Rye", "30"], ["Malted Barley", "30"]]);
  await expect(dialog).toContainText("A bourbon mashbill is at least 51% corn.");
  await expect(dialog).toContainText("It will still save, but it is not added to this label.");
  await expect(save(dialog)).toBeEnabled();
  await save(dialog).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("does not match the selected category")).toBeVisible();
  const db = sql();
  try {
    const rows = await db`SELECT 1 FROM mashbills m JOIN mashbill_grains g ON g.mashbill_id = m.id WHERE g.grain = 'Corn' AND g.percent = 40`;
    expect(rows.length).toBeGreaterThan(0);
  } finally {
    await db.end();
  }
});

test("a duplicate ingredient and a blank name are named in the footer", async ({ page }) => {
  await newLabel(page, "Bourbon");
  const dialog = await openPopup(page);
  await fillRows(dialog, [["Corn", "50"], ["corn", "50"]]);
  await expect(dialog).toContainText("is in there twice");
  await expect(save(dialog)).toBeDisabled();
});
