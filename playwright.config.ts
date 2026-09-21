import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against an already-built app. Start it with the test database
 * migrated and seeded first:
 *
 *   npm run build && npm run start
 *
 * The end-to-end path grows with the milestones; today it covers sign-in and
 * the seeded bottle, and gains "create a bottle, set its fill, filter for it"
 * once M3/M4 land.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:1964",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Sandboxes and CI images often ship a Chromium already. Point
        // E2E_CHROMIUM_PATH at it to skip `npx playwright install`.
        ...(process.env.E2E_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH } } : {}),
      },
    },
  ],
});
