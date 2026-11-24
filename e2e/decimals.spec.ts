import { expect, test } from "@playwright/test";
import { signIn } from "./support/auth";

/** Money and proof take two decimals; money pads on blur, proof does not. */

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.goto("/expressions/new");
  await page.getByText("New label", { exact: true }).last().click();
});

test("MSRP pads to two decimals on blur and caps typing at two", async ({ page }) => {
  const msrp = page.locator('input[name="msrp"]');
  await msrp.fill("100");
  await msrp.blur();
  await expect(msrp).toHaveValue("100.00");
  await msrp.fill("");
  await msrp.pressSequentially("99.999");
  await expect(msrp).toHaveValue("99.99");
});

test("proof is capped at two decimals and never padded", async ({ page }) => {
  const proof = page.locator('input[name="proof"]').first();
  await proof.fill("117.9");
  await proof.blur();
  await expect(proof).toHaveValue("117.9");
  await proof.fill("");
  await proof.pressSequentially("90.123");
  await expect(proof).toHaveValue("90.12");
});

test("ABV shows a percent sign", async ({ page }) => {
  await expect(page.locator('span[aria-hidden="true"]', { hasText: /^%$/ })).toBeVisible();
});
