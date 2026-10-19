import { defineConfig } from "@playwright/test";

const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: external ?? "http://localhost:3100",
    viewport: { width: 1440, height: 900 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  },
  webServer: external
    ? undefined
    : {
        // Fresh in-memory database seeded with synthetic demo data on every run.
        command: "DEMO_MODE=true npx next dev -p 3100",
        url: "http://localhost:3100/login",
        timeout: 180_000,
        reuseExistingServer: false,
      },
});
