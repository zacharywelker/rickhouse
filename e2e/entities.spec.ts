import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";

const stamp = () => Math.random().toString(36).slice(2, 8);

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

/** The M5 acceptance criterion. */
test("a distillery chip leads to a page listing the blend it contributed to", async ({ page }) => {
  await openSeededBottle(page);
  // The distillery appears twice now: as a chip, and again as the source of
  // its mashbill on this three-way blend. The chip is the one under test.
  await page.getByRole("link", { name: "Bardstown Bourbon Company" }).first().click();

  await expect(page).toHaveURL("/distilleries/bardstown-bourbon-company");
  await expect(page.getByRole("heading", { name: "Bardstown Bourbon Company" })).toBeVisible();
  // The Pursuit bottle is a three-way blend; it belongs here all the same.
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();
  await expect(page.getByText("Bottles").first()).toBeVisible();
});

test("brand, store, finish and mashbill all have pages of their own", async ({ page }) => {
  await openSeededBottle(page);

  await page.getByRole("link", { name: "Pursuit Spirits", exact: true }).first().click();
  await expect(page).toHaveURL(/\/brands\//);
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();

  await openSeededBottle(page);
  await page.getByRole("link", { name: "French Oak" }).click();
  await expect(page).toHaveURL("/finishes/french-oak");
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();

  await openSeededBottle(page);
  await page.getByRole("link", { name: "P.Club by Pursuit Spirits" }).click();
  await expect(page).toHaveURL("/stores/p-club");
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();

  // A mashbill reads as its recipe now, not its name (SPEC M7).
  await openSeededBottle(page);
  await page.getByRole("link", { name: "78% Corn · 10% Rye · 12% Malted Barley" }).click();
  await expect(page).toHaveURL(/\/mashbills\/\d+$/);
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();
});

test("on a blend, each mashbill says which distillery it came from", async ({ page }) => {
  await openSeededBottle(page);
  // Three distilleries, three recipes — "78% corn" is meaningless without
  // knowing whose (SPEC M7).
  await expect(page.getByText("from Bardstown Bourbon Company")).toBeVisible();
  await expect(page.getByText("from Tennessee Distilling Ltd.")).toBeVisible();
  await expect(page.getByText("from Finger Lakes Distilling")).toBeVisible();
});

test("an entity page keeps the grid's sorting and view controls", async ({ page }) => {
  await page.goto("/distilleries/bardstown-bourbon-company");
  await page.getByRole("button", { name: "Sort by Proof" }).click();
  await expect(page).toHaveURL(/sort=proof/);
  // The preset must survive: still only this distillery's bottles.
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();
});

test("the dashboard renders its charts and can show the numbers instead", async ({ page }) => {
  await page.goto("/numbers");
  await expect(page.getByRole("heading", { name: "Numbers" })).toBeVisible();
  await expect(page.getByText("What the collection is")).toBeVisible();
  await expect(page.getByText("Proof distribution")).toBeVisible();
  await expect(page.getByText("Most represented distilleries")).toBeVisible();

  // Every chart ships with the numbers behind it, for screen readers and for
  // anyone who cannot read the colours.
  const card = page.locator("div").filter({ hasText: /^What the collection is/ }).first();
  await card.getByRole("button", { name: "Table" }).click();
  await expect(page.getByRole("columnheader", { name: "Share" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Bourbon", exact: true })).toBeVisible();
});

test("the collection exports as CSV", async ({ page }) => {
  await page.goto("/bottles");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^rickhouse-\d{4}-\d{2}-\d{2}\.csv$/);

  const stream = await download.createReadStream();
  const text = await new Promise<string>((resolve, reject) => {
    let out = "";
    stream.on("data", (chunk) => (out += String(chunk)));
    stream.on("end", () => resolve(out));
    stream.on("error", reject);
  });
  expect(text).toContain("brand,expression,batch,category");
  expect(text).toContain("Pursuit Spirits");
  // The age statement has a comma in it, so it must come back quoted.
  expect(text).toContain('"NAS (labeled Straight, so at least 2 years)"');
});

test("pasted CSV rows are imported, and a bad row is reported rather than swallowed", async ({ page }) => {
  const good = `Weller Import ${stamp()}`;
  await page.goto("/bottles/import");
  await page.getByLabel("Or paste rows").fill(
    [
      "brand,expression,category,proof,distilleries,price_paid,status",
      `Weller,${good},Bourbon,107,Buffalo Trace,54.99,owned`,
      `Weller,No Such Category,Klingon Whisky,90,,20,owned`,
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Import" }).click();

  await expect(page.getByRole("heading", { name: /1 imported, 1 failed/ })).toBeVisible();
  await expect(page.getByText(/No category called "Klingon Whisky"/)).toBeVisible();

  // The good row really landed, and created the distillery it referenced.
  await page.goto("/bottles");
  await expect(page.getByRole("cell", { name: good, exact: true })).toBeVisible();
  await page.goto("/admin/distilleries");
  await expect(page.getByRole("cell", { name: "Buffalo Trace", exact: true })).toBeVisible();
});

test("a tasting note can be edited after the fact", async ({ page }) => {
  const first = `Caramel ${stamp()}`;
  const corrected = `Corrected ${stamp()}`;

  await openSeededBottle(page);
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByLabel("Rating").fill("7");
  await page.getByLabel("Nose").fill(first);
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText(first)).toBeVisible();

  await page.getByRole("button", { name: /^Edit note from/ }).click();
  await expect(page.getByLabel("Rating")).toHaveValue("7");
  await page.getByLabel("Rating").fill("8.5");
  await page.getByLabel("Nose").fill(corrected);
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText(corrected)).toBeVisible();
  await expect(page.getByText(first)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(corrected)).toBeVisible();
});
