import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import { openNewLabelForm } from "./support/new-label";

/** Add finish: the popup that opens from a finish picker's "Create with details", and the name-only create beside it. */

const url = process.env.DATABASE_URL ?? "";
function sql() {
  if (!/(test|scratch|proto)/.test(new URL(url).pathname)) throw new Error("finish-popup.spec.ts needs DATABASE_URL pointing at a throwaway test database.");
  return postgres(url, { max: 1, onnotice: () => {} });
}

test.beforeAll(async () => {
  expect(url, "DATABASE_URL must name the throwaway database the app is running against").not.toBe("");
  await resetDatabase();
  const db = sql();
  try {
    const [admin] = await db<{ id: number }[]>`SELECT id FROM users WHERE username = 'admin'`;
    await db`INSERT INTO finishes (owner_id, name, slug, finish_type) VALUES (${admin!.id}, 'Port', 'port', 'fortified')`;
  } finally {
    await db.end();
  }
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await openNewLabelForm(page);
  await page.getByRole("combobox", { name: "Category" }).click();
  await page.locator("[cmdk-input]").fill("Bourbon");
  await page.locator('[cmdk-item]:not([data-value="__create__"])').filter({ has: page.getByText("Bourbon", { exact: true }) }).first().click();
});

async function openPopup(page: Page, typed: string) {
  await page.getByRole("combobox", { name: "Add finishes" }).click();
  await page.locator("[cmdk-input]").fill(typed);
  await page.locator('[cmdk-item][data-value="__details__"]').click();
  await expect(page.getByRole("dialog", { name: "Add finish" })).toBeVisible();
}

test("the popup is 640px wide, prefills the name and suggests a type from it", async ({ page }) => {
  await openPopup(page, "tawny port cask");
  const dialog = page.getByRole("dialog", { name: "Add finish" });
  const box = await dialog.boundingBox();
  expect(Math.round(box!.width)).toBe(640);
  await expect(dialog.getByLabel("Name")).toHaveValue("Tawny Port Cask");
  await expect(dialog.getByRole("button", { name: /Fortified/ })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog).toContainText("Suggested from the name");
});

test("a name with no guess needs a type before Save works, then saves into the picker", async ({ page }) => {
  await openPopup(page, "Mystery barrel");
  const dialog = page.getByRole("dialog", { name: "Add finish" });
  await expect(dialog.getByRole("button", { name: "Save finish" })).toBeDisabled();
  await expect(dialog).toContainText("Pick a type.");
  await dialog.getByRole("button", { name: "Beer", exact: true }).click();
  await expect(dialog).not.toContainText("Pick a type.");
  await dialog.getByRole("button", { name: "Save finish" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Remove Mystery Barrel" })).toBeVisible();
});

test("a name already in the collection blocks Save and offers Use it", async ({ page }) => {
  // The picker will not offer "Create with details" for a name that exists, so the clash is typed inside the popup.
  await openPopup(page, "Tawny");
  const dialog = page.getByRole("dialog", { name: "Add finish" });
  await dialog.getByLabel("Name").fill("  port ");
  await dialog.getByLabel("Name").blur();
  await expect(dialog).toContainText("already in your collection");
  await expect(dialog.getByRole("button", { name: "Save finish" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Use it" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Remove Port" })).toBeVisible();
});

test("creating by name only files the finish under the type its name suggests", async ({ page }) => {
  await page.getByRole("combobox", { name: "Add finishes" }).click();
  await page.locator("[cmdk-input]").fill("PX Sherry");
  await page.locator('[cmdk-item][data-value="__create__"]').click();
  await expect(page.getByRole("button", { name: "Remove PX Sherry" })).toBeVisible();
  const db = sql();
  try {
    const [row] = await db<{ finish_type: string }[]>`SELECT finish_type FROM finishes WHERE name = 'PX Sherry'`;
    expect(row?.finish_type).toBe("fortified");
  } finally {
    await db.end();
  }
});

test("Use it for a finish the label already has does not add it twice", async ({ page }) => {
  await page.getByRole("combobox", { name: "Add finishes" }).click();
  await page.locator("[cmdk-input]").fill("Port");
  await page.locator('[cmdk-item]:not([data-value="__create__"])').filter({ has: page.getByText("Port", { exact: true }) }).first().click();
  await expect(page.getByRole("button", { name: "Remove Port" })).toHaveCount(1);
  // Port is on the label now, so the picker offers "Create with details" for the name again.
  await openPopup(page, "Port");
  const dialog = page.getByRole("dialog", { name: "Add finish" });
  await expect(dialog).toContainText("already in your collection");
  await dialog.getByRole("button", { name: "Use it" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Remove Port" })).toHaveCount(1);
});
