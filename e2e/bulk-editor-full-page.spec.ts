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
    const frame = scrollBox.parentElement!.parentElement!.getBoundingClientRect(); // scroll box, its body, the frame
    return { docHeight: document.documentElement.scrollHeight, frameBottom: frame.bottom, frameHeight: frame.height, h1s: document.querySelectorAll("h1").length };
  });
}

test("the sheet fills the window and the page does not scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/bulk-editor");
  await expect(page.getByRole("grid", { name: "Bulk editor" })).toBeVisible();
  const m = await measures(page);
  expect(m.docHeight).toBeLessThanOrEqual(1080);
  expect(m.frameBottom).toBeGreaterThan(1080 - 100); // the footer and the page padding are under the frame
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
  expect(m.frameBottom).toBeGreaterThan(800 - 100);
});

// ---- the Details pane lies over the sheet ----

const grid = (page: Page) => page.getByRole("grid", { name: "Bulk editor" });
const scrollBox = (page: Page) => grid(page).locator("xpath=ancestor::div[contains(@class,'overflow-x-auto')][1]");
const pane = (page: Page) => page.locator("aside[aria-label='Row details']");
const lastHeader = (page: Page) => grid(page).locator("thead tr:last-child th").last();
const hidePane = (page: Page) => page.getByRole("button", { name: "Hide the details panel" }).click();

/** Opens the editor at a laptop width, where the columns overflow the sheet and the pane starts open. */
async function openLaptop(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/bulk-editor");
  await expect(grid(page)).toBeVisible();
  await expect(pane(page)).toBeVisible();
}
async function scrollToEnd(page: Page) {
  await scrollBox(page).evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await page.waitForTimeout(100);
}

test("the pane lies over the sheet's right edge, and showing or hiding it moves nothing", async ({ page }) => {
  await openLaptop(page);
  const before = { grid: await grid(page).boundingBox(), brand: await grid(page).locator("thead tr:last-child th").first().boundingBox(), row: await grid(page).locator("tbody tr").first().boundingBox() };
  const box = (await scrollBox(page).boundingBox())!;
  const bar = await scrollBox(page).evaluate((el) => (el as HTMLElement).offsetWidth - (el as HTMLElement).clientWidth);
  const p = (await pane(page).boundingBox())!;
  // Over the right edge of the sheet's scroll box, level with its top, and not covering its scrollbar.
  expect(Math.abs(p.x + p.width - (box.x + box.width - bar))).toBeLessThanOrEqual(2);
  expect(Math.abs(p.y - box.y)).toBeLessThanOrEqual(2);
  expect(p.width).toBeLessThanOrEqual(300);

  await hidePane(page);
  await expect(pane(page).getByRole("button", { name: "Show the details panel" })).toBeVisible();
  const after = { grid: await grid(page).boundingBox(), brand: await grid(page).locator("thead tr:last-child th").first().boundingBox(), row: await grid(page).locator("tbody tr").first().boundingBox() };
  expect(after).toEqual(before);
});

test("the last column scrolls fully clear of the pane, and to the edge when the pane is hidden", async ({ page }) => {
  await openLaptop(page);
  await scrollToEnd(page);
  const p = (await pane(page).boundingBox())!;
  const last = (await lastHeader(page).boundingBox())!;
  expect(last.x + last.width).toBeLessThanOrEqual(p.x + 1);

  await hidePane(page);
  await scrollToEnd(page);
  const box = (await scrollBox(page).boundingBox())!;
  const lastClosed = (await lastHeader(page).boundingBox())!;
  expect(lastClosed.x + lastClosed.width).toBeLessThanOrEqual(box.x + box.width + 1);
});

test("arrowing to the last column leaves the cell clear of the pane", async ({ page }) => {
  await openLaptop(page);
  await grid(page).locator("td[data-r='0'][data-c='0']").click();
  await page.keyboard.press("End");
  await page.waitForTimeout(200);
  const active = (await page.locator("td[data-r][aria-selected='true']").first().boundingBox())!;
  const p = (await pane(page).boundingBox())!;
  expect(active.x + active.width).toBeLessThanOrEqual(p.x + 1);
});

test("with columns resized, the last column still scrolls clear of the pane", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/bulk-editor");
  await page.evaluate(() => window.localStorage.setItem("bulk-editor:widths", JSON.stringify({ brand: 220, category: 180 })));
  await page.reload();
  await expect(pane(page)).toBeVisible();
  // The saved widths are read after the page has loaded.
  await expect.poll(async () => Math.round((await grid(page).locator("thead tr:last-child th").first().boundingBox())!.width)).toBe(220);
  await scrollToEnd(page);
  const p = (await pane(page).boundingBox())!;
  const last = (await lastHeader(page).boundingBox())!;
  expect(last.x + last.width).toBeLessThanOrEqual(p.x + 1);
  await page.evaluate(() => window.localStorage.removeItem("bulk-editor:widths"));
});

test("the save and undo notices sit above the pane", async ({ page }) => {
  await openLaptop(page);
  const z = await page.evaluate(() => {
    const live = document.querySelector("div[aria-live='polite'].fixed") as HTMLElement;
    const aside = document.querySelector("aside[aria-label='Row details']") as HTMLElement;
    const level = (el: HTMLElement | null) => { for (let e = el; e; e = e.parentElement) { const z = getComputedStyle(e).zIndex; if (z !== "auto") return Number(z); } return 0; };
    return { notices: level(live), pane: level(aside.firstElementChild as HTMLElement) };
  });
  expect(z.notices).toBeGreaterThan(z.pane);
});

test("ticking a row shows the delete bar without shrinking the sheet or going under the pane", async ({ page }) => {
  await openLaptop(page);
  const before = (await scrollBox(page).boundingBox())!;
  await page.getByRole("checkbox", { name: /^Select / }).first().check();
  const bar = page.getByText(/selected$/).first();
  await expect(bar).toBeVisible();
  const after = (await scrollBox(page).boundingBox())!;
  expect(after.height).toBe(before.height);
  const barBox = (await bar.locator("xpath=ancestor::div[contains(@class,'bg-card')][1]").boundingBox())!;
  const p = (await pane(page).boundingBox())!;
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(p.x + 1);
});

// ---- the footer ----

/** The long help where it is showing: it is also in the page, hidden, from md up. */
const longHelp = (page: Page) => page.getByText(/Enter takes the highlighted match or creates/).locator("visible=true");

test("from md up there is no footer: the sheet runs to the window's bottom and the shortcuts are a button in the toolbar", async ({ page }) => {
  await openLaptop(page);
  await expect(page.getByRole("button", { name: "All shortcuts" })).toHaveCount(0);
  const m = await measures(page);
  expect(m.frameBottom).toBeGreaterThan(768 - 40);
  await expect(longHelp(page)).toBeHidden();

  const button = page.getByRole("button", { name: "Keyboard shortcuts" });
  await expect(button).toBeVisible();
  await button.click();
  await expect(longHelp(page)).toBeVisible();
  await expect(page.getByText(/Drag the edge of a column header to resize it/).locator("visible=true")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(longHelp(page)).toBeHidden();
});

test("below md the page is as before: the long help under the sheet and no footer", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto("/bulk-editor");
  await expect(grid(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Keyboard shortcuts" })).toBeHidden();
  await expect(longHelp(page)).toBeVisible();
});

// ---- found in review ----

test("showing the pane over the selected cell scrolls the cell clear of it", async ({ page }) => {
  await openLaptop(page);
  await hidePane(page);
  await scrollToEnd(page);
  const lastCol = (await grid(page).locator("thead tr:last-child th").count()) - 1;
  await grid(page).locator(`td[data-r='0'][data-c='${lastCol}']`).click();
  await page.getByRole("button", { name: "Show the details panel" }).click();
  await expect(pane(page).getByRole("button", { name: "Hide the details panel" })).toBeVisible();
  await page.waitForTimeout(300);
  const active = (await page.locator("td[data-r][aria-selected='true']").first().boundingBox())!;
  const p = (await pane(page).boundingBox())!;
  expect(active.x + active.width).toBeLessThanOrEqual(p.x + 1);
});

test("the bottom rows scroll clear of the delete bar", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 420 }); // short, so the rows overflow the sheet
  await page.goto("/bulk-editor");
  await expect(grid(page)).toBeVisible();
  await page.getByRole("checkbox", { name: /^Select / }).first().check();
  const bar = page.getByText(/selected$/).first();
  await expect(bar).toBeVisible();
  await scrollBox(page).evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(150);
  const barBox = (await bar.locator("xpath=ancestor::div[contains(@class,'bg-card')][1]").boundingBox())!;
  const lastRow = (await grid(page).locator("tbody tr").last().boundingBox())!;
  expect(lastRow.y + lastRow.height).toBeLessThanOrEqual(barBox.y + 1);
});
