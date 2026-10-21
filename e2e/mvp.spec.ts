import { expect, test, type Browser, type Page } from "@playwright/test";

const ADMIN = { email: "admin@demo.local", password: "demo-password-2026" };
const SHOTS = process.env.E2E_SCREENSHOTS;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Mot de passe").fill(ADMIN.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible();
}

async function openDashboard(page: Page, client: string) {
  await page.goto("/admin/dashboards");
  await page.getByRole("link", { name: `${client} — Reporting Meta Ads` }).click();
  await expect(page.getByTestId("kpi-spend")).toBeVisible();
}

async function createShareLink(page: Page, label: string): Promise<string> {
  await page.getByRole("link", { name: "Partage" }).click();
  await page.getByLabel("Destinataire / libellé").fill(label);
  await page.getByRole("button", { name: "Générer le lien" }).click();
  const input = page.getByLabel("Lien privé");
  await expect(input).toBeVisible();
  return input.inputValue();
}

async function viewerPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: "fr-FR", timezoneId: "Europe/Paris", viewport: { width: 1280, height: 900 } });
  return context.newPage();
}

test("admin area requires authentication", async ({ page }) => {
  await page.goto("/admin/clients");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Mot de passe").fill("wrong-password");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();
});

test("admin sees reference dashboard with consistent KPIs", async ({ page }) => {
  await login(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/01-admin-overview.png`, fullPage: true });
  await openDashboard(page, "Association Horizon");

  for (const title of ["Investissements", "Impressions et clics", "CTR et CPC", "Conversions"]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Dernière actualisation")).toBeVisible();
  const spend = await page.getByTestId("kpi-spend").first().innerText();
  expect(spend).toMatch(/€/);
  const tableTotal = page.locator("tfoot td").nth(1);
  await expect(tableTotal).toHaveText(spend);

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const campaignCard = page.locator("div.rounded-xl.border").filter({
    has: page.getByRole("heading", { name: "Performances par campagne", exact: true }),
  });
  await campaignCard.getByRole("button", { name: "Copier le tableau" }).click();
  await expect(campaignCard.getByRole("button", { name: "Tableau copié" })).toBeVisible();
  const pasted = await page.evaluate(() => navigator.clipboard.readText());
  const lines = pasted.trim().split("\n");
  expect(lines[0]).toBe("Campagne\tDépenses\tImpressions\tClics lien\tCTR lien\tCPC lien\tConversions\tCVR\tROAS");
  expect(lines.at(-1)?.startsWith("Total\t")).toBe(true);
  expect(lines.at(-1)).toContain(spend.replace(/\u202F|\u00A0/g, " "));

  const chartCard = page.locator("div.rounded-xl.border").filter({
    has: page.getByRole("heading", { name: "Évolution du montant dépensé", exact: true }),
  });
  await chartCard.getByRole("button", { name: "Copier le tableau" }).click();
  await expect(chartCard.getByRole("button", { name: "Tableau copié" })).toBeVisible();
  const chartLines = (await page.evaluate(() => navigator.clipboard.readText())).trim().split("\n");
  expect(chartLines[0]).toBe("Date\tDépenses");
  expect(chartLines).toHaveLength(31);
  expect(chartLines[1]).toMatch(/^\d{2}\/\d{2}\t/);
  expect(chartLines.at(-1)).toMatch(/€/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/02-admin-dashboard.png`, fullPage: true });
});

test("private link: viewer access, filters, isolation and revocation", async ({ page, browser }) => {
  await login(page);
  await openDashboard(page, "Association Horizon");
  const url = await createShareLink(page, "E2E — Direction client");
  expect(url).toMatch(/\/share#t=[A-Za-z0-9_-]{43}$/);
  const token = url.split("#t=")[1];
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/03-admin-share-link.png`, fullPage: true });

  const viewer = await viewerPage(browser);
  const requests: string[] = [];
  viewer.on("request", (r) => requests.push(r.url()));
  await viewer.goto(url.replace(/^https?:\/\/[^/]+/, ""));
  await expect(viewer).toHaveURL(/\/share\/[0-9a-f-]{36}$/);
  await expect(viewer.getByRole("heading", { name: "Association Horizon — Reporting Meta Ads" })).toBeVisible();
  await expect(viewer.getByText("Consultation en lecture seule.", { exact: false })).toBeVisible();
  expect(requests.every((r) => !r.includes(token))).toBe(true);
  expect(viewer.url()).not.toContain(token);
  const linkPath = new URL(viewer.url()).pathname;

  const response = await viewer.request.get(`${linkPath}/data?period=last_7_days`);
  expect(response.status()).toBe(200);
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = await response.text();
  expect(body).not.toMatch(/encrypted|token|EAAB/i);
  expect(body).not.toContain("Maison Lumen");

  const before = await viewer.getByTestId("kpi-spend").first().innerText();
  await viewer.getByLabel("Période").selectOption("last_7_days");
  await expect(viewer).toHaveURL(/period=last_7_days/);
  await expect(viewer.getByTestId("kpi-spend").first()).not.toHaveText(before);

  await viewer.getByRole("button", { name: "Toutes les campagnes" }).click();
  await viewer.getByLabel("FDA — Broad — Dons").check();
  await viewer.getByRole("button", { name: "Appliquer" }).click();
  await expect(viewer.getByRole("button", { name: "FDA — Broad — Dons" })).toBeVisible();
  await expect(viewer.locator("tbody tr")).toHaveCount(1);
  if (SHOTS) await viewer.screenshot({ path: `${SHOTS}/04-viewer-dashboard.png`, fullPage: true });

  // The cookie is scoped to this dashboard: other dashboards and the admin stay closed.
  expect((await viewer.request.get(`/share/00000000-0000-0000-0000-000000000000/data`)).status()).toBe(401);
  await viewer.goto("/admin");
  await expect(viewer).toHaveURL(/\/login$/);

  await page.goto(page.url());
  await page.getByRole("button", { name: "Révoquer" }).first().click();
  await expect(page.getByText("Révoqué", { exact: true }).first()).toBeVisible();

  expect((await viewer.request.get(`${linkPath}/data`)).status()).toBe(401);
  await viewer.goto(linkPath);
  await expect(viewer.getByText("Ce lien n'est plus valide")).toBeVisible();

  const fresh = await viewerPage(browser);
  await fresh.goto(url.replace(/^https?:\/\/[^/]+/, ""));
  await expect(fresh.getByText("Accès impossible")).toBeVisible();
  if (SHOTS) await fresh.screenshot({ path: `${SHOTS}/05-viewer-revoked.png` });
});

test("malformed or missing tokens are rejected", async ({ browser }) => {
  const viewer = await viewerPage(browser);
  await viewer.goto("/share#t=not-a-real-token");
  await expect(viewer.getByText("Accès impossible")).toBeVisible();
  await viewer.goto("/share");
  await expect(viewer.getByText("Lien incomplet", { exact: false })).toBeVisible();
});

test("admin can configure conversions, widgets and monitor syncs", async ({ page }) => {
  await login(page);
  await page.goto("/admin/syncs");
  await expect(page.getByText("Import initial").first()).toBeVisible();
  await page.getByRole("button", { name: "Synchroniser" }).first().click();
  await expect(page.getByText(/Synchronisé : \d+ lignes/)).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/06-admin-syncs.png`, fullPage: true });

  await page.goto("/admin/clients");
  await page.getByRole("link", { name: /Maison Lumen/ }).click();
  await page.locator("summary", { hasText: "Conversions comptées" }).click();
  await page.getByRole("checkbox", { name: /^purchase \(/ }).check();
  await page.getByRole("button", { name: "Enregistrer et recalculer" }).click();
  await expect(page.getByText(/doubleraient les conversions/)).toBeVisible();

  await openDashboard(page, "Maison Lumen");
  await page.getByRole("link", { name: "Configuration" }).click();
  await page.locator("summary", { hasText: "+ Ajouter un widget" }).first().click();
  await page.getByLabel("Titre (optionnel)").first().fill("CPM quotidien");
  await page.getByRole("checkbox", { name: "CPM (coût pour 1 000 impressions)" }).first().check();
  await page.getByRole("combobox", { name: "Type" }).first().selectOption("timeseries");
  await page.getByRole("button", { name: "Ajouter", exact: true }).first().click();
  await expect(page.getByText("Graphique temporel — CPM quotidien")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/07-admin-editor.png`, fullPage: true });
});
