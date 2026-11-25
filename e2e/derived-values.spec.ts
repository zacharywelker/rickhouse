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
