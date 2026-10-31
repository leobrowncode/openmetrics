# OpenMetrics — Reporting Meta Ads pour agence

Alternative ciblée à Supermetrics pour **Meta Ads uniquement** : l'agence connecte ses comptes publicitaires en lecture seule, construit des dashboards par client et les partage par des **liens privés** révocables.

> Statut au 30 octobre 2026 (`main`, `e41bb84`) : l'outil a été utilisé avec les données Meta réelles d'un client, qui est satisfait de cette version. Le dépôt ne contient pas le relevé chiffré de la comparaison avec Ads Manager (`docs/METRICS.md`) : cette égalité n'est donc pas affirmée ici. Les tests automatisés restent sur des réponses simulées ou des données synthétiques.

Les PR [#13](https://github.com/leobrowncode/openmetrics/pull/13), [#14](https://github.com/leobrowncode/openmetrics/pull/14), [#15](https://github.com/leobrowncode/openmetrics/pull/15) et [#16](https://github.com/leobrowncode/openmetrics/pull/16) sont ouvertes et **ne font pas partie de cette description**.

## Démarrage rapide (démo locale)

```bash
npm install
npm run demo          # http://localhost:3000 — base PGlite dans .data/, données synthétiques
```

Connexion démo (développement uniquement) : `admin@demo.local` / `demo-password-2026`.

Avec `DEMO_MODE=true`, l'accueil liste deux dashboards synthétiques (Association Horizon, Maison Lumen) sans login. L'admin se trouve sur `/login`.

Parcours conseillé : *Dashboards* → un dashboard → *Partage* → générer un lien → l'ouvrir dans une fenêtre privée. Le lien n'est recopiable que tant que la page n'a pas été rechargée.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de dev. PGlite en mémoire si `DATABASE_URL` est absent, ou dans `PGLITE_DATA_DIR` s'il est défini. |
| `npm run demo` | Dev avec `DEMO_MODE=true` et base PGlite dans `.data/pglite`. |
| `npm test` | Tests unitaires et d'intégration (Vitest + PGlite en mémoire). |
| `npm run test:e2e` | Parcours navigateur (Playwright). Lance son propre serveur de démo. |
| `npm run lint` / `npm run typecheck` / `npm run build` | Qualité et build. |
| `npm run db:generate` | Génère une migration Drizzle après modification de `src/server/db/schema.ts`. |
| `npm run db:migrate` | Applique les migrations sur `DATABASE_URL`. Au démarrage de l'application, elles s'appliquent aussi seules (verrou consultatif Postgres). |

Aucune CI n'est configurée dans le dépôt.

## Configuration

Référence : [`.env.example`](.env.example). Rien de cette liste n'est envoyé au navigateur.

| Variable | Production |
| --- | --- |
| `DATABASE_URL` | Indispensable pour une instance durable. Sans elle, le code démarre sur PGlite, y compris si `NODE_ENV=production` : ce fichier ne survit pas d'une instance serverless à l'autre. |
| `TOKEN_ENCRYPTION_KEY` | Obligatoire en production (`openssl rand -hex 32`). Chiffre les tokens Meta (AES-256-GCM). |
| `TOKEN_HASH_SECRET` | Obligatoire en production (`openssl rand -hex 32`). Empreintes HMAC des liens privés et des sessions. |
| `CRON_SECRET` | Au moins 16 caractères. Sans lui, `GET /api/cron/sync` répond 401. Vercel l'envoie en `Authorization: Bearer` lorsque la variable porte ce nom. |
| `APP_URL` | URL publique sans chemin (`https://reporting.exemple.fr`). Sert aux liens privés et à l'URI de retour Facebook. Si elle est absente, l'origine est déduite de la requête. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Créent cet administrateur, puis **réalignent son mot de passe à chaque démarrage** tant qu'elles restent définies (sessions de ce compte fermées). Mot de passe d'au moins 12 caractères. À retirer après la première connexion. |
| `META_APP_ID` / `META_APP_SECRET` | Activent « Se connecter avec Facebook » et `appsecret_proof`. |
| `META_LOGIN_CONFIG_ID` | Optionnel. Configuration Facebook Login for Business. |
| `META_GRAPH_API_VERSION` | Défaut `v24.0` (encore valide ; expiration Meta le 18 février 2028). `v26.0` est la version courante au 30 octobre 2026. |
| `DEMO_MODE` | `false` sur l'instance d'une agence. `true` amorce les clients synthétiques **une seule fois**, sur une base vide. |
| `PGLITE_DATA_DIR` | Local uniquement. |

**Lancer une instance chez une nouvelle agence : [`docs/LANCEMENT.md`](docs/LANCEMENT.md).** Le résumé technique d'hébergement reste dans [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Fonctionnalités sur `main`

Espace agence (`/admin`, session sur chaque page et chaque action) :

- **Connexions Meta** : OAuth « Se connecter avec Facebook » (`ads_read` seul, échange du code côté serveur, token chiffré) ou collage d'un token d'utilisateur système. Test de la connexion, remplacement du token, alerte 14 jours avant l'expiration enregistrée.
- **Clients** : création avec le sélecteur des comptes déjà visibles via Meta. Un compte Meta ne peut appartenir qu'à un seul client. La fiche ne propose d'en ajouter un que tant que le client n'en a aucun.
- **Conversions** : choix des `action_type` après l'import. Les alias d'un même événement sont refusés. Le nom affiché (Achats, Prospects, etc.) remplace le libellé générique. Le recalcul se fait depuis les actions brutes stockées, sans re-télécharger.
- **Synchronisation** : manuelle ou cron quotidien `0 4 * * *` (04:00 UTC, à l'heure près sur Vercel Hobby). Import initial de 760 jours, du plus récent au plus ancien, par tranches de 31 jours, reprenable. Budget 200 s par exécution (la fonction cron est plafonnée à 300 s). Verrou par compte, exécutions tracées dans *Synchronisations*.
- **Modèles et dashboards** : modèle intégré « Référence agence - 4 sections », modèles éditables, widgets (cartes KPI, graphique, tableau par campagne), duplication, enregistrement comme modèle. Renommage au clic sur le titre. Deux couleurs de courbes par dashboard.
- **Bilans** : depuis l'aperçu, une sélection de campagnes et la période affichée sont figées sous un nom. Un lien privé peut ouvrir ce bilan sans laisser changer la période ni les campagnes.
- **Partage** : création, expiration, révocation, renouvellement. Copie du lien depuis la ligne **pendant la session de page** qui l'a généré ou renouvelé. Après rechargement, le jeton n'est plus reconstruit (seule son empreinte est en base).
- **Équipe** : ajout et retrait d'administrateurs, changement de mot de passe.
- **Copie** : chaque tableau de campagnes et chaque graphique (exporté en tableau) se copient vers le presse-papiers.
- **Données synthétiques** : réglage Automatique / Masquer / Afficher. En Automatique, les chiffres de démo sortent des dashboards dès qu'un compte Meta réel est rattaché. Les fiches, la connexion « Données synthétiques » et les lignes en base **restent**. La PR [#7](https://github.com/leobrowncode/openmetrics/pull/7) (suppression après une synchro réelle) a été fusionnée dans la branche de la PR #6 après le merge de cette branche dans `main` : ce commit n'est pas dans `main`.

Espace client (`/share`) : lecture seule, jeton dans le fragment d'URL, cookie HttpOnly limité au chemin du lien, pages non indexées et non mises en cache.

## En cours (ne pas considérer comme livré)

| PR | Sujet |
| --- | --- |
| [#13](https://github.com/leobrowncode/openmetrics/pull/13) | Garder les liens privés copiables après rechargement |
| [#14](https://github.com/leobrowncode/openmetrics/pull/14) | Retirer le texte sous les couleurs et aligner « Générer un bilan » |
| [#15](https://github.com/leobrowncode/openmetrics/pull/15) | Trier la liste des dashboards en cliquant sur les titres de colonnes |
| [#16](https://github.com/leobrowncode/openmetrics/pull/16) | Barre d'aperçu plus compacte et dates des graphiques |

## Architecture

```
Extraction (src/server/meta)      Graph API en GET uniquement, pagination, retries, erreurs typées
  → Normalisation (src/server/sync/normalize.ts)   chaînes Meta → faits journaliers
  → Stockage (src/server/db)      Postgres ou PGlite via Drizzle ; grain campagne × jour
  → Calcul KPI (src/lib/metrics.ts)  ratios recalculés à partir des sommes
  → Dashboards (src/server/dashboards, src/components/dashboard)
```

- `src/app/admin/**` : espace agence.
- `src/app/share/**` : espace client.
- `src/app/demo/**` : dashboards synthétiques publics, seulement si `DEMO_MODE=true` et si l'affichage synthétique est actif.
- `src/app/api/cron/sync` : synchronisation planifiée (`vercel.json`, une fois par jour).

Stack constatée dans `package.json` : Next.js 16.4.2, React 19.3, Drizzle ORM, Postgres (`postgres`) ou PGlite, Zod, Recharts. Pas de SDK Meta : le client Graph n'expose que `GET`.

Documentation : [`docs/LANCEMENT.md`](docs/LANCEMENT.md) · [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · [`docs/DECISIONS.md`](docs/DECISIONS.md) · [`docs/METRICS.md`](docs/METRICS.md) · [`docs/SECURITY.md`](docs/SECURITY.md) · [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) · [`docs/PHASE2_GOOGLE_SLIDES.md`](docs/PHASE2_GOOGLE_SLIDES.md) · [`docs/PROMPT_GOOGLE_ADS.md`](docs/PROMPT_GOOGLE_ADS.md)

## Connecter un vrai compte Meta

**Recommandé : Admin → Connexions Meta → « Se connecter avec Facebook »** (`META_APP_ID` et `META_APP_SECRET`). Seule `ads_read` est demandée. Le code est échangé côté serveur ; le token est chiffré et n'est jamais réaffiché.

Alternative : Business Manager → utilisateur système → droit « Afficher les performances » sur les comptes clients → token avec **uniquement** `ads_read` → *Option avancée*. L'application vérifie `/me/permissions` avant d'enregistrer.

Ensuite : fiche client → rattacher un compte (l'import des 25 mois part tout seul, du plus récent au plus ancien) → choisir l'événement de conversion quand des actions ont été observées → créer le dashboard → *Partage*.

Le détail des écrans Meta, de Vercel Hobby et de l'ordre des opérations est dans [`docs/LANCEMENT.md`](docs/LANCEMENT.md).
