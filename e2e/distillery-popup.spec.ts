import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import { openNewLabelForm } from "./support/new-label";
import { assertThrowawayDatabase } from "./support/tournament-field";

/** Add distillery: the popup from a distillery picker's "Create with details", and the name-only create beside it. */

const url = process.env.DATABASE_URL ?? "";
const sql = () => postgres(url, { max: 1, onnotice: () => {} });

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
  const db = sql();
  try {
    const [admin] = await db<{ id: number }[]>`SELECT id FROM users WHERE username = 'admin'`;
    await db`INSERT INTO distilleries (owner_id, name, slug, country) VALUES (${admin!.id}, 'Far North Spirits', 'far-north-spirits', 'USA')`;
  } finally {
    await db.end();
  }
});

async function newLabel(page: Page, category: string) {
  await signIn(page);
  await openNewLabelForm(page);
  await page.getByRole("combobox", { name: "Category" }).click();
  await page.locator("[cmdk-input]").fill(category);
  await page.locator('[cmdk-item]:not([data-value="__create__"])').filter({ has: page.getByText(category, { exact: true }) }).first().click();
}

async function openPopup(page: Page, typed: string) {
  await page.getByRole("combobox", { name: "Add distilleries" }).click();
  await page.locator("[cmdk-input]").fill(typed);
  await page.locator('[cmdk-item][data-value="__details__"]').click();
  await expect(page.getByRole("dialog", { name: "Add distillery" })).toBeVisible();
}

test("a bourbon label's popup takes USA and a DSP field", async ({ page }) => {
  await newLabel(page, "Bourbon");
  await openPopup(page, "Zzz Distilling");
  const dialog = page.getByRole("dialog", { name: "Add distillery" });
  await expect(dialog.getByLabel("Name")).toHaveValue("Zzz Distilling");
  await expect(dialog.getByLabel("Country")).toHaveValue("USA");
  await expect(dialog.getByLabel("DSP")).toBeVisible();
  await expect(dialog.getByLabel("NOM")).toHaveCount(0);
  // Place is one line: City and DSP sit at the same height.
  const cityTop = (await dialog.getByLabel("City").boundingBox())!.y;
  const dspTop = (await dialog.getByLabel("DSP").boundingBox())!.y;
  expect(Math.abs(cityTop - dspTop)).toBeLessThan(4);
});

test("leaving State turns KY into Kentucky, and saving puts the distillery in the picker", async ({ page }) => {
  await newLabel(page, "Bourbon");
  await openPopup(page, "Kentucky Test Works");
  const dialog = page.getByRole("dialog", { name: "Add distillery" });
  await dialog.getByLabel("City").fill("Louisville");
  await dialog.getByLabel("State").fill("KY");
  await dialog.getByLabel("State").blur();
  await expect(dialog.getByLabel("State")).toHaveValue("Kentucky");
  await dialog.getByRole("button", { name: "Save distillery" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Remove Kentucky Test Works" })).toBeVisible();
  const db = sql();
  try {
    const [row] = await db<{ city: string; state: string; country: string }[]>`SELECT city, state, country FROM distilleries WHERE name = 'Kentucky Test Works'`;
    expect(row).toEqual({ city: "Louisville", state: "Kentucky", country: "USA" });
  } finally {
    await db.end();
  }
});

test("a Scotch label's popup takes Scotland and a Region choice", async ({ page }) => {
  await newLabel(page, "Single Malt Scotch Whisky");
  await openPopup(page, "Glen Prueba");
  const dialog = page.getByRole("dialog", { name: "Add distillery" });
  await expect(dialog.getByLabel("Country")).toHaveValue("Scotland");
  // Place is one line: City and Region sit at the same height.
  const cityTop = (await dialog.getByLabel("City").boundingBox())!.y;
  const regionTop = (await dialog.getByLabel("Region").boundingBox())!.y;
  expect(Math.abs(cityTop - regionTop)).toBeLessThan(4);
  await dialog.getByLabel("Region").selectOption("Speyside");
  await expect(dialog.getByLabel("DSP")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save distillery" }).click();
  await expect(dialog).toBeHidden();
  const db = sql();
  try {
    const [row] = await db<{ country: string; region: string }[]>`SELECT country, region FROM distilleries WHERE name = 'Glen Prueba'`;
    expect(row).toEqual({ country: "Scotland", region: "Speyside" });
  } finally {
    await db.end();
  }
});

test("a tequila label's popup takes Mexico and a NOM field", async ({ page }) => {
  await newLabel(page, "Tequila");
  await openPopup(page, "Casa Prueba");
  const dialog = page.getByRole("dialog", { name: "Add distillery" });
  await expect(dialog.getByLabel("Country")).toHaveValue("Mexico");
  await expect(dialog.getByLabel("NOM")).toBeVisible();
  await expect(dialog.getByLabel("DSP")).toHaveCount(0);
});

test("a name that already exists blocks Save and offers Use it", async ({ page }) => {
  await newLabel(page, "Bourbon");
  await openPopup(page, "Far North");
  const dialog = page.getByRole("dialog", { name: "Add distillery" });
  await dialog.getByLabel("Name").fill("far north spirits");
  await expect(dialog).toContainText("already in your collection");
  await expect(dialog.getByRole("button", { name: "Save distillery" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Use it" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Remove Far North Spirits" })).toBeVisible();
});

test("a country that does not fit the spirit warns but still saves", async ({ page }) => {
  await newLabel(page, "Bourbon");
  await openPopup(page, "Odd Country Works");
  const dialog = page.getByRole("dialog", { name: "Add distillery" });
  await dialog.getByLabel("Country").fill("France");
  await expect(dialog).toContainText("usually made in USA");
  await expect(dialog).toContainText("It will still save.");
  await expect(dialog.getByRole("button", { name: "Save distillery" })).toBeEnabled();
});

test("creating by name only is offered for a bourbon label and files it under USA", async ({ page }) => {
  await newLabel(page, "Bourbon");
  await page.getByRole("combobox", { name: "Add distilleries" }).click();
  await page.locator("[cmdk-input]").fill("Quick Bourbon Works");
  await page.locator('[cmdk-item][data-value="__create__"]').click();
  await expect(page.getByRole("button", { name: "Remove Quick Bourbon Works" })).toBeVisible();
});

test("creating by name only on a tequila label files it under Mexico", async ({ page }) => {
  await newLabel(page, "Tequila");
  await page.getByRole("combobox", { name: "Add distilleries" }).click();
  await page.locator("[cmdk-input]").fill("Quick Tequila Works");
  await page.locator('[cmdk-item][data-value="__create__"]').click();
  await expect(page.getByRole("button", { name: "Remove Quick Tequila Works" })).toBeVisible();
  const db = sql();
  try {
    const [row] = await db<{ country: string }[]>`SELECT country FROM distilleries WHERE name = 'Quick Tequila Works'`;
    expect(row?.country).toBe("Mexico");
  } finally {
    await db.end();
  }
});
