import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.IMPULSA_TEST_URL ?? "http://localhost:3000",
    channel: "msedge",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"] } },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        channel: "msedge",
      },
    },
    {
      name: "tablet",
      use: { viewport: { width: 820, height: 1180 }, channel: "msedge" },
    },
  ],
});
