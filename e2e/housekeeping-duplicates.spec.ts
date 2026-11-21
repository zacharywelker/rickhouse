import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import {
  distilleryCity,
  distilleryOtherNames,
  labelDistilleries,
  labelFinishes,
  mergeLog,
  rowId,
  seedDuplicatesField,
} from "./support/housekeeping-duplicates";
import { assertThrowawayDatabase } from "./support/tournament-field";

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
  await seedDuplicatesField();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The card for a pair, found by one of its names. */
const card = (page: Page, name: string) => page.getByRole("group", { name: new RegExp(`^Likely duplicates: .*${escape(name)}`) });
const kindTab = (page: Page, name: RegExp) => page.getByRole("navigation", { name: "Kinds of duplicate" }).getByRole("link", { name });
const notice = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });

test("a kind's tab lists its pairs with why they matched and how many labels use each", async ({ page }) => {
  await page.goto("/housekeeping?dup=distilleries");
  const quarry = card(page, "Quarry Hollow Distillery");
  await expect(quarry).toContainText("Same name once “Distillery” is dropped");
  await expect(quarry).toContainText("2 labels");
  await expect(quarry).toContainText("1 label");
  await expect(card(page, "Marlow Springs Distillery")).toBeVisible();
  await expect(kindTab(page, /^Distilleries/)).toContainText("2");
});

test("choosing the other side to keep changes what it says will move, and offers what only the other side has", async ({ page }) => {
  await page.goto("/housekeeping?dup=distilleries");
  const marlow = card(page, "Marlow Springs Distillery");
  await expect(marlow).toContainText("Merging moves 1 label to Marlow Springs");
  await marlow.getByText("Marlow Springs Distillery", { exact: true }).click();
  await expect(marlow).toContainText("Merging moves 1 label to Marlow Springs Distillery");
  await expect(marlow).toContainText("keeps “Marlow Springs” as another name");
  await expect(marlow.getByRole("checkbox", { name: "City: Bardstown" })).toBeChecked();
});

test("Merge asks once, Cancel leaves everything, and Yes merge carries over the city and moves the label", async ({ page }) => {
  await page.goto("/housekeeping?dup=distilleries");
  const marlow = card(page, "Marlow Springs Distillery");
  await marlow.getByText("Marlow Springs Distillery", { exact: true }).click();
  await marlow.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(marlow).toContainText("This can’t be undone.");
  await marlow.getByRole("button", { name: "Cancel" }).click();
  await expect(marlow).not.toContainText("This can’t be undone.");
  expect(await rowId("distilleries", "Marlow Springs")).not.toBeNull();

  await marlow.getByRole("button", { name: "Merge", exact: true }).click();
  await marlow.getByRole("button", { name: "Yes, merge" }).click();
  await expect(notice(page, /Merged “Marlow Springs” into “Marlow Springs Distillery”/)).toBeVisible();
  await expect(card(page, "Marlow Springs Distillery")).toHaveCount(0);
  expect(await rowId("distilleries", "Marlow Springs")).toBeNull();
  expect(await distilleryCity("Marlow Springs Distillery")).toBe("Bardstown");
  expect(await labelDistilleries("Dup MS One")).toEqual(["Marlow Springs Distillery"]);
});

test("merging keeps the busier distillery by default, moves its labels, and keeps the removed name as another name", async ({ page }) => {
  await page.goto("/housekeeping?dup=distilleries");
  const quarry = card(page, "Quarry Hollow Distillery");
  await quarry.getByRole("button", { name: "Merge", exact: true }).click();
  await quarry.getByRole("button", { name: "Yes, merge" }).click();
  await expect(notice(page, "Merged “Quarry Hollow Distillery” into “Quarry Hollow”. 1 label moved.")).toBeVisible();
  expect(await labelDistilleries("Dup QH Three")).toEqual(["Quarry Hollow"]);
  expect(await distilleryOtherNames("Quarry Hollow")).toContain("Quarry Hollow Distillery");
  const [log] = await mergeLog();
  expect(log).toMatchObject({ kind: "distilleries", survivor_name: "Quarry Hollow", removed_name: "Quarry Hollow Distillery" });
  expect(log!.moved).toEqual([{ label: "labels", count: 1 }]);
  // The label's own page shows the survivor.
  const id = await rowId("expressions", "Dup QH Three");
  await page.goto(`/expressions/${id}`);
  await expect(page.locator("body")).toContainText("Quarry Hollow");
  await expect(page.locator("body")).not.toContainText("Quarry Hollow Distillery");
});

test("Not a duplicate removes the pair and it is still gone after a reload", async ({ page }) => {
  await page.goto("/housekeeping?dup=brands");
  const roses = card(page, "Fenwick Rose");
  await roses.getByRole("button", { name: "Not a duplicate" }).click();
  await expect(notice(page, /Marked as different/)).toBeVisible();
  await page.reload();
  await expect(card(page, "Fenwick Rose")).toHaveCount(0);
  await expect(card(page, "Clash Brand")).toBeVisible();
});

test("brands that each have a label of the same name cannot be merged, and nothing changes", async ({ page }) => {
  await page.goto("/housekeeping?dup=brands");
  const clash = card(page, "Clash Brand");
  await expect(clash).toContainText("Both brands have a label called “Shared Name”. Merge those labels first.");
  await expect(clash.getByRole("button", { name: "Merge", exact: true })).toBeDisabled();
  expect(await rowId("brands", "Clash Brand")).not.toBeNull();
  expect(await rowId("brands", "Clash Brands")).not.toBeNull();
});

test("merging finishes keeps every label's finishes and pairings consistent", async ({ page }) => {
  await page.goto("/housekeeping?dup=finishes");
  const quince = card(page, "Quince Cask");
  // The plural is on two labels and the singular on one, so the plural is kept, one label moves, and it adopts the removed finish's type.
  await expect(quince).toContainText("Merging moves 1 label to Quince Casks");
  await expect(quince.getByRole("checkbox", { name: "Finish type: wine" })).toBeChecked();
  await quince.getByRole("button", { name: "Merge", exact: true }).click();
  await quince.getByRole("button", { name: "Yes, merge" }).click();
  await expect(notice(page, /Merged “Quince Cask” into “Quince Casks”/)).toBeVisible();
  expect(await rowId("finishes", "Quince Cask")).toBeNull();
  expect(await labelFinishes("Dup Finish Both")).toEqual({ finishes: ["Quince Casks"], pairings: ["Quince Casks"] });
  expect(await labelFinishes("Dup Finish Only")).toEqual({ finishes: ["Quince Casks"], pairings: ["Quince Casks"] });
  const id = await rowId("expressions", "Dup Finish Both");
  const response = await page.goto(`/expressions/${id}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toContainText("Quince Casks");
});

test("a link in one section does not reset the other", async ({ page }) => {
  await page.goto("/housekeeping?tab=barrels&per=12");
  await kindTab(page, /^Stores/).click();
  await expect(page).toHaveURL(/tab=barrels/);
  await expect(page).toHaveURL(/per=12/);
  await expect(page).toHaveURL(/dup=stores/);
  await page.getByRole("navigation", { name: "What needs a photo" }).getByRole("link", { name: /^Vintages/ }).click();
  await expect(page).toHaveURL(/tab=vintages/);
  await expect(page).toHaveURL(/dup=stores/);
});

test("merging a pair that was already merged in another tab says so", async ({ page, context }) => {
  const other = await context.newPage();
  await page.goto("/housekeeping?dup=stores");
  await other.goto("/housekeeping?dup=stores");
  const first = card(page, "Hallorans");
  await first.getByRole("button", { name: "Merge", exact: true }).click();
  await first.getByRole("button", { name: "Yes, merge" }).click();
  await expect(notice(page, /Merged “/)).toBeVisible();

  const stale = card(other, "Hallorans");
  await stale.getByRole("button", { name: "Merge", exact: true }).click();
  await stale.getByRole("button", { name: "Yes, merge" }).click();
  await expect(stale.getByRole("alert")).toContainText("already been merged");
  const survivors = [await rowId("stores", "Halloran's"), await rowId("stores", "Hallorans")].filter((id) => id !== null);
  expect(survivors).toHaveLength(1);
});
