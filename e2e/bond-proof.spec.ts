import { expect, test } from "@playwright/test";
import { signIn } from "./support/auth";

/** Bottled In Bond forces 100 proof; unticking it brings back the proof you had, unless you changed it meanwhile. */

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.goto("/expressions/new");
  await page.getByText("New label", { exact: true }).last().click();
  await page.getByRole("combobox", { name: "Category" }).click();
  await page.locator("[cmdk-input]").fill("Bourbon");
  await page
    .locator('[cmdk-item]:not([data-value="__create__"])')
    .filter({ has: page.getByText("Bourbon", { exact: true }) })
    .first()
    .click();
});

test("unticking Bottled In Bond restores the earlier proof", async ({ page }) => {
  const proof = page.locator('input[name="proof"]').first();
  await proof.fill("117.9");
  await page.getByLabel("Bottled in bond").check();
  await expect(proof).toHaveValue("100");
  await page.getByLabel("Bottled in bond").uncheck();
  await expect(proof).toHaveValue("117.9");
});

test("a proof edited after ticking Bottled In Bond is kept when it is unticked", async ({ page }) => {
  const proof = page.locator('input[name="proof"]').first();
  await proof.fill("117.9");
  await page.getByLabel("Bottled in bond").check();
  await proof.fill("101");
  await page.getByLabel("Bottled in bond").uncheck();
  await expect(proof).toHaveValue("101");
});
