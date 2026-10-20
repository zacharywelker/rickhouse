import { expect, test, type Locator, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import {
  assertThrowawayDatabase,
  FIELD_BRAND,
  FIELD_COUNT,
  FIELD_NAMES,
  RICH_BRAND,
  RICH_COUNT,
  RICH_DISTILLERIES,
  RICH_FINISH,
  RICH_NAMES,
  seedRichField,
  seedTournamentField,
} from "./support/tournament-field";

const stamp = () => Math.random().toString(36).slice(2, 8);

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
  await seedTournamentField();
  await seedRichField();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

/** Sets up a tournament of the eight seeded bottles through the setup page and lands on its draft. */
async function createTournament(
  page: Page,
  opts: { blind?: boolean; size?: 2 | 3 | 4 | 5 | 6; brand?: string; count?: number } = {},
): Promise<{ name: string; id: string }> {
  const name = `Cup ${stamp()}`;
  const { brand = FIELD_BRAND, count = FIELD_COUNT } = opts;
  await page.goto("/tournaments/new");
  await page.getByRole("searchbox", { name: "Search your bottles" }).fill(brand);
  // Enter in the search must not submit the setup form.
  await page.getByRole("searchbox", { name: "Search your bottles" }).press("Enter");
  await page.getByLabel("Name", { exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/tournaments\/new$/);
  await expect(page.getByText(`0 of ${count} chosen`)).toBeVisible();
  await page.getByRole("button", { name: "Select all shown" }).click();
  await expect(page.getByText(`${count} of ${count} chosen`)).toBeVisible();
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

  // Swap a bottle of the first flight with one of the second (both are full, so the menu offers only Swap).
  const members = (n: number) => flights(page).nth(n).getByRole("listitem").allInnerTexts();
  const [first0, second0] = [await members(0), await members(1)];
  const target = first0[0]!.split("\n")[0]!;
  await flights(page).first().getByRole("button", { name: /^Move .* to another flight$/ }).first().click();
  await page.getByRole("option", { name: "Swap with a bottle…" }).click();
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
  await expect(page.getByRole("button", { name: `Remove ${FIELD_BRAND} Ravenel`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Remove ${FIELD_BRAND} Ravenel`, exact: true }).click();
  await page.getByRole("button", { name: `Remove ${FIELD_BRAND} Penhall`, exact: true }).click();
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

// ---- The feedback round: facts in the draft, flights of six, remove a bottle, smart titles, drag and drop. ----
// The "Rh" field is 13 bottles. At flights of 4 (in proof order): High rye bourbons, Wheated bourbons, Wine-finished ryes and a lone single malt.

const rich = (name: string) => `${RICH_BRAND} ${name}`;
const rows = (flight: Locator) => flight.getByRole("listitem");
const titles = (page: Page) => flights(page).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
const status = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });

/** A draft of the thirteen "Rh" bottles at flights of 4, on a page tall enough to show every flight without scrolling. */
async function richDraft(page: Page, size: 4 | 6 = 4, blind = false): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 2600 });
  await createTournament(page, { brand: RICH_BRAND, count: RICH_COUNT, size, blind });
  await expect(flights(page)).toHaveCount(size === 4 ? 4 : 3);
}

/** Native HTML5 drag and drop with a real mouse: pick up at the left edge of `source` (its grip) and let go over `target`. */
async function dragOnto(page: Page, source: Locator, target: Locator): Promise<void> {
  const [a, b] = [await source.boundingBox(), await target.boundingBox()];
  if (!a || !b) throw new Error("dragOnto: source or target is not on the page");
  const [sx, sy] = [a.x + 16, a.y + a.height / 2];
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 10, sy + 10, { steps: 3 });
  await page.mouse.move(b.x + Math.min(200, b.width / 2), b.y + b.height / 2, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

test("a draft shows proof, mashbill with its category, age, distillery and finish, and names each flight from what its bottles share", async ({ page }) => {
  await richDraft(page);

  await expect(await titles(page)).toEqual(["High rye bourbons", "Wheated bourbons", "Wine-finished ryes", expect.any(String)]);
  // The band is the subtitle of every flight, not its name.
  await expect(flights(page).nth(0)).toContainText("90 to 93 proof");
  await expect(flights(page).nth(1)).toContainText("100 to 103 proof");
  await expect(flights(page).nth(2)).toContainText("110 to 113 proof");

  const first = flights(page).nth(0);
  for (const column of ["Bottle", "Proof", "Mashbill", "Age", "Distillery", "Finish"]) await expect(first).toContainText(column);
  const aldous = rows(first).filter({ hasText: rich(RICH_NAMES.highRye[0]) });
  await expect(aldous).toContainText("90");
  await expect(aldous).toContainText("60/28/12");
  await expect(aldous).toContainText("Bourbon"); // the category sits under the mashbill
  await expect(aldous).toContainText("4 yr");
  await expect(aldous).toContainText(RICH_DISTILLERIES[0]);
  await expect(rows(flights(page).nth(2)).filter({ hasText: rich(RICH_NAMES.rye[0]) })).toContainText(RICH_FINISH);
  await expect(rows(flights(page).nth(2)).filter({ hasText: rich(RICH_NAMES.rye[0]) })).toContainText("95/5");
  // Under the mashbill of a rye, "Rye" says what the 95/5 is.
  await expect(rows(flights(page).nth(2)).filter({ hasText: rich(RICH_NAMES.rye[0]) }).getByText("Rye", { exact: true })).toBeVisible();
});

test("flights of six can be made and played, with glass letters up to F", async ({ page }) => {
  await richDraft(page, 6, true);
  await expect(rows(flights(page).nth(0))).toHaveCount(6);
  await expect(rows(flights(page).nth(1))).toHaveCount(6);
  await expect(rows(flights(page).nth(2))).toHaveCount(1);
  await expect(page.getByRole("radiogroup", { name: "Bottles per flight" }).getByRole("radio", { name: "6" })).toBeChecked();

  await start(page);
  await page.getByRole("link", { name: "Play" }).first().click();
  await page.getByRole("button", { name: "Show the glasses" }).click();
  const glasses = page.getByRole("region", { name: "Glasses" });
  const selects = glasses.getByRole("combobox");
  await expect(selects).toHaveCount(6);
  expect((await selects.nth(0).locator("option").allInnerTexts()).join("")).toContain("F");
  await glasses.getByRole("button", { name: "Hide and hand over" }).click();

  const ranking = page.getByRole("region", { name: "Rank the glasses" });
  await expect(ranking.getByRole("listitem")).toHaveCount(6);
  await ranking.getByRole("listitem").first().getByRole("button", { name: /down$/ }).click();
  await page.getByRole("button", { name: "Record result" }).click();
  const result = page.getByRole("status", { name: "Result" });
  await expect(result.getByRole("listitem")).toHaveCount(6);
  await expect(result.getByRole("listitem").first()).toContainText(RICH_BRAND);
});

test("a bottle can be removed from a draft: its flight shrinks, the others stay, an emptied flight goes", async ({ page }) => {
  await richDraft(page);
  const [second, third] = [await flights(page).nth(1).innerText(), await flights(page).nth(2).innerText()];

  await page.getByRole("button", { name: `Remove ${rich(RICH_NAMES.highRye[0])} from the tournament` }).click();
  await expect(rows(flights(page).nth(0))).toHaveCount(3);
  await expect(page.getByText(rich(RICH_NAMES.highRye[0]))).toHaveCount(0);
  await expect(flights(page)).toHaveCount(4);
  expect(await flights(page).nth(1).innerText()).toBe(second);
  expect(await flights(page).nth(2).innerText()).toBe(third);
  expect(await titles(page)).toContain("High rye bourbons");

  // The lone bottle is a flight of its own: removing it takes the flight with it.
  await page.getByRole("button", { name: `Remove ${rich(RICH_NAMES.malt)} from the tournament` }).click();
  await expect(flights(page)).toHaveCount(3);
  await expect(page.getByText(rich(RICH_NAMES.malt))).toHaveCount(0);
});

test("the flight with one bottle keeps its menu and its remove button", async ({ page }) => {
  await richDraft(page);
  const lone = flights(page).nth(3);
  await expect(rows(lone)).toHaveCount(1);
  await expect(lone.getByRole("button", { name: `Move ${rich(RICH_NAMES.malt)} to another flight` })).toBeVisible();
  await expect(lone.getByRole("button", { name: `Remove ${rich(RICH_NAMES.malt)} from the tournament` })).toBeVisible();
});

test("a bottle is dragged to another flight, and onto another bottle to swap", async ({ page }) => {
  await richDraft(page);
  const grabbed = rich(RICH_NAMES.highRye[0]);

  // To a flight with room (the lone bottle's): it moves.
  await dragOnto(page, rows(flights(page).nth(0)).filter({ hasText: grabbed }), flights(page).nth(3).getByRole("heading", { level: 3 }));
  await expect(rows(flights(page).nth(3))).toHaveCount(2);
  await expect(rows(flights(page).nth(0))).toHaveCount(3);
  await expect(rows(flights(page).nth(3)).filter({ hasText: grabbed })).toHaveCount(1);
  await expect(status(page, `Moved ${grabbed} to Flight 4`)).toBeVisible();

  // Onto a bottle of a full flight: the two trade places.
  const [a, b] = [rich(RICH_NAMES.wheated[0]), rich(RICH_NAMES.rye[0])];
  await dragOnto(page, rows(flights(page).nth(1)).filter({ hasText: a }), rows(flights(page).nth(2)).filter({ hasText: b }));
  await expect(rows(flights(page).nth(1)).filter({ hasText: b })).toHaveCount(1);
  await expect(rows(flights(page).nth(2)).filter({ hasText: a })).toHaveCount(1);
  await expect(status(page, `Swapped ${a} with ${b}`)).toBeVisible();
  await expect(rows(flights(page).nth(1))).toHaveCount(4);
});

test("flights are reordered by dragging and by the move buttons", async ({ page }) => {
  await richDraft(page);
  const order = ["High rye bourbons", "Wheated bourbons", "Wine-finished ryes"];
  expect((await titles(page)).slice(0, 3)).toEqual(order);
  await expect(page.getByRole("button", { name: "Move flight 1 up" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move flight 4 down" })).toBeDisabled();

  // Drag the third flight onto the first.
  await dragOnto(page, page.getByRole("img", { name: "Drag flight 3 to reorder" }), flights(page).nth(0).getByRole("heading", { level: 3 }));
  await expect.poll(async () => (await titles(page)).slice(0, 3)).toEqual([order[2], order[0], order[1]]);
  await expect(status(page, "Moved flight 3 to position 1")).toBeVisible();

  // The buttons do the same: first flight down one place, and the keyboard keeps its place on the button.
  const down = page.getByRole("button", { name: "Move flight 1 down" });
  await down.focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await titles(page)).slice(0, 3)).toEqual([order[0], order[2], order[1]]);
  await expect(status(page, "Moved flight 1 to position 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Move flight 2 down" })).toBeFocused();
  await page.getByRole("button", { name: "Move flight 3 up" }).click();
  await expect.poll(async () => (await titles(page)).slice(0, 3)).toEqual([order[0], order[1], order[2]]);
});

test("the menu on a bottle is short and works from the keyboard: move to a flight, swap with a bottle", async ({ page }) => {
  await richDraft(page);
  const mover = rich(RICH_NAMES.highRye[0]);

  // Flights 1 to 3 are full; the lone bottle's has room, so it is the one place offered to Move to.
  const menu = page.getByRole("button", { name: `Move ${mover} to another flight` });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option")).toHaveCount(2); // "Flight 4 · …" and "Swap with a bottle…"
  await expect(page.getByRole("option").first()).toContainText("Flight 4");
  await expect(page.getByRole("option").first()).toContainText("1 of 4");
  await page.keyboard.press("Enter");
  await expect(rows(flights(page).nth(3)).filter({ hasText: mover })).toHaveCount(1);
  await expect(status(page, `Moved ${mover} to Flight 4`)).toBeVisible();

  // Swap: arrow to the last item, Enter, type to find the bottle, Enter.
  const [a, b] = [rich(RICH_NAMES.wheated[0]), rich(RICH_NAMES.rye[0])];
  await page.getByRole("button", { name: `Move ${a} to another flight` }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(RICH_NAMES.rye[0]);
  await page.keyboard.press("Enter");
  await expect(rows(flights(page).nth(1)).filter({ hasText: b })).toHaveCount(1);
  await expect(rows(flights(page).nth(2)).filter({ hasText: a })).toHaveCount(1);
  await expect(status(page, `Swapped ${a} with ${b}`)).toBeVisible();
});
