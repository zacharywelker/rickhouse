import { expect, type Page } from "@playwright/test";

/** New Label opens on a search (#202); this goes past it to an empty form. */
export async function openNewLabelForm(page: Page): Promise<void> {
  await page.goto("/expressions/new");
  const newRow = page.getByRole("option", { name: "New label", exact: true });
  await expect(newRow).toBeVisible();
  await newRow.click();
  await expect(page.getByLabel("Label Name")).toBeVisible();
}
