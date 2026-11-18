import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import { assertThrowawayDatabase, seedTournamentField } from "./support/tournament-field";

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
  await seedTournamentField();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;

test("the page and the nav run edge to edge, other pages stay capped", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto("/bulk-editor");
  await expect(page.getByRole("grid", { name: "Bulk editor" })).toBeVisible();
  // The page is as wide as the window (less a scrollbar), the nav starts at the page's own padding, and the Details panel,
  // still beside the sheet until it moves over it, is at the far right.
  expect((await box(page, "main")).width).toBeGreaterThanOrEqual(1880);
  expect((await box(page, "header a[href='/']")).x).toBeLessThanOrEqual(32);
  const panel = await box(page, "aside[aria-label='Row details']");
  expect(panel.x + panel.width).toBeGreaterThanOrEqual(1880);

  // Every other page keeps its 1440px column.
  await page.goto("/bottles");
  expect((await box(page, "main")).width).toBeLessThanOrEqual(1440);
  expect((await box(page, "header a[href='/']")).x).toBeGreaterThan(200);
});
