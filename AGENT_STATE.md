# État pour l'agent

> Fichier de reprise pour un agent de développement. Git, les PR GitHub et le code restent la source de vérité.
> Documentation en français. Dernière revue du code : 30 octobre 2026, `main` à `e41bb84`.

## Statut

- Livré sur `main` : reporting Meta Ads en lecture seule, instance par agence (Vercel Hobby ou autre Node.js), OAuth `ads_read`, dashboards, bilans, liens privés, démo synthétique.
- Usage réel rapporté le 30 octobre 2026 : un client a été testé sur ses vraies données Meta et est satisfait de cette version. Le dépôt ne contient pas le tableau de comparaison KPI contre Ads Manager. Ne pas écrire que les chiffres sont validés face à Ads Manager.
- Phase 2 Google Slides : recherche seulement (`docs/PHASE2_GOOGLE_SLIDES.md`).
- Google Ads : pas de code. Le cahier des charges pour un agent est `docs/PROMPT_GOOGLE_ADS.md`. Ne pas commencer l'implémentation sans demande explicite.
- PR ouvertes, à ne pas fusionner dans le cadre d'une tâche documentation : [#13](https://github.com/leobrowncode/openmetrics/pull/13) liens privés persistants, [#14](https://github.com/leobrowncode/openmetrics/pull/14) texte des couleurs et bouton « Générer un bilan », [#15](https://github.com/leobrowncode/openmetrics/pull/15) tri des dashboards, [#16](https://github.com/leobrowncode/openmetrics/pull/16) barre d'aperçu et dates des graphiques.

## Fait (vérifié dans le code de `main`)

- Pipeline : client Graph GET seulement → `normalize.ts` → Postgres / PGlite (Drizzle) → `src/lib/metrics.ts` (ratio des sommes) → dashboards.
- Synchro idempotente, verrouillée, par tranches de 31 jours, données récentes d'abord, historique 760 jours, budget 200 s, passages interrompus clos. Cron `0 4 * * *`, `maxDuration` 300.
- Admin : scrypt, sessions, rate limit, clients, un compte Meta affiché à la fois sur la fiche, conversions avec refus des alias qui se recouvrent, nommage des événements, dashboards, modèles, couleurs de courbes, renommage du titre, bilans, copie des tableaux et des graphiques en tableau, équipe, `ADMIN_PASSWORD` réappliqué au compte déjà créé.
- Liens privés : jeton 256 bits, empreinte HMAC seule en base, fragment d'URL, cookie HttpOnly. Copie possible tant que l'URL est encore dans la page qui vient de la créer ou de la renouveler.
- OAuth Meta maison, `ads_read`, cookie d'état signé, token longue durée pour un jeton utilisateur, expiration stockée, alerte à moins de 14 jours.
- Démo publique si `DEMO_MODE=true`. Réglage synthétique `auto` / `hide` / `show` : les chiffres de démo sortent des dashboards, les lignes ne sont pas supprimées.
- Migrations au démarrage (`0000` à `0003`), guide `docs/LANCEMENT.md`.

## Travail actif

- Sujet : documentation d'état, lancement d'une instance, prompt Google Ads. Aucun changement de code applicatif.
- Branche : `cursor/docs-etat-lancement-74f3` (documentation seulement, ouverte vers `main`).
- Ne pas merger les PR #13 à #16.

## Décisions qui contraignent la suite

- Meta en lecture seule : pas de méthode autre que GET dans le client Graph.
- Ratios toujours recalculés sur les sommes. CTR, CPC et CVR du modèle de référence : clics sur un lien (`inline_link_clicks`). Validé le 2026-10-20.
- Conversions = types d'action choisis par compte. Alias recouvrants refusés. Validé le 2026-10-20.
- Une instance par agence, possédée par elle. Pas de valeur client en dur. Secrets Cursor = tests de l'agent seulement.
- Vercel Hobby accepté le 2026-10-20 (fonctions ≤ 300 s, un cron par jour). Les conditions Vercel réservent Hobby à un usage non commercial : risque déjà noté dans `docs/DECISIONS.md`.
- Dépôt de référence : `leobrowncode/openmetrics`. Chaque agence travaille sur une copie. Un projet Hobby ne se relie pas à un dépôt appartenant à une organisation Git.
- Pas de paramètres d'attribution envoyés à Meta (réglage du compte, comme Ads Manager depuis le 2026-01-12).
- Toute lecture dashboard passe par le `clientId` du dashboard. Jeton de lien et session : HMAC-SHA256. Token Meta : AES-256-GCM.
- Éviter les sous-requêtes corrélées dans un `select` Drizzle mono-table (`src/server/admin/counts.ts`).
- Détail : `docs/DECISIONS.md`, `docs/METRICS.md`, `docs/SECURITY.md`.

## Limites connues

- Comparaison KPI vs Ads Manager : procédure dans `docs/METRICS.md`, résultat non consigné.
- La PR #7 (« Masquer retire tout le synthétique, puis l'efface après une synchro Meta ») est marquée fusionnée sur GitHub, mais dans la branche `cursor/faster-nav-dashboard-ux-c110` **après** le merge de la PR #6 dans `main`. `a3a868d` n'est pas un ancêtre de `e41bb84`. Sur `main`, masquer n'efface pas les clients fictifs, et le cron synchronise encore les comptes `kind = demo`.
- Mode d'accès Meta réellement utilisé pour le client satisfait (OAuth, token système, Limited ou Full, app en développement ou Live) : non écrit dans le dépôt.
- Pas de ventilation âge, genre, placement, ni de niveau ensemble de publicités ou publicité.
- L'interface ne propose pas un second compte Meta sur la même fiche. Le schéma l'interdirait seulement s'il s'agit du même `meta_account_id`.
- Mise en page mobile non consignée comme vérifiée dans un navigateur.
- Aucune route de suppression de données pour le callback Meta. Aucune page politique de confidentialité dans l'application.
- Pas de CI.

## Base de validation

```bash
npm test            # vitest
npm run lint
npm run typecheck
npm run build
npm run test:e2e    # playwright, DEMO_MODE sur le port 3100
```

Comptage des `it` / `test` dans l'arbre au 30 octobre 2026, sans nouvelle exécution dans cette mise à jour documentaire : 93 cas Vitest, 13 cas Playwright. Le décompte « 63 / 9 » du 20 octobre est périmé. Cette mise à jour n'a pas relancé la suite.

## Prochaine action

1. Laisser les PR #13 à #16 suivre leur revue. Ne pas les merger pour « nettoyer ».
2. Si l'agence veut vraiment la suppression du synthétique après une synchro réelle, reporter le commit de la PR #7 sur `main` (il n'y est pas).
3. Ne pas implémenter Google Ads tant que ce n'est pas demandé. Le prompt autonome est `docs/PROMPT_GOOGLE_ADS.md`.
4. Ne pas déclarer les KPI conformes à Ads Manager tant qu'un relevé n'est pas écrit dans `docs/ACCEPTANCE.md`.

## Dernière mise à jour

- Date : 2026-10-30
- SHA de `main` décrit : `e41bb84e628c2e9dd9c2a29e9455ee03be606ad0`
- Sujet : documentation (README, AGENT_STATE, `docs/LANCEMENT.md`, `docs/PROMPT_GOOGLE_ADS.md`)
