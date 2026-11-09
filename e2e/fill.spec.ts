import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";

/** Opens the seeded Pursuit bottle. */
async function openSeededBottle(page: Page) {
  await page.goto("/bottles");
  await page.getByRole("link", { name: /Double Oak Spirit/ }).first().click();
  await expect(page).toHaveURL(/\/bottles\/\d+$/);
}

/** Adds a new Pursuit bottle, so a test does not depend on another's outcome. */
async function addFreshBottle(page: Page) {
  await page.goto("/bottles/new");
  await page.getByRole("combobox", { name: "Label" }).click();
  await page.locator("[cmdk-input]").fill("Double Oak");
  await page.locator('[cmdk-item]:not([data-value="__create__"])').first().click();
  await page.getByRole("button", { name: "Add bottle" }).click();
  await expect(page).toHaveURL(/\/bottles\/\d+$/);
}

/**
 * Taps the dial where the needle would point for `pct`. The dial snaps to the
 * nearest 5% tick, so a point a little off still lands on that tick.
 */
async function tapDial(page: Page, pct: number) {
  const box = await page.getByRole("slider", { name: "Fill level" }).boundingBox();
  if (!box) throw new Error("the dial is not on the page");
  // The hub sits 62/72 of the way down the 120x72 viewBox; the arc is 48/72 of the height out from it.
  const hubX = box.x + box.width / 2;
  const hubY = box.y + (box.height * 62) / 72;
  const r = (box.height * 36) / 72;
  const angle = Math.PI - (pct / 100) * Math.PI;
  await page.mouse.click(hubX + Math.cos(angle) * r, hubY - Math.sin(angle) * r);
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
  // The seeded bottle is unopened, so the dial is sealed: hatched, no needle, no level to read yet.
  await expect(gauge).toHaveAttribute("aria-valuetext", "Sealed");
});

test("the gauge can be poured with the keyboard and the level sticks", async ({ page }) => {
  await openSeededBottle(page);
  const gauge = page.getByRole("slider", { name: "Fill level" });

  await gauge.focus();
  await expect(gauge).toHaveAttribute("aria-valuenow", "100");

  // Shift+Arrow moves a quarter; an arrow moves one 5% tick.
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(gauge).toHaveAttribute("aria-valuenow", "50");

  await page.keyboard.press("ArrowDown");
  await expect(gauge).toHaveAttribute("aria-valuenow", "45");

  // It is written through to the database, not just held in the page.
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuenow", "45");
  // 45% reads in the half band.
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuetext", "Half full");
});

test("tapping the dial lands on the tick, not just a quick state", async ({ page }) => {
  await openSeededBottle(page);
  await tapDial(page, 55);
  const gauge = page.getByRole("slider", { name: "Fill level" });
  await expect(gauge).toHaveAttribute("aria-valuenow", "55");
  await expect(gauge).toHaveAttribute("aria-valuetext", "Half full");

  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuetext", "Half full");
});

test("moving a sealed dial opens the bottle", async ({ page }) => {
  await addFreshBottle(page);
  const gauge = page.getByRole("slider", { name: "Fill level" });
  await expect(gauge).toHaveAttribute("aria-valuetext", "Sealed");
  await expect(page.getByLabel("Opened", { exact: true })).not.toBeChecked();

  await tapDial(page, 50);
  await expect(gauge).toHaveAttribute("aria-valuetext", "Half full");
  await expect(page.getByLabel("Opened", { exact: true })).toBeChecked({ timeout: 10000 });
});

test("a level that fails to save goes back to the saved one and says so", async ({ page }) => {
  await addFreshBottle(page);
  const gauge = page.getByRole("slider", { name: "Fill level" });
  // Server actions are POSTs carrying a Next-Action header; dropping them is the network going away.
  await page.route("**/bottles/*", (route) =>
    route.request().headers()["next-action"] ? route.abort() : route.continue(),
  );

  await gauge.focus();
  await page.keyboard.press("ArrowDown");
  await expect(gauge).toHaveAttribute("aria-valuenow", "95");
  await expect(page.getByText("Couldn't save the level")).toBeVisible({ timeout: 10000 });
  await expect(gauge).toHaveAttribute("aria-valuenow", "100");
  await expect(gauge).toHaveAttribute("aria-valuetext", "Sealed");
});

test("pressing End on a sealed bottle leaves it sealed", async ({ page }) => {
  await addFreshBottle(page);
  const gauge = page.getByRole("slider", { name: "Fill level" });
  await gauge.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(800);
  await expect(gauge).toHaveAttribute("aria-valuetext", "Sealed");
  await expect(page.getByLabel("Opened", { exact: true })).not.toBeChecked();
});

test("pressing Home again after leaving a bottle empty does not ask a second time", async ({ page }) => {
  await addFreshBottle(page);
  const gauge = page.getByRole("slider", { name: "Fill level" });
  await gauge.focus();
  await page.keyboard.press("Home");
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Leave it empty" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await gauge.focus();
  await page.keyboard.press("Home");
  await page.waitForTimeout(1200);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("unticking Opened on a full bottle seals it again", async ({ page }) => {
  await addFreshBottle(page);
  const opened = page.getByLabel("Opened", { exact: true });
  await opened.check();
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuetext", "Full");

  await opened.click();
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuetext", "Sealed");
  await expect(opened).not.toBeChecked();

  // The dial answers before the save does, and the seal queues behind the open request: wait for both.
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuetext", "Sealed");
  await expect(page.getByLabel("Opened", { exact: true })).not.toBeChecked();
});

test("unticking Opened on a half-full bottle asks, and sealing puts it back to full", async ({ page }) => {
  await addFreshBottle(page);
  await tapDial(page, 50);
  const opened = page.getByLabel("Opened", { exact: true });
  await expect(opened).toBeChecked({ timeout: 10000 });
  await page.waitForTimeout(1200);

  await opened.click();
  const prompt = page.getByRole("dialog");
  await expect(prompt).toContainText("Mark it sealed?");
  await page.getByRole("button", { name: "Mark it sealed" }).click();
  await expect(prompt).toBeHidden();
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuetext", "Sealed");

  await page.reload();
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuetext", "Sealed");
  await expect(page.getByLabel("Opened", { exact: true })).not.toBeChecked();
});

test("choosing to keep it open leaves the level and the tick alone", async ({ page }) => {
  await addFreshBottle(page);
  await tapDial(page, 50);
  const opened = page.getByLabel("Opened", { exact: true });
  await expect(opened).toBeChecked({ timeout: 10000 });
  await page.waitForTimeout(1200);

  await opened.click();
  await page.getByRole("button", { name: "Keep it open" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(opened).toBeChecked();
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuetext", "Half full");
});

test("opening a bottle stamps the date", async ({ page }) => {
  await openSeededBottle(page);
  await page.getByLabel("Opened", { exact: true }).check();

  // Wait for the stamped date, not for the word "Opened" — the label carries
  // that text whether or not the write landed, so asserting on it would let
  // the reload below race an in-flight server action.
  await expect(page.getByRole("definition").first()).toHaveText(/[A-Z][a-z]{2} \d{1,2}, \d{4}/);

  await page.reload();
  await expect(page.getByLabel("Opened", { exact: true })).toBeChecked();
  await expect(page.getByRole("definition").first()).toHaveText(/[A-Z][a-z]{2} \d{1,2}, \d{4}/);
});

test("clearing the opened date asks, and keeping it open leaves the bottle open with no date", async ({ page }) => {
  await addFreshBottle(page);
  await page.getByLabel("Opened", { exact: true }).check();
  await expect(page.getByRole("definition").first()).toHaveText(/[A-Z][a-z]{2} \d{1,2}, \d{4}/);

  await page.getByRole("button", { name: /^Change the opened date/ }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();

  const prompt = page.getByRole("dialog");
  await expect(prompt).toContainText("Keep the bottle open or mark it sealed?");
  await page.getByRole("button", { name: "Keep it open, no date" }).click();
  await expect(prompt).toBeHidden();

  // Still open, no date, and a date can be put back.
  await expect(page.getByLabel("Opened", { exact: true })).toBeChecked();
  const add = page.getByRole("button", { name: "Add the opened date" });
  await expect(add).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Opened", { exact: true })).toBeChecked();
  await expect(page.getByRole("button", { name: "Add the opened date" })).toBeVisible();

  await page.getByRole("button", { name: "Add the opened date" }).click();
  const input = page.locator("#date-dateOpened");
  await input.fill("2020-03-14");
  await input.blur();
  await expect(page.getByRole("button", { name: /^Change the opened date/ })).toHaveText("Mar 14, 2020");
});

test("clearing the opened date and marking it sealed closes the bottle at full", async ({ page }) => {
  await addFreshBottle(page);
  await tapDial(page, 50);
  const gauge = page.getByRole("slider", { name: "Fill level" });
  await expect(gauge).toHaveAttribute("aria-valuenow", "50");
  // Pouring opens a sealed bottle and stamps today.
  await expect(page.getByRole("definition").first()).toHaveText(/[A-Z][a-z]{2} \d{1,2}, \d{4}/, { timeout: 10000 });

  await page.getByRole("button", { name: /^Change the opened date/ }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Mark it sealed" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.reload();
  await expect(page.getByLabel("Opened", { exact: true })).not.toBeChecked();
  await expect(page.getByRole("slider", { name: "Fill level" })).toHaveAttribute("aria-valuenow", "100");
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

  // And the grid agrees: off the shelf by default, still there as history.
  await page.goto("/bottles");
  await expect(page.getByRole("cell", { name: "Killed", exact: true })).toHaveCount(0);
  await page.goto("/bottles?status=all");
  await expect(page.getByRole("cell", { name: "Killed", exact: true })).toBeVisible();
});

test("declining the prompt leaves the bottle empty but alive", async ({ page }) => {
  await addFreshBottle(page);

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

test("a rejected date can be corrected in place", async ({ page }) => {
  await addFreshBottle(page);
  await page.getByLabel("Opened", { exact: true }).check();
  const change = page.getByRole("button", { name: /^Change the opened date/ });
  await expect(change).toHaveText(/[A-Z][a-z]{2} \d{1,2}, \d{4}/);

  // The picker caps at today, but a typed date can still get past it.
  await change.click();
  const input = page.locator('input[type="date"]');
  await input.fill("2999-01-01");
  await input.blur();
  const error = page.getByRole("alert").filter({ hasText: "That date is in the future." });
  await expect(error).toBeVisible();

  // Going back in clears the error and opens the editor. Clearing it re-renders
  // the whole fill control, which once remounted the date editor and closed it
  // again before it ever appeared.
  await change.click();
  await expect(error).toBeHidden();
  await expect(input).toBeFocused();
  await input.fill("2020-03-14");
  await input.blur();
  await expect(change).toHaveText("Mar 14, 2020");

  await page.reload();
  await expect(page.getByRole("button", { name: /^Change the opened date/ })).toHaveText("Mar 14, 2020");
});
