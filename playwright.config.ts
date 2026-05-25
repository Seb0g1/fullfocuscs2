import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/admin/e2e",
  timeout: 30_000,
  expect: { timeout: 7_500 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5030",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "corepack pnpm --filter @fullfocus/admin dev",
    url: "http://127.0.0.1:5030/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:4567/api",
      NEXT_PUBLIC_DEV_LOGIN: "true",
      NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: "fullfocuscs2_bot"
    }
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 950 } } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } }
  ]
});
