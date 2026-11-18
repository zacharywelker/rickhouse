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

/** The frame around the sheet (the box with the border), and the document's own height. */
async function measures(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector("[role=grid][aria-label='Bulk editor']")!;
    const scrollBox = grid.closest(".overflow-x-auto")!;
    const frame = scrollBox.parentElement!.getBoundingClientRect();
    return { docHeight: document.documentElement.scrollHeight, frameBottom: frame.bottom, frameHeight: frame.height, h1s: document.querySelectorAll("h1").length };
  });
}

test("the sheet fills the window and the page does not scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/bulk-editor");
  await expect(page.getByRole("grid", { name: "Bulk editor" })).toBeVisible();
  const m = await measures(page);
  expect(m.docHeight).toBeLessThanOrEqual(1080);
  expect(m.frameBottom).toBeGreaterThan(1080 - 40);
  expect(m.h1s).toBe(1);
});

test("a short window scrolls the page and the sheet keeps its minimum height", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.goto("/bulk-editor");
  await expect(page.getByRole("grid", { name: "Bulk editor" })).toBeVisible();
  const m = await measures(page);
  expect(m.docHeight).toBeGreaterThan(400);
  expect(m.frameHeight).toBeGreaterThanOrEqual(320);
});

test("a toolbar that wraps costs the sheet height, not the page", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/bulk-editor");
  await expect(page.getByRole("grid", { name: "Bulk editor" })).toBeVisible();
  const m = await measures(page);
  expect(m.docHeight).toBeLessThanOrEqual(800);
  expect(m.frameBottom).toBeGreaterThan(800 - 40);
});
