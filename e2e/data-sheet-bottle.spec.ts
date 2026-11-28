import { expect, test } from "@playwright/test";
import { resetDatabase } from "./support/db";
import { signIn } from "./support/auth";
import { assertThrowawayDatabase } from "./support/tournament-field";

/** The data-sheet look of the bottle form (phase 4C): rows of chips, a More line, a pinned Save. */

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("the bottle form is rows of chips with a More line", async ({ page }) => {
  await page.goto("/bottles/1/edit?look=new");
  await expect(page.getByText("Bought", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Which one", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Where it lives" })).toBeVisible();
  await expect(page.getByText("More:", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Single barrel", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Notes", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "This bottle differs from the label", exact: true })).toBeVisible();
});

test("a price typed in the new look saves and opens the same in the old look", async ({ page }) => {
  await page.goto("/bottles/1/edit?look=new");
  // An unset fact is a dashed + chip; it opens its input on click.
  const addPrice = page.getByRole("button", { name: "Add Price", exact: true });
  if (await addPrice.count()) await addPrice.click();
  await page.getByLabel("Price", { exact: true }).fill("71.5");
  await page.getByRole("button", { name: "Save bottle", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/edit"));
  await page.goto("/bottles/1/edit?look=old");
  // Typed as 71.5 and shown as typed.
  await expect(page.getByLabel("Price Paid", { exact: true })).toHaveValue("71.5");
});

test("More opens a row, and a row with a value is already open", async ({ page }) => {
  await page.goto("/bottles/1/edit?look=new");
  await page.getByRole("button", { name: "Single barrel", exact: true }).click();
  const checkbox = page.getByLabel(/single barrel/i).first();
  await expect(checkbox).toBeVisible();
  await expect(page.getByRole("button", { name: "Single barrel", exact: true })).toHaveCount(0);
  // The checkbox is sr-only; its chip label is what the user clicks.
  await page.locator("label", { hasText: /single barrel/i }).first().click();
  await expect(checkbox).toBeChecked();
  await page.getByRole("button", { name: "Save bottle", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/edit"));
  await page.goto("/bottles/1/edit?look=new");
  // The server renders the old look first; the new one appears once the page has loaded.
  await expect(page.getByRole("button", { name: "Back to the old look", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Single barrel", exact: true })).toHaveCount(0);
  await expect(page.locator('input[name="isSingleBarrel"]')).toBeChecked();
});

test("Save is pinned at the top", async ({ page }) => {
  await page.goto("/bottles/1/edit?look=new");
  const save = page.getByRole("button", { name: "Save bottle", exact: true });
  await expect(save).toBeVisible();
  // A short window makes the page scroll; the bar stays at the top of the window.
  await page.setViewportSize({ width: 864, height: 360 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(save).toBeVisible();
  const after = await save.boundingBox();
  expect(after?.y ?? Infinity).toBeLessThan(80);
  expect(after?.y ?? -1).toBeGreaterThanOrEqual(0);
});

test("the label picker and the old look still work", async ({ page }) => {
  await page.goto("/bottles/1/edit?look=old");
  await expect(page.getByRole("heading", { name: "Edit bottle" })).toBeVisible();
  await expect(page.getByLabel("Price Paid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Try the new look", exact: true }).click();
  await expect(page.getByRole("button", { name: "Back to the old look", exact: true })).toBeVisible();
});

test("the Add bottle page takes the new look: a chosen label's bottle is rows, Save is pinned, and it saves", async ({ page }) => {
  await page.goto("/bottles/add?look=new");
  const search = page.getByRole("combobox", { name: "Find the label" });
  await search.fill("Pursuit Double Oak");
  await expect(page.getByRole("option", { name: /Double Oak Spirit/ })).toBeVisible();
  await search.press("Enter");
  await expect(page.getByText(/You have \d+ bottle/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to the old look", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add Price", exact: true }).click();
  await page.getByLabel("Price", { exact: true }).fill("74.99");
  await page.getByRole("button", { name: "Single barrel", exact: true }).click();
  await page.locator("label", { hasText: /private selection/i }).first().click();
  const save = page.getByRole("button", { name: "Save bottle", exact: true });
  await page.setViewportSize({ width: 864, height: 360 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect((await save.boundingBox())?.y ?? Infinity).toBeLessThan(80);
  await save.click();
  await expect(page).toHaveURL(/\/bottles\/\d+(\?.*)?$/);
});
