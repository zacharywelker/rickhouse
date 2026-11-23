import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import { approvalCount, isMarkedNotOnTtb, listedCount, seedTtbField } from "./support/housekeeping-ttb";
import { assertThrowawayDatabase } from "./support/tournament-field";

/** Labels listed at the start: the seeded eighteen plus whatever example data the reset adds. */
let TOTAL = 0;

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
  await seedTtbField();
  TOTAL = await listedCount();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

const section = (page: Page) => page.getByRole("region", { name: "TTB approvals" });
const rows = (page: Page) => section(page).getByRole("group", { name: /: no TTB approval$/ });
const row = (page: Page, label: string) => section(page).getByRole("group", { name: `${label}: no TTB approval` });
const range = (page: Page) => section(page).getByText(/^\d+–\d+ of \d+$/);
const notice = (page: Page, text: string | RegExp) => section(page).getByRole("status").filter({ hasText: text });

// Every seeded label on one page, whatever the example data adds.
const ALL = "/housekeeping?tp=48";
const LAB = "Ttb Home Ttb Lab";

test("the section opens on a first window, says where it is, and Next shows the following one", async ({ page }) => {
  expect(TOTAL).toBeGreaterThan(16);
  await page.goto("/housekeeping");
  await expect(rows(page)).toHaveCount(8);
  await expect(range(page)).toHaveText(`1–8 of ${TOTAL}`);
  await expect(page.getByText(new RegExp(`${TOTAL} labels have no TTB approval`))).toBeVisible();
  const first = await rows(page).first().getAttribute("aria-label");
  await section(page).getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/to=8/);
  await expect(range(page)).toHaveText(`9–${Math.min(16, TOTAL)} of ${TOTAL}`);
  expect(await rows(page).first().getAttribute("aria-label")).not.toBe(first);
});

test("Not on TTB removes the row, says so above the rows, and it stays gone after a reload", async ({ page }) => {
  await page.goto(ALL);
  await row(page, `${LAB} 01`).getByRole("button", { name: "Not on TTB" }).click();
  await expect(notice(page, /Marked “Ttb Home Ttb Lab 01” as not on TTB/)).toBeVisible();
  await expect(row(page, `${LAB} 01`)).toHaveCount(0);
  expect(await isMarkedNotOnTtb("Ttb Lab 01")).toBe(true);
  expect(await listedCount()).toBe(TOTAL - 1);
  await page.reload();
  await expect(row(page, `${LAB} 01`)).toHaveCount(0);
  await expect(row(page, `${LAB} 02`)).toBeVisible();
  // Nothing was attached: marking is not approving.
  expect(await approvalCount("Ttb Lab 01")).toBe(0);
});

test("pasting a TTB ID attaches it and the row leaves the list", async ({ page }) => {
  await page.goto(ALL);
  const target = row(page, `${LAB} 02`);
  await target.getByLabel("TTB ID").fill("21132001000620");
  await target.getByRole("button", { name: "Add", exact: true }).click();
  await expect(notice(page, /Ttb Lab 02: Added 21132001000620/)).toBeVisible();
  await expect(row(page, `${LAB} 02`)).toHaveCount(0);
  expect(await approvalCount("Ttb Lab 02")).toBe(1);
});

test("a malformed ID says what an ID looks like and keeps the row", async ({ page }) => {
  await page.goto(ALL);
  const target = row(page, `${LAB} 03`);
  await target.getByLabel("TTB ID").fill("not an id");
  await target.getByRole("button", { name: "Add", exact: true }).click();
  await expect(target.getByRole("alert")).toContainText("A TTB ID is 14 digits");
  await expect(target).toBeVisible();
  expect(await approvalCount("Ttb Lab 03")).toBe(0);
});

test("with lookup off the note says so and there is no Find on TTB", async ({ page }) => {
  await page.goto("/housekeeping");
  await expect(section(page)).toContainText("Searching TTB is off on this server");
  await expect(section(page).getByRole("button", { name: /Find on TTB/ })).toHaveCount(0);
});

test("each section keeps its own place when another changes", async ({ page }) => {
  await page.goto("/housekeeping?tab=barrels&per=12&to=8&tp=12");
  await page.getByRole("navigation", { name: "What needs a photo" }).getByRole("link", { name: /^Vintages/ }).click();
  await expect(page).toHaveURL(/tab=vintages/);
  await expect(page).toHaveURL(/to=8/);
  await expect(page).toHaveURL(/tp=12/);
  await page.getByRole("navigation", { name: "Kinds of duplicate" }).getByRole("link", { name: /^Stores/ }).click();
  await expect(page).toHaveURL(/dup=stores/);
  await expect(page).toHaveURL(/to=8/);
  await expect(page).toHaveURL(/tab=vintages/);
});

test("a window past the end opens on the last full one", async ({ page }) => {
  const total = await listedCount();
  await page.goto("/housekeeping?to=999&tp=8");
  await expect(rows(page)).not.toHaveCount(0);
  await expect(range(page)).toHaveText(new RegExp(`\\d+–${total} of ${total}`));
});

test("marking a label already marked in another tab is harmless", async ({ page, context }) => {
  const other = await context.newPage();
  await page.goto(ALL);
  await other.goto(ALL);
  await row(page, `${LAB} 04`).getByRole("button", { name: "Not on TTB" }).click();
  await expect(notice(page, /Marked “Ttb Home Ttb Lab 04”/)).toBeVisible();
  // The other tab still shows the row; the label is still there, so marking again changes nothing.
  await row(other, `${LAB} 04`).getByRole("button", { name: "Not on TTB" }).click();
  await expect(notice(other, /Marked “Ttb Home Ttb Lab 04”/)).toBeVisible();
  expect(await isMarkedNotOnTtb("Ttb Lab 04")).toBe(true);
});

test("changing one section's page size keeps the other sections' places", async ({ page }) => {
  await page.goto("/housekeeping?tab=barrels&per=12&offset=8&dup=stores&to=8");
  await section(page).getByLabel("TTB per page").selectOption("12");
  // Its own window starts over; everything else stays.
  await expect(page).toHaveURL(/tp=12/);
  await expect(page).not.toHaveURL(/to=/);
  for (const kept of [/tab=barrels/, /per=12/, /offset=8/, /dup=stores/]) await expect(page).toHaveURL(kept);

  await page.getByRole("region", { name: "Photos", exact: true }).getByLabel("Per page", { exact: true }).selectOption("24");
  await expect(page).toHaveURL(/per=24/);
  await expect(page).not.toHaveURL(/offset=/);
  for (const kept of [/tab=barrels/, /dup=stores/, /tp=12/]) await expect(page).toHaveURL(kept);
});

test("a link in another section keeps the Duplicates kind that was showing", async ({ page }) => {
  await page.goto("/housekeeping");
  const showing = await page.getByRole("navigation", { name: "Kinds of duplicate" }).locator("a[aria-current=page]").first().getAttribute("href");
  await section(page).getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/dup=/);
  expect(showing).toContain(new URL(page.url()).searchParams.get("dup")!);
});
