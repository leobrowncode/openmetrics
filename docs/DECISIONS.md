# Décisions structurantes

Chaque décision indique ce qui contraint les développements suivants.

## Stack

| Choix | Raison | Licence / risque |
| --- | --- | --- |
| Next.js 16 (App Router) + React 19 | Déploiement natif Vercel, rendu serveur (secrets jamais côté navigateur), actions serveur avec protection d'origine intégrée | MIT |
| Drizzle ORM + Postgres | SQL explicite (agrégations contrôlées), migrations versionnées, léger | Apache-2.0 |
| PGlite (Postgres WASM) en local/tests | Aucun Docker ni service payant pour la démo et les tests ; même moteur SQL que la prod | Apache-2.0 / PostgreSQL |
| Recharts | Graphiques React maintenus, utilisés par shadcn/ui | MIT |
| Zod | Validation des entrées et de la configuration des dashboards | MIT |
| Client Graph API maison (≈150 lignes) | Le SDK officiel `facebook-nodejs-business-sdk` expose toutes les écritures (campagnes, budgets) ; un client **GET-only** rend l'écriture impossible par construction | — |
| Auth admin maison (scrypt + sessions en base) | Quelques administrateurs, pas besoin d'OAuth ; aucune dépendance supplémentaire | — |

Projets open source examinés : `EngAmi/meta-ads-growth-os` (MIT, tRPC/Express, orienté diagnostic, pas de partage client ni de multi-dashboards), `nawazxz/clientreport` (MIT, Python, rapports statiques), `SoCloseSociety/meta-ads-extractor` (MIT, extraction locale). Aucun ne couvre le partage sécurisé par lien ni l'isolation multi-clients ; trop jeunes (≤ 10 étoiles) pour servir de base. Ils ont servi de référence, pas de dépendance.

## Données Meta

- **Grain stocké : campagne × jour** (`insights_daily`), au fuseau du compte publicitaire, `time_increment=1`, `level=campaign`.
- **Seules les mesures additives sont stockées** (dépense, impressions, clics, clics lien, conversions, valeur). Tous les ratios sont recalculés à partir des sommes (`src/lib/metrics.ts`). Reach, fréquence et `unique_*` sont exclus : ils ne s'additionnent pas.
- **Attribution : celle du compte publicitaire.** Depuis le 12/01/2026, Meta ignore `use_unified_attribution_setting`/`action_report_time` et aligne l'API sur Ads Manager ; aucune fenêtre n'est donc forcée. Les fenêtres `7d_view` et `28d_view` n'existent plus.
- **Conversions = types d'action choisis par compte.** Les actions brutes sont conservées (`raw_actions`) pour recalculer sans re-synchroniser. Les alias d'un même événement (`purchase` / `omni_purchase` / `offsite_conversion.fb_pixel_purchase`) sont refusés ensemble (double comptage).
- **Historique** : import initial de 395 jours, puis re-synchronisation quotidienne des 28 derniers jours (fenêtre d'attribution clic). Meta conserve 37 mois pour les totaux, 13 mois pour les métriques uniques et ventilations horaires.
- **Version Graph API** : `v24.0` par défaut, surchargeable (`META_GRAPH_API_VERSION`).

## Synchronisation

- Idempotente : pour chaque fenêtre de 31 jours, suppression puis insertion **dans une transaction**. Relancer donne le même résultat ; une erreur ne laisse pas de fenêtre partielle.
- Verrou par compte (`sync_locked_until`, 15 min) : pas de synchronisations concurrentes du même compte.
- Chaque exécution est tracée (`sync_runs`) avec un message d'erreur compréhensible ; un token expiré passe la connexion en « Token expiré ».
- Vercel Cron quotidien (04:00 UTC) ; budget de 240 s par exécution, comptes les moins récemment synchronisés en premier.

## Rendu

- `cacheComponents` désactivé : toutes les pages sont authentifiées et rendues à la demande ; aucune donnée client ne doit entrer dans un cache partagé.
- Animations des graphiques désactivées (lisibilité, captures et exports statiques futurs).
- Le dashboard Viewer et l'aperçu Admin partagent le même composant (`DashboardView`) : ce que l'admin voit est ce que le client voit.

## Contraintes à préserver

- Ne jamais ajouter de méthode non-GET au client Graph API.
- Toute lecture de données d'un dashboard passe par `dashboardAccountScope` (filtre `client_id`).
- Un compte publicitaire appartient à un seul client (index unique sur `meta_account_id`).
- Ne jamais stocker ni journaliser un token de lien en clair.
