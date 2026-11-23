import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import {
  countUnpicturedLabels,
  HK_BARRELS,
  HK_VINTAGES,
  labelIdByName,
  seedHousekeepingField,
} from "./support/housekeeping-field";
import { assertThrowawayDatabase } from "./support/tournament-field";

const BIG = path.join(__dirname, "fixtures", "bottle.jpg"); // 900 x 1400
const TINY = path.join(__dirname, "fixtures", "tiny.png"); // 300 x 200
const TOO_SMALL = "That image is 300 × 200 px. Photos need at least 600 px on the long side.";

/** Unpictured labels at the start: the seeded eighteen plus whatever example data the reset adds. */
let LABELS = 0;

test.beforeAll(async () => {
  // Before resetDatabase(), which wipes whatever DATABASE_URL names.
  assertThrowawayDatabase();
  await resetDatabase();
  await seedHousekeepingField();
  LABELS = await countUnpicturedLabels();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

/** The Photos section; the page has other sections with their own pagers and per-page choices. */
const photos = (page: Page) => page.getByRole("region", { name: "Photos", exact: true });
/** The cards on the page, saved or not. */
const cards = (page: Page) => page.locator("div[tabindex='0']").filter({ hasText: /No photo yet|Photo added\./ });
const waiting = (page: Page) => page.locator("div[tabindex='0']").filter({ hasText: "No photo yet" });
const names = (page: Page) => page.locator("div[tabindex='0'] p.font-semibold");

/** The count shown on a tab, read from the tab's own text. */
async function tabCount(page: Page, name: string | RegExp): Promise<number> {
  const text = await page.getByRole("navigation", { name: "What needs a photo" }).getByRole("link", { name }).innerText();
  return Number(text.replace(/\D+/g, " ").trim().split(" ").pop());
}

/** Dispatches a drop or paste carrying `bytes` (or text) on the card, the way a browser would. */
async function handOver(page: Page, kind: "drop" | "paste", payload: { file?: string; text?: string }, times = 1) {
  const bytes = payload.file ? readFileSync(payload.file).toString("base64") : null;
  await page.evaluate(
    ({ kind, bytes, text, name, times }) => {
      const card = Array.from(document.querySelectorAll<HTMLElement>("div[tabindex='0']")).find((el) =>
        el.textContent?.includes("No photo yet"),
      )!;
      for (let i = 0; i < times; i++) {
        const transfer = new DataTransfer();
        if (bytes) {
          const raw = atob(bytes);
          const array = Uint8Array.from(raw, (c) => c.charCodeAt(0));
          transfer.items.add(new File([array], name, { type: "image/jpeg" }));
        } else if (text) {
          transfer.items.add(new File([text], "note.txt", { type: "text/plain" }));
        }
        const event =
          kind === "drop"
            ? new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true })
            : new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true });
        card.dispatchEvent(event);
      }
    },
    { kind, bytes, text: payload.text ?? null, name: payload.file ? path.basename(payload.file) : "", times },
  );
}

test("lists eight cards at first and pages through the rest", async ({ page }) => {
  await page.goto("/housekeeping");
  await expect(page.getByRole("heading", { name: "Housekeeping", level: 1 })).toBeVisible();
  expect(await tabCount(page, /^Labels/)).toBe(LABELS);
  expect(LABELS).toBeGreaterThan(16);
  await expect(cards(page)).toHaveCount(8);
  await expect(photos(page).getByText(`1–8 of ${LABELS}`)).toBeVisible();
  await photos(page).getByRole("link", { name: "Next", exact: true }).click();
  await expect(cards(page)).toHaveCount(8);
  await expect(photos(page).getByText(`9–16 of ${LABELS}`)).toBeVisible();
  await photos(page).getByRole("link", { name: "Previous" }).click();
  await expect(photos(page).getByText(`1–8 of ${LABELS}`)).toBeVisible();
});

test("the per-page choice changes the address and shows more cards", async ({ page }) => {
  await page.goto("/housekeeping");
  await photos(page).getByLabel("Per page", { exact: true }).selectOption("12");
  await expect(page).toHaveURL(/per=12/);
  await expect(cards(page)).toHaveCount(Math.min(12, LABELS));
});

test("a bad address falls back instead of failing", async ({ page }) => {
  const response = await page.goto("/housekeeping?offset=999&per=7&tab=nonsense");
  expect(response?.status()).toBe(200);
  // Past the end falls back to the last full window of eight.
  await expect(cards(page)).toHaveCount(8);
  await expect(photos(page).getByText(`${LABELS - 7}–${LABELS} of ${LABELS}`)).toBeVisible();
});

test("a photo under 600 px is turned down and the card stays", async ({ page }) => {
  await page.goto("/housekeeping");
  await page.getByLabel("Upload label photo").first().setInputFiles(TINY);
  await expect(page.getByRole("alert").filter({ hasText: TOO_SMALL })).toBeVisible();
  await expect(waiting(page)).toHaveCount(8);
});

test("the label page's own photo form still takes a small image", async ({ page }) => {
  const id = await labelIdByName("Hk Lab 11");
  await page.goto(`/expressions/${id}`);
  await page.getByLabel("Upload label photo").setInputFiles(TINY);
  await expect(page.getByText("Label photo set.")).toBeVisible();
  LABELS -= 1;
});

test("after saving every card on a page, Next shows the items that came next, not later ones", async ({ page }) => {
  await page.goto("/housekeeping?tab=labels&per=8&offset=8");
  const following = await names(page).allInnerTexts();
  expect(following.length).toBeGreaterThan(0);
  await page.goto("/housekeeping");
  for (let i = 1; i <= 8; i++) {
    await page.getByLabel("Upload label photo").first().setInputFiles(BIG);
    await expect(page.getByText("Photo added.")).toHaveCount(i);
  }
  await expect(page.getByText("8 saved just now")).toBeVisible();
  await photos(page).getByRole("link", { name: "Next", exact: true }).click();
  await expect(names(page)).toHaveText(following);
  // The next batch took the same offset; leaving it alone and pressing Next must still move on, not repeat it.
  const remaining = LABELS - 8;
  await expect(photos(page).getByText(`1–8 of ${remaining}`)).toBeVisible();
  await photos(page).getByRole("link", { name: "Next", exact: true }).click();
  await expect(photos(page).getByText(`9–${remaining} of ${remaining}`)).toBeVisible();
  LABELS -= 8;
});

test("a big photo is saved, the card stays as saved, and the label leaves the list on reload", async ({ page }) => {
  await page.goto("/housekeeping");
  const before = await tabCount(page, /^Labels/);
  expect(before).toBe(LABELS);
  await page.getByLabel("Upload label photo").first().setInputFiles(BIG);
  await expect(page.getByText("Photo added.")).toHaveCount(1);
  await expect(cards(page)).toHaveCount(Math.min(8, before));
  await page.reload();
  expect(await tabCount(page, /^Labels/)).toBe(before - 1);
  LABELS -= 1;
});

test("a dropped file and a pasted image each save, and a dropped text file is refused", async ({ page }) => {
  await page.goto("/housekeeping");
  const before = await tabCount(page, /^Labels/);
  expect(before).toBeGreaterThanOrEqual(3);
  await handOver(page, "drop", { file: BIG });
  await expect(page.getByText("Photo added.")).toHaveCount(1);
  await handOver(page, "paste", { file: BIG });
  await expect(page.getByText("Photo added.")).toHaveCount(2);
  await handOver(page, "drop", { text: "hello" });
  await expect(page.getByRole("alert").filter({ hasText: "That needs to be an image." })).toBeVisible();
  await page.reload();
  expect(await tabCount(page, /^Labels/)).toBe(before - 2);
  LABELS -= 2;
});

test("two drops in a row on one card post once", async ({ page }) => {
  await page.goto("/housekeeping");
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/expressions\/\d+\/photo$/.test(request.url())) posts.push(request.url());
  });
  await handOver(page, "drop", { file: BIG }, 2);
  await expect(page.getByText("Photo added.")).toHaveCount(1);
  expect(posts).toHaveLength(1);
});

test("a failed upload says so and leaves the card usable", async ({ page }) => {
  await page.goto("/housekeeping");
  await page.route(/\/api\/expressions\/\d+\/photo$/, (route) => route.fulfill({ status: 500, body: "<html>Server error</html>" }));
  await page.getByLabel("Upload label photo").first().setInputFiles(BIG);
  await expect(page.getByRole("alert").filter({ hasText: "The upload did not go through. Try again." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add photo" }).first()).toBeEnabled();
  await page.unroute(/\/api\/expressions\/\d+\/photo$/);
  await page.getByLabel("Upload label photo").first().setInputFiles(BIG);
  await expect(page.getByText("Photo added.")).toHaveCount(1);
});

test("a single barrel's photo goes to its bottle and the barrel leaves the list", async ({ page }) => {
  await page.goto("/housekeeping?tab=barrels");
  await expect(cards(page)).toHaveCount(HK_BARRELS);
  await page.getByLabel("Upload bottle photo").first().setInputFiles(BIG);
  await expect(page.getByText("Photo added.")).toHaveCount(1);
  await page.reload();
  expect(await tabCount(page, /^Single & private barrels/)).toBe(HK_BARRELS - 1);
});

test("a vintage's photo is saved and the vintage leaves the list", async ({ page }) => {
  await page.goto("/housekeeping?tab=vintages");
  await expect(cards(page)).toHaveCount(HK_VINTAGES);
  await page.getByLabel("Upload label photo").first().setInputFiles(BIG);
  await expect(page.getByText("Photo added.")).toHaveCount(1);
  await page.reload();
  expect(await tabCount(page, /^Vintages/)).toBe(HK_VINTAGES - 1);
});
