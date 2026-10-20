import { expect, test, type Page } from "@playwright/test";

const ADMIN = { email: "admin@demo.local", password: "demo-password-2026" };

async function login(page: Page, email = ADMIN.email, password = ADMIN.password) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible();
}

test("Meta OAuth: read-only scope, CSRF state and cancellation", async ({ page, context }) => {
  await login(page);
  await page.goto("/admin/connections");
  await expect(page.getByText("/admin/connections/meta/callback")).toBeVisible();

  const link = page.getByRole("link", { name: "Se connecter avec Facebook" });
  // The redirect is inspected without following it, so nothing is sent to facebook.com.
  const startOAuth = async () => {
    const response = await page.request.get((await link.getAttribute("href"))!, { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    return new URL(response.headers()["location"]);
  };

  const url = await startOAuth();
  expect(url.origin).toBe("https://www.facebook.com");
  expect(url.pathname).toMatch(/^\/v\d+\.\d+\/dialog\/oauth$/);
  expect(url.searchParams.get("scope")).toBe("ads_read");
  expect(url.searchParams.get("redirect_uri")).toMatch(/\/admin\/connections\/meta\/callback$/);
  expect(url.toString()).not.toContain("e2e-fake-app-secret");
  const state = url.searchParams.get("state")!;
  expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);

  const cookie = (await context.cookies()).find((c) => c.name === "om_meta_oauth")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.path).toBe("/admin/connections/meta");
  expect(cookie.value).not.toContain(state);

  // Forged state (e.g. a callback link sent by an attacker) is refused.
  await page.goto(`/admin/connections/meta/callback?code=AQ-attacker-code-123&state=${"x".repeat(43)}`);
  await expect(page).toHaveURL(/meta=state$/);
  await expect(page.getByText("La demande de connexion a expiré")).toBeVisible();
  expect((await context.cookies()).find((c) => c.name === "om_meta_oauth")).toBeUndefined();

  // Real state, but the admin cancelled on Facebook.
  const state2 = (await startOAuth()).searchParams.get("state")!;
  expect(state2).not.toBe(state);
  await page.goto(`/admin/connections/meta/callback?error=access_denied&state=${state2}`);
  await expect(page.getByText("Autorisation annulée sur Facebook")).toBeVisible();
});

test("Meta OAuth endpoints require an admin session", async ({ request }) => {
  for (const path of ["/admin/connections/meta/start", "/admin/connections/meta/callback?code=abc&state=def"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers()["location"]).toMatch(/\/login$/);
  }
});

test("team: add an admin, who changes their password, then lose access when removed", async ({ page, browser }) => {
  await login(page);
  await page.goto("/admin/team");
  await page.getByLabel("E-mail").fill("analyste@agence.test");
  await page.getByLabel("Mot de passe initial").fill("initial-password-2026");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByText("analyste@agence.test peut maintenant se connecter")).toBeVisible();

  const other = await (await browser.newContext({ locale: "fr-FR" })).newPage();
  await login(other, "analyste@agence.test", "initial-password-2026");
  await other.goto("/admin/team");
  await other.getByLabel("Mot de passe actuel").fill("initial-password-2026");
  await other.getByLabel("Nouveau mot de passe").fill("personal-password-2026");
  await other.getByLabel("Confirmation").fill("personal-password-2026");
  await other.getByRole("button", { name: "Changer le mot de passe" }).click();
  await expect(other.getByText("Mot de passe modifié")).toBeVisible();

  await page.reload();
  const row = page.getByRole("listitem").filter({ hasText: "analyste@agence.test" });
  await row.getByRole("button", { name: "Retirer l'accès" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "analyste@agence.test" })).toHaveCount(0);

  await other.goto("/admin/clients");
  await expect(other).toHaveURL(/\/login$/);
});
