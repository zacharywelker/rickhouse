import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { MEMBER, signIn } from "./support/auth";
import { resetDatabase } from "./support/db";

/**
 * Two accounts, one database: the admin owns the seeded Pursuit bottle and
 * its whole catalog; the member starts empty. Everything the member can
 * reach — pages, API routes, photos — must behave as if the admin's data
 * does not exist.
 */

test.beforeAll(resetDatabase);

type AdminData = { bottleUrl: string; photoUrl: string; brandUrl: string; labelEditUrl: string; groupUrl: string };

/** Signs in as the admin, gives the example bottle a photo and a group, and notes the URLs. */
async function adminData(page: Page): Promise<AdminData> {
  await signIn(page);
  await page.goto("/bottles");
  await page.getByRole("link", { name: /Double Oak Spirit/ }).first().click();
  await expect(page).toHaveURL(/\/bottles\/\d+$/);
  const bottleUrl = new URL(page.url()).pathname;
  const bottleId = bottleUrl.split("/").pop();

  const upload = await page.request.post(`/api/bottles/${bottleId}/images`, {
    multipart: {
      images: {
        name: "bottle.jpg",
        mimeType: "image/jpeg",
        buffer: await import("node:fs/promises").then((fs) =>
          fs.readFile(path.join(__dirname, "fixtures", "bottle.jpg")),
        ),
      },
    },
  });
  expect((await upload.json()).ok).toBe(true);
  await page.reload();
  const photoUrl = await page.locator('img[src*="/api/images/"]').first().getAttribute("src");
  expect(photoUrl).toBeTruthy();

  await page.goto("/groups/new");
  await page.getByLabel("Name").fill("Admin shelf");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/groups\/\d+/);
  const groupUrl = new URL(page.url()).pathname.replace(/\/edit$/, "");

  return {
    bottleUrl,
    photoUrl: decodeURIComponent(new URL(photoUrl!, page.url()).pathname),
    brandUrl: "/brands/pursuit-spirits-brand",
    labelEditUrl: "/expressions/1/edit",
    groupUrl,
  };
}

test("each account sees only its own collection, catalog and photos", async ({ browser }) => {
  const adminPage = await browser.newPage();
  const data = await adminData(adminPage);
  const bottleId = data.bottleUrl.split("/").pop();

  const page = await browser.newPage();
  await signIn(page, MEMBER.username);

  // Lists are empty.
  await page.goto("/bottles");
  await expect(page.getByText("Double Oak Spirit")).toHaveCount(0);
  await page.goto("/expressions");
  await expect(page.getByText("Double Oak Spirit")).toHaveCount(0);
  await page.goto("/groups");
  await expect(page.getByText("Admin shelf")).toHaveCount(0);
  await page.goto("/admin/brands");
  await expect(page.getByText("Pursuit Spirits")).toHaveCount(0);
  await page.goto("/numbers");
  await expect(page.getByText("Double Oak Spirit")).toHaveCount(0);

  // Direct links to the admin's things are not found.
  for (const url of [data.bottleUrl, `${data.bottleUrl}/edit`, data.brandUrl, data.labelEditUrl, data.groupUrl]) {
    const response = await page.goto(url);
    expect(response?.status(), url).toBe(404);
  }

  // Photos, uploads, export and roulette.
  expect((await page.request.get(data.photoUrl)).status()).toBe(404);
  expect((await adminPage.request.get(data.photoUrl)).status()).toBe(200);

  const upload = await page.request.post(`/api/bottles/${bottleId}/images`, {
    multipart: { images: { name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff]) } },
  });
  expect(upload.status()).toBe(404);

  const csv = await (await page.request.get("/api/bottles/export")).text();
  expect(csv).not.toContain("Double Oak Spirit");
  const spin = await (await page.request.get("/api/bottles/roulette")).json();
  expect(spin.bottle).toBeNull();

  await adminPage.close();
  await page.close();
});

test("names only have to be unique within an account", async ({ page }) => {
  await signIn(page, MEMBER.username);
  await page.goto("/admin/brands");
  await page.getByRole("button", { name: "Add brand" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Pursuit Spirits");
  await dialog.getByRole("button", { name: "Add brand" }).click();
  await expect(page.getByRole("cell", { name: "Pursuit Spirits", exact: true })).toBeVisible();
});

test("categories are shared, and only an admin changes them", async ({ page }) => {
  await signIn(page, MEMBER.username);
  await page.goto("/admin/categories");
  await expect(page.getByRole("cell", { name: "Bourbon", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Add category/ })).toHaveCount(0);
  await expect(page.getByText("Shared by everyone here")).toBeVisible();
});
