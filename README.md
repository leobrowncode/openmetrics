# OpenMetrics — Reporting Meta Ads pour agence

Alternative ciblée à Supermetrics pour **Meta Ads uniquement** : l'agence connecte ses comptes publicitaires en lecture seule, construit des dashboards par client (inspirés de son modèle Looker Studio) et les partage via des **liens privés** révocables.

> Statut : MVP en cours (phase 1). Les données de démonstration sont **synthétiques**. L'intégration Meta réelle est implémentée et testée avec des réponses simulées, mais **n'a pas encore été vérifiée sur un vrai compte** (voir `docs/ACCEPTANCE.md`).

## Démarrage rapide (démo locale)

```bash
npm install
npm run demo          # http://localhost:3000 — base PGlite locale dans .data/, données synthétiques
```

Connexion démo (développement uniquement) : `admin@demo.local` / `demo-password-2026`.

Parcours conseillé : *Dashboards* → un dashboard → *Partage* → générer un lien → l'ouvrir dans une fenêtre privée.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de dev (base PGlite en mémoire si `DATABASE_URL` absent) |
| `npm run demo` | Dev + données synthétiques persistées dans `.data/pglite` |
| `npm test` | Tests unitaires et d'intégration (Vitest + PGlite en mémoire) |
| `npm run test:e2e` | Parcours navigateur (Playwright, lance son propre serveur de démo) |
| `npm run lint` / `npm run typecheck` / `npm run build` | Qualité et build |
| `npm run db:generate` | Génère une migration après modification de `src/server/db/schema.ts` |
| `npm run db:migrate` | Applique les migrations sur `DATABASE_URL` (facultatif : elles s'appliquent aussi automatiquement au démarrage) |

## Configuration

Voir `.env.example`. En production, `TOKEN_ENCRYPTION_KEY`, `TOKEN_HASH_SECRET`, `DATABASE_URL`, `CRON_SECRET` et `APP_URL` sont obligatoires ; `ADMIN_EMAIL`/`ADMIN_PASSWORD` ne servent qu'à créer le premier administrateur.

**Installation chez le client (Vercel ou autre hébergeur) : [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).**

## Architecture

```
Extraction (src/server/meta)      Graph API en GET uniquement, pagination, retries, erreurs typées
  → Normalisation (src/server/sync/normalize.ts)   chaînes Meta → faits journaliers typés
  → Stockage (src/server/db)      Postgres / PGlite via Drizzle, faits campagne × jour
  → Calcul KPI (src/lib/metrics.ts)  ratios recalculés à partir des sommes
  → Dashboards (src/server/dashboards, src/components/dashboard)
  → Exports (phase 2, docs/PHASE2_GOOGLE_SLIDES.md)
```

- `src/app/admin/**` : espace agence (session requise sur chaque page et chaque action serveur).
- `src/app/share/**` : espace client (lien privé, lecture seule).
- `src/app/api/cron/sync` : synchronisation planifiée (Vercel Cron, `Authorization: Bearer $CRON_SECRET`).

Documentation : [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · [`docs/DECISIONS.md`](docs/DECISIONS.md) · [`docs/METRICS.md`](docs/METRICS.md) · [`docs/SECURITY.md`](docs/SECURITY.md) · [`docs/PHASE2_GOOGLE_SLIDES.md`](docs/PHASE2_GOOGLE_SLIDES.md) · [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)

## Connecter un vrai compte Meta

**Recommandé : Admin → Connexions Meta → « Se connecter avec Facebook »** (nécessite `META_APP_ID` / `META_APP_SECRET`, voir `docs/DEPLOYMENT.md`). Seule la permission `ads_read` est demandée ; le code est échangé côté serveur et le token est chiffré.

Alternative (token d'utilisateur système, sans expiration) :

1. Business Manager de l'agence → *Utilisateurs système* → créer un utilisateur système.
2. Lui attribuer les comptes publicitaires clients avec le droit « Afficher les performances ».
3. Générer un token avec **uniquement** `ads_read`.
4. Admin → *Connexions Meta* → *Option avancée* → coller le token. Il est vérifié (`/me/permissions`), chiffré, jamais réaffiché.

Ensuite : fiche client → rattacher un compte → choisir l'événement de conversion après l'import initial (13 mois).
