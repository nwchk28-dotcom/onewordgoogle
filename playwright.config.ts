import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173/onewordgoogle/",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "narrow-320",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 700 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command:
      "VITE_API_BASE_URL=https://api.test VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run dev:e2e -w @oneword/web",
    url: "http://127.0.0.1:4173/onewordgoogle/",
    reuseExistingServer: !process.env.CI,
  },
});
