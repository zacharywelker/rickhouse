import { expect, test, type Page } from "@playwright/test";
import { resetDatabase } from "./support/db";

/**
 * M6: the theme, the phone layout, the shortcuts and full-text search.
 */

const PASSWORD = process.env.E2E_APP_PASSWORD ?? "smoke-test-password";
const PHONE = { width: 390, height: 844 };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page).toHaveURL("/");
}

const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const DARK = "rgb(24, 23, 19)";
const LIGHT = "rgb(250, 248, 241)";

/**
 * Shortcuts are bound on hydration, so on a cold page the first keypress can
 * land before the listener exists. Press until it takes rather than asserting
 * that the first one must — the guarantee the app makes is "once the page is
 * live", not "within one frame of navigation".
 */
async function pressUntilAt(page: Page, key: string, pathname: string) {
  await expect
    .poll(
      async () => {
        if (new URL(page.url()).pathname === pathname) return pathname;
        await page.keyboard.press(key);
        return new URL(page.url()).pathname;
      },
      { timeout: 15_000 },
    )
    .toBe(pathname);
}

test.beforeAll(resetDatabase);

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.describe("theme", () => {
  test.use({ colorScheme: "dark" });

  test("follows the system, and the toggle beats it in both directions", async ({ page }) => {
    await page.goto("/bottles");
    expect(await background(page)).toBe(DARK);

    await page.getByRole("radio", { name: "Light" }).click();
    await expect.poll(() => background(page)).toBe(LIGHT);

    // Survives a reload without flashing back: the stamp is applied in <head>.
    await page.reload();
    expect(await page.locator("html").getAttribute("data-theme")).toBe("light");
    expect(await background(page)).toBe(LIGHT);

    await page.getByRole("radio", { name: "System" }).click();
    await expect.poll(() => background(page)).toBe(DARK);
    expect(await page.locator("html").getAttribute("data-theme")).toBeNull();
  });

  test("a stored choice is applied before the page renders, not after", async ({ page }) => {
    await page.goto("/bottles");
    await page.getByRole("radio", { name: "Light" }).click();
    await expect.poll(() => background(page)).toBe(LIGHT);

    // No paint may happen in the dark default first. Checked against the very
    // first frame rather than the settled state, which is where a theme
    // toggle bolted on after hydration would fail.
    await page.goto("/numbers", { waitUntil: "commit" });
    expect(await page.locator("html").getAttribute("data-theme")).toBe("light");
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: PHONE });

  test("no page scrolls sideways, and the nav collapses behind a menu", async ({ page }) => {
    for (const path of ["/", "/bottles", "/numbers", "/admin"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
    }

    await page.goto("/bottles");
    await expect(page.getByRole("link", { name: "Collection" })).toBeHidden();
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("link", { name: "Collection" })).toBeVisible();

    // Escape closes it, like every other dismissable surface.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "Collection" })).toBeHidden();
  });

  test("the grid becomes cards, and they still sort", async ({ page }) => {
    await page.goto("/bottles");
    // The table is the desktop view; the phone gets a list of links.
    await expect(page.getByRole("table")).toBeHidden();
    await expect(page.getByRole("link", { name: /Double Oak Spirit/ })).toBeVisible();

    await page.getByLabel("Sort", { exact: true }).selectOption("proof");
    await expect(page).toHaveURL(/sort=proof/);
  });

  test("the filter row is behind a disclosure so bottles are above the fold", async ({ page }) => {
    await page.goto("/bottles");
    await expect(page.getByRole("button", { name: "Filter by distillery" })).toBeHidden();
    await page.getByRole("button", { name: /^Filters/ }).click();
    await expect(page.getByRole("button", { name: "Filter by distillery" })).toBeVisible();
  });
});

test.describe("keyboard shortcuts", () => {
  test("slash focuses search, and n starts a new bottle", async ({ page }) => {
    const search = page.getByRole("textbox", { name: "Search bottles" });
    await page.goto("/bottles");
    await expect
      .poll(
        async () => {
          if (await search.evaluate((el) => el === document.activeElement)) return true;
          await page.keyboard.press("/");
          return search.evaluate((el) => el === document.activeElement);
        },
        { timeout: 15_000 },
      )
      .toBe(true);

    // And it must not hijack the key while you are typing into a field.
    await page.keyboard.type("n/a");
    await expect(search).toHaveValue("n/a");
    await expect(page).toHaveURL(/\/bottles$/);

    await page.goto("/bottles");
    await pressUntilAt(page, "n", "/bottles/new");
  });

  test("slash from a page without a search box goes where searching happens", async ({ page }) => {
    await page.goto("/numbers");
    await pressUntilAt(page, "/", "/bottles");
  });
});

test("search reaches into tasting notes, not just the label", async ({ page }) => {
  await page.goto("/bottles");
  await page.getByRole("link", { name: /Double Oak Spirit/ }).first().click();
  await expect(page).toHaveURL(/\/bottles\/\d+$/);

  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByLabel("Nose").fill("Unmistakable gooseberry and wet slate");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Unmistakable gooseberry")).toBeVisible();

  // The word appears nowhere on the label — only in the note.
  await page.goto("/bottles?q=gooseberry");
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();

  // Stemming comes from the tsvector; "slate" and "slates" are the same word.
  await page.goto("/bottles?q=slates");
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();

  // And a partial word still works, which full text alone would not give.
  await page.goto("/bottles?q=goose");
  await expect(page.getByRole("cell", { name: "Double Oak Spirit", exact: true })).toBeVisible();

  await page.goto("/bottles?q=zzzznothing");
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
});
