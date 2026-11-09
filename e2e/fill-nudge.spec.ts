import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";

const PROMPT = "How much is left?";

/** Adds a new Pursuit bottle, so a test does not depend on another's outcome. */
async function addFreshBottle(page: Page) {
  await page.goto("/bottles/new");
  await page.getByRole("combobox", { name: "Label" }).click();
  await page.locator("[cmdk-input]").fill("Double Oak");
  await page.locator('[cmdk-item]:not([data-value="__create__"])').first().click();
  await page.getByRole("button", { name: "Add bottle" }).click();
  await expect(page).toHaveURL(/\/bottles\/\d+$/);
}

/** Opens the add-note dialog, writes something, and saves it. */
async function addNote(page: Page, overall: string) {
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByLabel("Overall").fill(overall);
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

// Specs create real rows; start each file from the seeded baseline.
test.beforeAll(resetDatabase);

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("a new tasting note on an owned bottle asks how much is left", async ({ page }) => {
  await addFreshBottle(page);
  await expect(page.getByText(PROMPT)).toBeHidden();

  await addNote(page, "Caramel and oak.");
  await expect(page.getByText(PROMPT)).toBeVisible();
  // No suggested level: the dial is where it was.
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuetext", "Sealed");
});

test("moving the dial from the prompt saves the level and dismisses the prompt", async ({ page }) => {
  await addFreshBottle(page);
  await addNote(page, "Baking spice.");
  await expect(page.getByText(PROMPT)).toBeVisible();

  const gauge = page.getByRole("slider", { name: "Fill level" });
  await gauge.focus();
  await page.keyboard.press("ArrowDown");
  await expect(gauge).toHaveAttribute("aria-valuenow", "95");
  await expect(page.getByText(PROMPT)).toBeHidden();

  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuenow", "95");
});

test("dragging the dial from the prompt does not shift it under the pointer, and dismisses on release", async ({ page }) => {
  await addFreshBottle(page);
  await addNote(page, "Toasted vanilla.");
  await expect(page.getByText(PROMPT)).toBeVisible();

  const gauge = page.getByRole("slider", { name: "Fill level" });
  const box = (await gauge.boundingBox())!;
  const at = (fx: number, fy: number) => [box.x + box.width * fx, box.y + box.height * fy] as const;

  await page.mouse.move(...at(0.25, 0.55));
  await page.mouse.down();
  await expect(gauge).not.toHaveAttribute("aria-valuenow", "100");
  await page.mouse.move(...at(0.4, 0.3), { steps: 4 });
  // The gauge reads the pointer against its own rectangle on every move, so it must not jump mid-drag.
  expect((await gauge.boundingBox())?.y).toBe(box.y);
  await expect(page.getByText(PROMPT)).toBeVisible();

  await page.mouse.up();
  await expect(page.getByText(PROMPT)).toBeHidden();
});

test("pressing the dial where it already is leaves the prompt up", async ({ page }) => {
  await addFreshBottle(page);
  await addNote(page, "Candied orange.");
  const gauge = page.getByRole("slider", { name: "Fill level" });
  await gauge.focus();
  await page.keyboard.press("End"); // already full: no change
  await expect(page.getByText(PROMPT)).toBeVisible();
});

test("Done dismisses the prompt and leaves the level alone", async ({ page }) => {
  await addFreshBottle(page);
  await addNote(page, "Dry finish.");
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByText(PROMPT)).toBeHidden();
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuenow", "100");
});

test("editing an existing note does not ask", async ({ page }) => {
  await addFreshBottle(page);
  await addNote(page, "First pour.");
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: /^Edit note from/ }).click();
  await page.getByLabel("Overall").fill("First pour, revised.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await expect(page.getByText(PROMPT)).toBeHidden();
});

test("a killed bottle is not asked either", async ({ page }) => {
  await addFreshBottle(page);
  const gauge = page.getByRole("slider", { name: "Fill level" });
  await gauge.focus();
  await page.keyboard.press("Home");
  await page.getByRole("button", { name: "Mark killed" }).click();
  await expect(page.getByRole("definition").filter({ hasText: "Killed" })).toBeVisible();

  await addNote(page, "The last of it.");
  await expect(page.getByText(PROMPT)).toBeHidden();
});
