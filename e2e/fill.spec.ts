import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";

/** Opens the seeded Pursuit bottle. */
async function openSeededBottle(page: Page) {
  await page.goto("/bottles");
  await page.getByRole("link", { name: /Double Oak Spirit/ }).first().click();
  await expect(page).toHaveURL(/\/bottles\/\d+$/);
}

// Specs create real rows; start each file from the seeded baseline.
test.beforeAll(resetDatabase);

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("the gauge is a real slider, not just a picture", async ({ page }) => {
  await openSeededBottle(page);
  const gauge = page.getByRole("slider", { name: "Fill level" });
  await expect(gauge).toBeVisible();
  await expect(gauge).toHaveAttribute("aria-valuemin", "0");
  await expect(gauge).toHaveAttribute("aria-valuemax", "100");
  await expect(gauge).toHaveAttribute("aria-orientation", "vertical");
  await expect(gauge).toHaveAttribute("aria-valuetext", /percent full/);
});

test("the gauge can be poured with the keyboard and the level sticks", async ({ page }) => {
  await openSeededBottle(page);
  const gauge = page.getByRole("slider", { name: "Fill level" });

  await gauge.focus();
  await expect(gauge).toHaveAttribute("aria-valuenow", "100");

  // Shift+Arrow moves in tens.
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(gauge).toHaveAttribute("aria-valuenow", "80");

  await page.keyboard.press("ArrowDown");
  await expect(gauge).toHaveAttribute("aria-valuenow", "79");

  // It is written through to the database, not just held in the page.
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuenow", "79");
  await expect(page.getByLabel("Exact level")).toHaveValue("79");
});

test("opening a bottle stamps the date", async ({ page }) => {
  await openSeededBottle(page);
  await page.getByLabel("Opened", { exact: true }).check();

  // Wait for the stamped date, not for the word "Opened" — the label carries
  // that text whether or not the write landed, so asserting on it would let
  // the reload below race an in-flight server action.
  await expect(page.getByRole("definition").first()).toHaveText(/\d{4}-\d{2}-\d{2}/);

  await page.reload();
  await expect(page.getByLabel("Opened", { exact: true })).toBeChecked();
  await expect(page.getByRole("definition").first()).toHaveText(/\d{4}-\d{2}-\d{2}/);
});

test("emptying a bottle offers to mark it killed", async ({ page }) => {
  await openSeededBottle(page);
  const gauge = page.getByRole("slider", { name: "Fill level" });
  await gauge.focus();
  await page.keyboard.press("Home");
  await expect(gauge).toHaveAttribute("aria-valuenow", "0");

  const prompt = page.getByRole("dialog");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await expect(prompt).toContainText("Mark it killed?");

  await page.getByRole("button", { name: "Mark killed" }).click();
  await expect(prompt).toBeHidden();
  await expect(page.getByRole("definition").filter({ hasText: "Killed" })).toBeVisible();

  // And the grid agrees.
  await page.goto("/bottles");
  await expect(page.getByRole("cell", { name: "Killed", exact: true })).toBeVisible();
});

test("declining the prompt leaves the bottle empty but alive", async ({ page }) => {
  await page.goto("/bottles/new");
  // A fresh bottle so this test does not depend on the previous one's outcome.
  await page.getByRole("combobox", { name: "Label" }).click();
  await page.locator("[cmdk-input]").fill("Double Oak");
  await page.locator('[cmdk-item]:not([data-value="__create__"])').first().click();
  await page.getByRole("button", { name: "Add bottle" }).click();
  await expect(page).toHaveURL(/\/bottles\/\d+$/);

  const gauge = page.getByRole("slider", { name: "Fill level" });
  await gauge.focus();
  await page.keyboard.press("Home");
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "Leave it empty" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.reload();
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("definition").filter({ hasText: "Killed" })).toHaveCount(0);
});
