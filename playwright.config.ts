import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * E2E runs the production build against the scripted mock model
 * (LLM_PROVIDER=mock) and a throwaway SQLite file. Tests share one server, so
 * each test calls POST /api/reset first and the suite runs serially.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      LLM_PROVIDER: "mock",
      DATABASE_PATH: "data/e2e.db",
      LOG_SILENT: "1",
    },
  },
});
