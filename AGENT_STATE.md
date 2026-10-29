# Agent State

> This file is a compact resume point for autonomous development agents.
> Git, GitHub PRs/issues and the actual repository remain the source of truth.

## Current project status

Current roadmap position:

- Completed through: Phase 1 — MVP foundation (demo data, not yet verified against a real Meta account)
- Current phase: Phase 1 — MVP
- Current objective: client-owned self-hosting (done in code), then verify KPIs against Ads Manager on a real account, then breakdowns (age, gender, creative)

## Completed

- Data pipeline: read-only Graph client → normalisation → Postgres (Drizzle) → KPI engine (ratio of sums) → dashboards
- Idempotent, locked, chunked sync (manual + Vercel cron), Meta error classification, token expiry/permission states, sync monitoring page
- Admin: auth (scrypt, rate limited), clients, ad accounts, conversion event config with overlap detection, dashboards (create/duplicate/delete/edit widgets), templates, Meta connections
- Viewer: private links (hashed tokens, fragment-only URL, path-scoped HttpOnly cookie, revoke/renew/expiry), period + campaign filters, noindex/no-store/no-referrer
- Reference template "Référence agence — 4 sections" (Investissements, Impressions et clics, CTR et CPC, Conversions)
- Resumable, newest-first sync (`history_from`, 200 s budget, 760-day history, interrupted runs closed) for Vercel Hobby
- Self-service for a client-owned instance: Postgres migrations on boot (advisory lock), "Se connecter avec Facebook" OAuth (ads_read, signed state cookie, token expiry tracking), Team page (admins, password change), install guide `docs/DEPLOYMENT.md`
- Phase 2 research only: `docs/PHASE2_GOOGLE_SLIDES.md` (no code)

## Active work

- Issue: none
- Branch: `cursor/meta-reporting-mvp-foundation-a9c9`
- Pull request: none — `create_pr` refused with "must be a collaborator"; a repository collaborator must open it from this branch
- Status: review

## Important decisions

- Meta access is read-only: the Graph client only exposes GET; no write endpoint may be added.
- Ratios (CTR, CPC, CPM, CVR, CPA, ROAS) are always computed from summed base measures, never averaged.
- VALIDATED 2026-10-20: CTR/CPC/CVR use link clicks (`inline_link_clicks`); CVR = conversions / link clicks; "all clicks" metrics stay available.
- VALIDATED 2026-10-20: conversions = action types configured by the admin per ad account; overlapping aliases are rejected.
- VALIDATED 2026-10-20: one instance per agency, owned by the agency (its Vercel/host, DB, Meta app). Everything must be administrable from the UI; Cursor secrets are only for agent testing.
- VALIDATED 2026-10-20: Vercel Hobby (keep functions ≤ 300 s, one daily cron). Developer keeps `leobrowncode/openmetrics` as the reference repo; each client forks/copies it to a personal GitHub account → no client-specific hard-coding.
- Avoid correlated subqueries with Drizzle single-table selects (columns render unqualified); use grouped counts (`src/server/admin/counts.ts`).
- No attribution params are sent: Meta applies the account's attribution setting (same as Ads Manager since 2026-01-12).
- Every dashboard query is scoped by `dashboard.clientId`; viewer access re-verifies the token hash on every request.
- Share and session tokens are checked via HMAC-SHA256. Share tokens are also stored AES-256-GCM encrypted so an admin can copy the URL after reload. Meta tokens are AES-256-GCM encrypted and never sent to the browser.
- See `docs/DECISIONS.md`, `docs/METRICS.md`, `docs/SECURITY.md`.

## Known limitations / blockers

- No real Meta token: KPI accuracy vs Ads Manager not verified (procedure in `docs/METRICS.md`).
- No hosted instance yet: the agency deploys on its own Vercel Hobby account from its copy of the repo (`docs/DEPLOYMENT.md`).
- Meta OAuth never executed against real Meta (no app credentials); app mode / access tier behaviour to confirm on first real connection.
- Looker Studio reference screenshot not provided: 4-section layout inferred from the brief.
- Mobile layout not checked in a browser.
- Breakdowns (age, gender, placement, creative) and adset/ad levels not implemented yet.
- No pending business decision.

## Validation baseline

Relevant commands:

```bash
npm test            # vitest
npm run lint
npm run typecheck
npm run build
npm run test:e2e    # playwright, starts DEMO_MODE dev server on :3100
```

Current known baseline:

- Unit/integration tests (Vitest): 63 passing
- E2E tests (Playwright): 9 passing (dev/PGlite and `next start` + Postgres 16 via `E2E_BASE_URL`)
- CI: none configured

## Next action

Next run should:

1. Fetch latest GitHub state and check whether a PR was opened from `cursor/meta-reporting-mvp-foundation-a9c9`.
2. Read answers to the pending business questions (no answer ≠ approval).
3. If real Meta app credentials are provided (agent secrets), run the OAuth flow and the Ads Manager comparison (`docs/METRICS.md`).
4. Implement age/gender breakdowns (separate `insights_breakdown_daily` table, same idempotent sync), then creative level.

Do not start another roadmap item while an active automation PR exists.

## Last updated

- Date: 2026-10-20
- Main SHA: `671d410`
- Active PR/commit: branch `cursor/meta-reporting-mvp-foundation-a9c9` (PR not created — permission)
