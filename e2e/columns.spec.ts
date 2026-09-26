import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";

const stamp = () => Math.random().toString(36).slice(2, 8);

const EXISTING_OPTION = '[cmdk-item]:not([data-value="__create__"])';

async function pick(page: Page, comboboxLabel: string | RegExp, search: string, optionLabel?: string) {
  const target = optionLabel ?? search;
  await page.getByRole("combobox", { name: comboboxLabel }).click();
  await page.locator("[cmdk-input]").fill(search);
  await page.locator(EXISTING_OPTION).filter({ has: page.getByText(target, { exact: true }) }).first().click();
}

async function noSidewaysPageScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

// Specs create real rows; start each file from the seeded baseline.
test.beforeAll(resetDatabase);

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("the labels table shows six columns by default and can show any other field", async ({ page }) => {
  await page.goto("/expressions");
  for (const name of [/Brand/, /Label/, /Category/, /Proof/, /MSRP/, /Bottles/]) {
    await expect(page.getByRole("columnheader", { name })).toBeVisible();
  }
  await expect(page.getByRole("columnheader", { name: /UPC/ })).toHaveCount(0);

  await page.getByRole("button", { name: /Columns/ }).click();
  await page.getByRole("checkbox", { name: "Distilleries", exact: true }).click();
  await page.getByRole("checkbox", { name: "MSRP", exact: true }).click();
  await page.keyboard.press("Escape");

  // The choice is part of the view, so it lives in the URL like sorting does.
  await expect(page).toHaveURL(/cols=/);
  await expect(page.getByRole("columnheader", { name: "Distilleries" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Bardstown Bourbon Company/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /MSRP/ })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("columnheader", { name: "Distilleries" })).toBeVisible();

  await page.getByRole("button", { name: /Columns/ }).click();
  await expect(page.getByRole("checkbox", { name: "Label", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Defaults" }).click();
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/cols=/);
  await expect(page.getByRole("columnheader", { name: /MSRP/ })).toBeVisible();
});

test("an unlocked labels table edits whichever columns are shown", async ({ page }) => {
  await page.goto("/expressions?cols=brand,name,estate,upc,ageStatement");
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  // Rum detail does not apply to a bourbon, on the form or here.
  await expect(page.getByRole("textbox", { name: "Estate" })).toHaveCount(0);

  await page.getByRole("textbox", { name: "UPC / Barcode" }).fill("12ab");
  await page.getByRole("button", { name: /Save changes/ }).click();
  await expect(page.getByText("UPC / Barcode: A barcode is 6–32 digits.")).toBeVisible();

  await page.getByRole("textbox", { name: "UPC / Barcode" }).fill("080686001409");
  await page.getByRole("textbox", { name: "Age Statement" }).fill("4 Year");
  await page.getByRole("button", { name: /Save changes \(1\)/ }).click();
  await expect(page.getByRole("button", { name: /Save changes/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(page.getByRole("cell", { name: "080686001409" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "4 Year" })).toBeVisible();
});

test("bulk add labels takes every field and remembers the ones you hide", async ({ page }) => {
  const name = `Bulk Rum ${stamp()}`;
  await page.goto("/expressions/bulk");

  // Rum cells wait until the row is a rum.
  await expect(page.getByRole("textbox", { name: "Estate" })).toHaveCount(0);
  await pick(page, /Brand/, "Pursuit Spirits");
  await pick(page, /Category/, "Rum");
  await page.getByRole("textbox", { name: "Label Name" }).fill(name);
  await page.getByRole("textbox", { name: "Estate" }).fill("Hampden");
  await page.getByRole("combobox", { name: "Still Type" }).selectOption("pot");

  await page.getByRole("button", { name: /^Distilleries/ }).click();
  await pick(page, "Add distilleries", "Finger Lakes", "Finger Lakes Distilling");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Distilleries/ })).toContainText("Finger Lakes Distilling");

  await page.getByRole("button", { name: /Fields/ }).click();
  await expect(page.getByRole("checkbox", { name: "Label Name", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Description", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Description" })).toHaveCount(0);

  await page.getByRole("button", { name: "Save all" }).click();
  await expect(page.getByText("Added 1 label.")).toBeVisible();

  await page.goto(`/expressions?q=${encodeURIComponent(name)}&cols=name,estate,stillType,distilleries`);
  await expect(page.getByRole("cell", { name: "Hampden" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Pot" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Finger Lakes Distilling" })).toBeVisible();

  // Hidden stays hidden on the next visit.
  await page.goto("/expressions/bulk");
  await expect(page.getByRole("columnheader", { name: "Label Name" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Description" })).toHaveCount(0);
});

test("bulk add bottles records state and single-barrel detail", async ({ page }) => {
  await page.goto("/bottles/bulk");

  // A pick name only means something on a private selection.
  await expect(page.getByRole("textbox", { name: "Pick Name" })).toHaveCount(0);
  await pick(page, /Label/, "Double Oak", "Pursuit Spirits Double Oak Spirit");
  await page.getByRole("checkbox", { name: "Private Selection" }).click();
  await page.getByRole("textbox", { name: "Pick Name" }).fill("Barrel #24 — Bulk Club");
  await page.getByRole("spinbutton", { name: "Fill %" }).fill("40");
  await page.getByRole("checkbox", { name: "Opened" }).click();

  await page.getByRole("button", { name: "Save all" }).click();
  await expect(page.getByText("Added 1 bottle.")).toBeVisible();

  await page.goto("/bottles");
  const row = page.getByRole("row").filter({ has: page.getByRole("img", { name: /fill: 40 percent full/ }) });
  await row.getByRole("link", { name: /Double Oak Spirit/ }).click();
  await expect(page.getByText("Barrel #24 — Bulk Club")).toBeVisible();
});

test("wide grids scroll inside themselves, not the page", async ({ page }) => {
  for (const url of ["/expressions/bulk", "/bottles/bulk"]) {
    await page.goto(url);
    await expect(page.getByRole("button", { name: /Fields/ })).toBeVisible();
    await noSidewaysPageScroll(page);
  }

  await page.goto("/expressions");
  await page.getByRole("button", { name: /Columns/ }).click();
  await page.getByRole("button", { name: "Show all" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Finishes" })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await noSidewaysPageScroll(page);
});
