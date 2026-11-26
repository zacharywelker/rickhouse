import { expect, test, type Page } from "@playwright/test";
import { resetDatabase } from "./support/db";
import { signIn } from "./support/auth";
import { openNewLabelForm } from "./support/new-label";
import { assertThrowawayDatabase } from "./support/tournament-field";

/** Phase 4B first PR: an age sets the class or designation, and the cane rums have their fixed base. */

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

async function choose(page: Page, category: string) {
  await openNewLabelForm(page);
  await page.getByRole("combobox", { name: "Category" }).click();
  await page.locator("[cmdk-input]").fill(category);
  await page.locator('[cmdk-item]:not([data-value="__create__"])').filter({ has: page.getByText(category, { exact: true }) }).first().click();
}

test("typing a tequila's age sets its class, and a Blanco has months but no years", async ({ page }) => {
  await choose(page, "Tequila");
  await page.getByRole("spinbutton", { name: "Years" }).fill("2");
  await expect(page.getByLabel("Tequila Class")).toHaveValue("anejo");
  await page.getByRole("spinbutton", { name: "Years" }).fill("4");
  await expect(page.getByLabel("Tequila Class")).toHaveValue("extra-anejo");
  await page.getByLabel("Tequila Class").selectOption("blanco");
  await expect(page.getByRole("spinbutton", { name: "Years" })).toHaveCount(0);
  await expect(page.getByRole("spinbutton", { name: "Months" })).toBeVisible();
});

test("a mezcal has a class but no Extra Añejo", async ({ page }) => {
  await choose(page, "Mezcal");
  await expect(page.getByLabel("Mezcal Class")).toBeVisible();
  expect(await page.getByLabel("Mezcal Class").locator("option").allInnerTexts()).not.toContain("Extra Añejo");
});

test("Armagnac offers its own designations, and an age picks one", async ({ page }) => {
  await choose(page, "Armagnac");
  const designation = page.getByLabel("Age Designation");
  const texts = await designation.locator("option").allInnerTexts();
  expect(texts.some((t) => t.startsWith("Napoléon"))).toBe(true);
  await page.getByRole("spinbutton", { name: "Years" }).fill("6");
  await expect(designation).toHaveValue("Napoléon");
});

test("a genever has a class, and a gin has no days", async ({ page }) => {
  await choose(page, "Genever");
  await expect(page.getByLabel("Genever Class")).toBeVisible();
  await choose(page, "Gin");
  await page.getByLabel("Aged").check();
  await expect(page.getByRole("spinbutton", { name: "Months" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Days" })).toHaveCount(0);
});

test("a Rhum Agricole has a fixed sugarcane juice base and no Added Sugar; a spiced rum has Flavors", async ({ page }) => {
  await choose(page, "Rhum Agricole");
  await expect(page.getByText("Sugarcane juice")).toBeVisible();
  await expect(page.getByLabel("Added Sugar (g/L)")).toHaveCount(0);
  await choose(page, "Flavored / Spiced Rum");
  await expect(page.getByRole("group", { name: "Flavors" })).toBeVisible();
  await expect(page.getByLabel("Added Sugar (g/L)")).toBeVisible();
});

test("a Reposado keeps its months and days", async ({ page }) => {
  await choose(page, "Tequila");
  await page.getByLabel("Tequila Class").selectOption("reposado");
  await expect(page.getByRole("spinbutton", { name: "Years" })).toHaveCount(0);
  await expect(page.getByRole("spinbutton", { name: "Months" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Days" })).toBeVisible();
});

test("liqueur dairy is Dairy or Non-dairy, and Cream starts as Dairy", async ({ page }) => {
  await choose(page, "Cream Liqueur");
  await expect(page.getByLabel("Dairy")).toHaveValue("dairy");
  expect(await page.getByLabel("Dairy").locator("option").allInnerTexts()).toEqual(["Dairy", "Non-dairy"]);
  await choose(page, "Chocolate Liqueur");
  await expect(page.getByLabel("Dairy")).toHaveValue("non-dairy");
});

test("apple brandy has its fruit fixed; flavored whisky, absinthe and shochu have their lists", async ({ page }) => {
  await choose(page, "Apple Brandy");
  
  await expect(page.getByText("fixed for apple brandy")).toBeVisible();
  await choose(page, "Flavored Whisky");
  await expect(page.getByRole("group", { name: "Flavors" })).toBeVisible();
  await choose(page, "Absinthe");
  await expect(page.getByRole("group", { name: "Botanicals" })).toBeVisible();
  await choose(page, "Shochu");
  await expect(page.getByRole("group", { name: "Base Ingredients" })).toBeVisible();
});

test("a solera rum is aged as a range, with no single age", async ({ page }) => {
  await choose(page, "Rum");
  await page.getByLabel("Aged").check();
  await expect(page.getByRole("spinbutton", { name: "Years", exact: true })).toBeVisible();
  await page.getByLabel("Solera", { exact: true }).selectOption("true");
  await expect(page.getByRole("spinbutton", { name: "Years", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Solera — Youngest (years)")).toBeVisible();
  await expect(page.getByLabel("Solera — Oldest (years)")).toBeVisible();
});

test("a Calvados has an appellation that sets its still and warns, and a Millésime has a vintage year", async ({ page }) => {
  await choose(page, "Calvados");
  await page.getByLabel("Appellation").selectOption("pays-d-auge");
  await expect(page.getByLabel("Still Type")).toHaveValue("pot");
  await page.getByLabel("Appellation").selectOption("domfrontais");
  await expect(page.getByLabel("Still Type")).toHaveValue("column");
  await page.getByRole("spinbutton", { name: "Years" }).fill("2");
  await expect(page.getByText("Domfrontais is aged at least 3 years.")).toBeVisible();
  await expect(page.getByLabel("Vintage Year")).toHaveCount(0);
  await page.getByLabel("Age Designation").selectOption("Millésime");
  await expect(page.getByLabel("Vintage Year")).toBeVisible();
});

test("a pisco asks for a Peruvian or Chilean distillery before it says what it is", async ({ page }) => {
  await choose(page, "Pisco");
  await expect(page.getByText("Link a Peruvian or Chilean distillery")).toBeVisible();
  await expect(page.getByLabel("Mosto Verde")).toHaveCount(0);
  await choose(page, "Cognac");
  await expect(page.getByRole("heading", { name: "Brandy detail" })).toHaveCount(0);
});

test("a mezcal has a production category that presets and limits how it was made", async ({ page }) => {
  await choose(page, "Mezcal");
  await expect(page.getByLabel("Production")).toBeVisible();
  await page.getByLabel("Production").selectOption("ancestral");
  await expect(page.getByLabel("Still Type")).toHaveValue("clay-pot");
  await expect(page.getByLabel("Cooking Method")).toHaveValue("pit");
  expect(await page.getByLabel("Still Type").locator("option").allInnerTexts()).toEqual(["Unknown", "Clay pot"]);
  await page.getByLabel("Production").selectOption("artesanal");
  expect(await page.getByLabel("Still Type").locator("option").allInnerTexts()).not.toContain("Column");
  await choose(page, "Tequila");
  await expect(page.getByLabel("Production")).toHaveCount(0);
});

test("a mezcal Madurado en Vidrio has no age and no barrel; its flavors are a list", async ({ page }) => {
  await choose(page, "Mezcal");
  await expect(page.getByRole("group", { name: "Barrel Type" })).toBeVisible();
  await page.getByLabel("Mezcal Class").selectOption("madurado-en-vidrio");
  await expect(page.getByRole("spinbutton", { name: "Months" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Barrel Type" })).toHaveCount(0);
  await expect(page.getByLabel("Flavor", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Flavors" })).toBeVisible();
});
