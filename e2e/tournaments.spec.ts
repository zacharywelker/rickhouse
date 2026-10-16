import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import { assertThrowawayDatabase, FIELD_BRAND, FIELD_COUNT, FIELD_NAMES, seedTournamentField } from "./support/tournament-field";

const stamp = () => Math.random().toString(36).slice(2, 8);

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
  await seedTournamentField();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

/** Sets up a tournament of the eight seeded bottles through the setup page and lands on its draft. */
async function createTournament(page: Page, opts: { blind?: boolean; size?: 2 | 3 | 4 } = {}): Promise<{ name: string; id: string }> {
  const name = `Cup ${stamp()}`;
  await page.goto("/tournaments/new");
  await page.getByRole("searchbox", { name: "Search your bottles" }).fill(FIELD_BRAND);
  // Enter in the search must not submit the setup form.
  await page.getByRole("searchbox", { name: "Search your bottles" }).press("Enter");
  await page.getByLabel("Name", { exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/tournaments\/new$/);
  await expect(page.getByText(`0 of ${FIELD_COUNT} chosen`)).toBeVisible();
  await page.getByRole("button", { name: "Select all shown" }).click();
  await expect(page.getByText(`${FIELD_COUNT} of ${FIELD_COUNT} chosen`)).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill(name);
  if (opts.size) await page.getByRole("radiogroup", { name: "Bottles per flight" }).getByRole("radio", { name: String(opts.size) }).click();
  if (opts.blind) await page.getByRole("checkbox", { name: "Blind" }).check();
  await page.getByRole("button", { name: "Create tournament" }).click();
  await expect(page).toHaveURL(/\/tournaments\/\d+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  return { name, id: page.url().split("/").pop()! };
}

async function start(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Start tournament" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start tournament" }).click();
  await expect(page.getByText("Round 1 of", { exact: false })).toBeVisible();
}

/** The flights of the rounds that exist; the planned round is an unnamed article. */
const flights = (page: Page) => page.getByRole("article", { name: /.+/ });

test("an open tournament is played to a champion", async ({ page }) => {
  const { name } = await createTournament(page);

  // The draft already shows round 1 (2 flights of 4) and the planned rounds after it.
  await expect(flights(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Reset to automatic" })).toBeEnabled();
  await start(page);
  await expect(page.getByRole("link", { name: "Play" })).toHaveCount(2);

  // Each flight: rank by the buttons, once by the keyboard, and record.
  let keyboardDone = false;
  let champion = false;
  for (let guard = 0; guard < 6 && !champion; guard++) {
    await page.goto(page.url().replace(/\/play\/.*$/, ""));
    if (await page.getByText(/^Champion:/).isVisible()) {
      champion = true;
      break;
    }
    await page.getByRole("link", { name: "Play" }).first().click();
    const ranking = page.getByRole("region", { name: "Rank the bottles" });
    await expect(ranking).toBeVisible();
    const first = ranking.getByRole("listitem").first();
    const before = await first.innerText();
    if (!keyboardDone) {
      const down = first.getByRole("button", { name: /^Move .* down$/ });
      await down.focus();
      await page.keyboard.press("Enter");
      await expect(first).not.toHaveText(before);
      keyboardDone = true;
    } else {
      await first.getByRole("button", { name: /^Move .* down$/ }).click();
      await expect(first).not.toHaveText(before);
    }
    await page.getByRole("button", { name: "Record result" }).click();
    await expect(page.getByRole("heading", { name: "Result recorded" })).toBeVisible();
    await page.goto(`/tournaments/${page.url().match(/tournaments\/(\d+)/)![1]}`);
  }
  expect(keyboardDone).toBe(true);

  await expect(page.getByText(/^Champion:/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Final standings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Play" })).toHaveCount(0);

  await page.goto("/tournaments");
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("Complete");

  await page.goto("/tournaments/ranking");
  await expect(page.getByText(`${FIELD_COUNT} ranked from every finished flight`)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: FIELD_NAMES }).first()).toBeVisible();
});

test("a solo blind tournament hides names until the result is recorded", async ({ page }) => {
  await createTournament(page, { blind: true });
  await start(page);

  // Pending flights name nothing, only their proof band.
  await expect(page.getByText("Hidden until it's tasted")).toHaveCount(FIELD_COUNT);
  await expect(page.locator("body")).not.toContainText(FIELD_NAMES);
  expect(await page.content()).not.toMatch(FIELD_NAMES);
  await expect(flights(page).first()).toContainText(/\d+.*proof/i);

  await page.getByRole("link", { name: "Play" }).first().click();
  await page.getByRole("button", { name: "Show the glasses" }).click();
  const glasses = page.getByRole("region", { name: "Glasses" });
  await expect(glasses).toBeVisible();

  // Change one letter: trade the first two glasses, which needs a duplicate-free set before it can be saved.
  const selects = glasses.getByRole("combobox");
  const [a, b] = [await selects.nth(0).inputValue(), await selects.nth(1).inputValue()];
  await selects.nth(0).selectOption(b);
  await expect(glasses.getByRole("alert")).toBeVisible();
  await selects.nth(1).selectOption(a);
  await expect(glasses.getByRole("alert")).toHaveCount(0);
  await glasses.getByRole("button", { name: "Save letters" }).click();
  await expect(glasses.getByRole("button", { name: "Hide and hand over" })).toBeEnabled();
  await glasses.getByRole("button", { name: "Hide and hand over" }).click();

  const ranking = page.getByRole("region", { name: "Rank the glasses" });
  await expect(ranking).toBeVisible();
  await expect(page.locator("body")).not.toContainText(FIELD_NAMES);
  expect(await page.content()).not.toMatch(FIELD_NAMES);
  // Hiding moves focus to the new stage's heading.
  await expect(ranking.getByRole("heading", { name: "Rank the glasses, best first" })).toBeFocused();

  await ranking.getByRole("listitem").first().getByRole("button", { name: /down$/ }).click();
  await page.getByRole("button", { name: "Record result" }).click();
  const result = page.getByRole("status", { name: "Result" });
  await expect(result.getByRole("heading", { name: "Result recorded" })).toBeFocused();
  await expect(result.getByRole("listitem")).toHaveCount(4);
  await expect(result.getByRole("listitem").first()).toContainText(FIELD_NAMES);
});

test("a pourer draws a blind flight and only that flight is revealed", async ({ page }) => {
  await createTournament(page, { blind: true });
  await start(page);

  await page.getByRole("button", { name: "Draw a flight" }).click();
  await expect(page).toHaveURL(/\/play\/\d+\?drawn=1/);
  const glasses = page.getByRole("region", { name: "Glasses" });
  await expect(glasses).toBeVisible();
  await expect(glasses.getByRole("combobox")).toHaveCount(4);
  await glasses.getByRole("button", { name: "Hide and hand over" }).click();

  const ranking = page.getByRole("region", { name: "Rank the glasses" });
  await expect(ranking).toBeVisible();
  await expect(page.locator("body")).not.toContainText(FIELD_NAMES);
  await ranking.getByRole("listitem").nth(1).getByRole("button", { name: /up$/ }).click();
  await page.getByRole("button", { name: "Record result" }).click();
  await expect(page.getByRole("heading", { name: "Result recorded" })).toBeVisible();

  await page.getByRole("link", { name: "Back to the bracket" }).click();
  await expect(page).toHaveURL(/\/tournaments\/\d+$/);
  // One flight decided and named, the other still hidden.
  await expect(page.getByText("Hidden until it's tasted")).toHaveCount(4);
  const decided = flights(page).filter({ hasText: FIELD_NAMES });
  await expect(decided).toHaveCount(1);
  await expect(decided.getByRole("link", { name: "Play" })).toHaveCount(0);
  await expect(flights(page).filter({ hasText: "Hidden until it's tasted" }).getByRole("link", { name: "Play" })).toHaveCount(1);
});

test("a draft can be edited before it starts", async ({ page }) => {
  await createTournament(page);
  await expect(flights(page)).toHaveCount(2);

  // Swap a bottle of the first flight with one of the second (both are full, so Move to is disabled).
  const members = (n: number) => flights(page).nth(n).getByRole("listitem").allInnerTexts();
  const [first0, second0] = [await members(0), await members(1)];
  const target = first0[0]!.split("\n")[0]!;
  await flights(page).first().getByRole("button", { name: /^Move .* to another flight$/ }).first().click();
  await page.getByPlaceholder("Find a bottle…").first().fill(FIELD_BRAND);
  await page.getByRole("option").first().click();
  await expect.poll(async () => (await members(0)).join("|")).not.toBe(first0.join("|"));
  expect((await members(0)).join("|")).not.toContain(target);
  expect(second0.join("|")).toContain(second0[0]!.split("\n")[0]!);

  // Rename a flight, then change the priority: flights regroup and your name is gone.
  await page.getByRole("button", { name: "Rename flight 1" }).click();
  await page.getByLabel("Name for flight 1").fill("Warm-up");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("heading", { name: "Warm-up" })).toBeVisible();
  await expect(page.getByText("Yours")).toBeVisible();
  await page.getByRole("button", { name: "Move Finish up" }).click();
  await expect(page.getByText("Yours")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Warm-up" })).toHaveCount(0);

  // Edit the field down to six.
  await page.getByRole("button", { name: "Edit field" }).click();
  await expect(page.getByRole("button", { name: `Remove ${FIELD_BRAND} Ravenel` })).toBeVisible();
  await page.getByRole("button", { name: `Remove ${FIELD_BRAND} Ravenel` }).click();
  await page.getByRole("button", { name: `Remove ${FIELD_BRAND} Penhall` }).click();
  await page.getByRole("button", { name: "Save field" }).click();
  await expect(page.getByText("6 entries").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit field" })).toBeVisible();
  await expect(flights(page).getByRole("listitem")).toHaveCount(6);

  // Reset to automatic clears a name you gave.
  await page.getByRole("button", { name: "Rename flight 1" }).click();
  await page.getByLabel("Name for flight 1").fill("Again");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Yours")).toBeVisible();
  await page.getByRole("button", { name: "Reset to automatic" }).click();
  await expect(page.getByText("Yours")).toHaveCount(0);
});

test("a sticky round header never covers a control that takes focus", async ({ page }) => {
  await createTournament(page);
  await page.setViewportSize({ width: 1280, height: 320 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const move = flights(page).first().getByRole("button", { name: /^Move .* to another flight$/ }).first();
  await move.focus();
  await expect.poll(async () => (await move.boundingBox())?.y ?? -1).toBeGreaterThan(0);
  const header = page.locator("section[aria-labelledby='round-1'] > header");
  const bottom = await header.evaluate((el) => el.getBoundingClientRect().bottom);
  const top = (await move.boundingBox())!.y;
  expect(top).toBeGreaterThanOrEqual(bottom - 1);
});

test("the Tournaments link is in the header on a wide screen and in the menu below it", async ({ page }) => {
  const main = page.getByRole("navigation", { name: "Main" });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(main.getByRole("link", { name: "Tournaments" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();

  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(main).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open menu" }).click();
  await main.getByRole("link", { name: "Tournaments" }).click();
  await expect(page).toHaveURL(/\/tournaments$/);
  await expect(page.getByRole("heading", { name: "Tournaments", level: 1 })).toBeVisible();
});
