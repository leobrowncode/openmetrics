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
        // Fake Meta app credentials: the OAuth test intercepts facebook.com, nothing reaches Meta.
        // E2E_RELAX_LOGIN_LIMIT: the whole suite shares this server and exceeds the production login cap.
        command:
          "DEMO_MODE=true E2E_RELAX_LOGIN_LIMIT=1 META_APP_ID=1234567890 META_APP_SECRET=e2e-fake-app-secret npx next dev -p 3100",
        url: "http://localhost:3100/login",
        timeout: 180_000,
        reuseExistingServer: false,
      },
});
