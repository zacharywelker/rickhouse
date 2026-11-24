import { expect, test } from "@playwright/test";
import { MEMBER, signIn, signOut } from "./support/auth";
import { resetDatabase } from "./support/db";

/**
 * The web navigation (DESIGN.md §7; docs/superpowers/specs/2026-11-23-web-navigation-redesign-design.md):
 * the top bar at half-screen width, the nav search, the Groups rail and the account menu.
 * Half of a 16" laptop is about 864px.
 */
test.beforeAll(resetDatabase);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 864, height: 700 });
  await signIn(page);
});

type Page = import("@playwright/test").Page;

/** ⌘K right after a page load can land before the page has hydrated; press until the field really has focus. */
async function openSearch(page: Page): Promise<void> {
  const field = page.getByRole("combobox", { name: "Quick search" });
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(field).toBeFocused({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

const results = (page: Page) => page.getByRole("listbox", { name: "Search results" });

test("at half-screen width the four places are in the bar and no menu button is needed", async ({ page }) => {
  const main = page.getByRole("navigation", { name: "Main" });
  for (const name of ["Collection", "Journal", "Flights", "Numbers"]) {
    await expect(main.getByRole("link", { name })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();

  await main.getByRole("link", { name: "Journal" }).click();
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByText("Coming soon.")).toBeVisible();
  await expect(main.getByRole("link", { name: "Journal" })).toHaveAttribute("aria-current", "page");
});

test("the root address lands on the Collection", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/bottles$/);
});

test("⌘K opens the search, results are grouped, and Enter opens the bottle", async ({ page }) => {
  await openSearch(page);
  await page.keyboard.type("pursuit");
  await expect(results(page).getByText("Your bottles")).toBeVisible();
  await expect(results(page).getByText("Brands")).toBeVisible();
  await expect(results(page).getByText("1 label · 1 bottle")).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/bottles\/\d+$/);
});

test("a brand result opens the Collection filtered to that brand", async ({ page }) => {
  await openSearch(page);
  await page.keyboard.type("pursuit");
  await results(page).getByRole("option").filter({ hasText: "Show in Collection" }).first().click();
  await expect(page).toHaveURL(/\/bottles\?brand=\d+/);
});

test("choosing a result that only changes the query string still closes the search", async ({ page }) => {
  await page.goto("/bottles");
  await openSearch(page);
  await page.keyboard.type("pursuit");
  await results(page).getByRole("option").filter({ hasText: "Show in Collection" }).first().click();
  await expect(page).toHaveURL(/\/bottles\?brand=\d+/);
  await expect(results(page)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Quick search" })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Quick search" })).not.toBeFocused();
});

test("nothing found offers to add the typed words as a new label", async ({ page }) => {
  await openSearch(page);
  await page.keyboard.type("zzqx nothing");
  const add = results(page).getByRole("option", { name: /Add .zzqx nothing. as a new label/ });
  await expect(add).toBeVisible();
  await add.click();
  await expect(page).toHaveURL(/\/expressions\/new\?name=zzqx%20nothing$/);
});

test("an empty or punctuation-only query shows no results at all", async ({ page }) => {
  await openSearch(page);
  await page.keyboard.type("!!");
  await page.waitForTimeout(500);
  await expect(results(page)).toHaveCount(0);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(500);
  await expect(results(page)).toHaveCount(0);
});

test("when the first search is slow, the answer on screen is still for the latest text", async ({ page }) => {
  // Hold back the first search request only. (Next queues server actions on the client, so the answers also arrive
  // in order; nav-search.tsx keeps its own "latest request wins" guard in case that ever changes. This test checks the
  // behaviour people see, not the guard: removing the guard does not fail it.)
  let searches = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"] && ++searches === 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    await route.continue();
  });

  await openSearch(page);
  await page.keyboard.type("dou");
  await page.waitForTimeout(400); // past the debounce, so the (slow) first request is in flight
  await page.keyboard.type("ble");
  await expect(results(page).getByRole("option", { name: /Add .double. as a new label/ })).toBeVisible();

  await page.waitForTimeout(2500); // the stale answer for "dou" has arrived by now
  await expect(results(page).getByRole("option", { name: /Add .double. as a new label/ })).toBeVisible();
  await expect(results(page).getByRole("option", { name: /Add .dou. as a new label/ })).toHaveCount(0);
});

test("/ focuses the Collection's filter box, and opens the search on a page without one", async ({ page }) => {
  // A key pressed right after a page load can land before hydration; press until it takes.
  await page.goto("/bottles");
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(page.locator("#grid-search")).toBeFocused({ timeout: 500 });
  }).toPass({ timeout: 10_000 });

  await page.goto("/journal");
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(page.getByRole("combobox", { name: "Quick search" })).toBeFocused({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
});

test("the Groups rail starts hidden at half-screen, opens, and the choice is remembered", async ({ page }) => {
  await page.goto("/bottles");
  const show = page.getByRole("button", { name: /^Groups: All/ });
  await expect(show).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Groups" })).toHaveCount(0);

  await show.click();
  await expect(page.getByRole("navigation", { name: "Groups" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage groups" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("navigation", { name: "Groups" })).toBeVisible();

  await page.getByRole("button", { name: "Hide groups" }).click();
  await expect(page.getByRole("navigation", { name: "Groups" })).toHaveCount(0);
  await expect(show).toBeVisible();
});

test("the bulk editor has no Groups rail or button", async ({ page }) => {
  await page.goto("/bulk-editor");
  await expect(page.getByRole("button", { name: /^Groups:/ })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Groups" })).toHaveCount(0);
  // The bar and the search are still there.
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Collection" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Quick search" })).toBeVisible();
});

test("the account menu lists Library, You and Sign out; Admin only for admins", async ({ page }) => {
  await page.getByRole("button", { name: /Account menu/ }).click();
  const library = page.getByRole("navigation", { name: "Library" });
  for (const name of ["Labels", "Housekeeping", "Configuration"]) {
    await expect(library.getByRole("link", { name })).toBeVisible();
  }
  const you = page.getByRole("navigation", { name: "You" });
  await expect(you.getByRole("link", { name: "Account settings" })).toBeVisible();
  await expect(you.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Users & sign-in" })).toBeVisible();
  await page.keyboard.press("Escape");

  await signOut(page);
  await signIn(page, MEMBER.username);
  await page.getByRole("button", { name: /Account menu/ }).click();
  await expect(page.getByRole("navigation", { name: "You" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
});

test("below 720px the bar is the logo, search and Menu, and search takes over the bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto("/bottles");
  const header = page.getByRole("banner");
  await expect(header.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();

  await header.getByRole("button", { name: "Search" }).click();
  await page.keyboard.type("pursuit");
  await expect(results(page).getByText("Your bottles")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(results(page)).toHaveCount(0);
  await expect(header.getByRole("button", { name: "Open menu" })).toBeVisible();
});

test("on a phone, choosing a brand from the Collection closes the search takeover", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto("/bottles");
  await page.getByRole("banner").getByRole("button", { name: "Search" }).click();
  await page.keyboard.type("pursuit");
  await results(page).getByRole("option").filter({ hasText: "Show in Collection" }).first().click();
  await expect(page).toHaveURL(/\/bottles\?brand=\d+/);
  await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  await expect(page.getByRole("banner").getByRole("button", { name: "Open menu" })).toBeVisible();
});
