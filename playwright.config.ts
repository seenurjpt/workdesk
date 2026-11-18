import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests. Run them with `npm run e2e`, which starts an in-memory MongoDB, builds the
 * app into `.next-e2e`, serves it and runs everything below. To aim at a server you already have
 * running, set E2E_BASE_URL and run `npx playwright test` directly.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3200",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  outputDir: "./e2e/.results",
});
