# Agent State

> This file is a compact resume point for autonomous development agents.
> Git, GitHub PRs/issues and the actual repository remain the source of truth.

## Current project status

Current roadmap position:

- Completed through: Phase 1 — MVP foundation (demo data, not yet verified against a real Meta account)
- Current phase: Phase 1 — MVP
- Current objective: verify KPIs against Ads Manager on a real read-only account, then add breakdowns (age, gender, placement, creative)

## Completed

- Data pipeline: read-only Graph client → normalisation → Postgres (Drizzle) → KPI engine (ratio of sums) → dashboards
- Idempotent, locked, chunked sync (manual + Vercel cron), Meta error classification, token expiry/permission states, sync monitoring page
- Admin: auth (scrypt, rate limited), clients, ad accounts, conversion event config with overlap detection, dashboards (create/duplicate/delete/edit widgets), templates, Meta connections
- Viewer: private links (hashed tokens, fragment-only URL, path-scoped HttpOnly cookie, revoke/renew/expiry), period + campaign filters, noindex/no-store/no-referrer
- Reference template "Référence agence — 4 sections" (Investissements, Impressions et clics, CTR et CPC, Conversions)
- Phase 2 research only: `docs/PHASE2_GOOGLE_SLIDES.md` (no code)

## Active work

- Issue: none
- Branch: `cursor/meta-reporting-mvp-foundation-a9c9`
- Pull request: none — `create_pr` refused with "must be a collaborator"; a repository collaborator must open it from this branch
- Status: review

## Important decisions

- Meta access is read-only: the Graph client only exposes GET; no write endpoint may be added.
- Ratios (CTR, CPC, CPM, CVR, CPA, ROAS) are always computed from summed base measures, never averaged.
- CTR/CPC/CVR default to link clicks (`inline_link_clicks`); "all clicks" metrics exist separately. Pending business confirmation.
- Conversions = sum of the action types configured per ad account; overlapping aliases are rejected.
- No attribution params are sent: Meta applies the account's attribution setting (same as Ads Manager since 2026-01-12).
- Every dashboard query is scoped by `dashboard.clientId`; viewer access re-verifies the token hash on every request.
- Share tokens and session tokens are stored as HMAC-SHA256 hashes only; Meta tokens are AES-256-GCM encrypted.
- See `docs/DECISIONS.md`, `docs/METRICS.md`, `docs/SECURITY.md`.

## Known limitations / blockers

- No real Meta token: KPI accuracy vs Ads Manager not verified (procedure in `docs/METRICS.md`).
- No Vercel deployment / hosted Postgres: requires user authorization (no paid service, no prod deploy without approval).
- Looker Studio reference screenshot not provided: 4-section layout inferred from the brief.
- Mobile layout not checked in a browser.
- Breakdowns (age, gender, placement, creative) and adset/ad levels not implemented yet.
- Business decisions pending: click definition, conversion event per client, deployment authorization.

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

- Unit/integration tests (Vitest): 46 passing
- E2E tests (Playwright): 5 passing
- CI: none configured

## Next action

Next run should:

1. Fetch latest GitHub state and check whether a PR was opened from `cursor/meta-reporting-mvp-foundation-a9c9`.
2. Read answers to the pending business questions (no answer ≠ approval).
3. Implement age/gender breakdowns (separate `insights_breakdown_daily` table, same idempotent sync), then creative level.

Do not start another roadmap item while an active automation PR exists.

## Last updated

- Date: 2026-10-19
- Main SHA: `671d410`
- Active PR/commit: branch `cursor/meta-reporting-mvp-foundation-a9c9` (PR not created — permission)
