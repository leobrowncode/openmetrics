# État pour l'agent

> Fichier de reprise pour un agent de développement. Git, les PR GitHub et le code restent la source de vérité.
> Documentation en français. Dernière revue du code : 31 octobre 2026. Cette branche garde les liens privés recopiable après rechargement et le masquage / la purge du synthétique après une synchro Meta réelle.

## Statut

- Livré sur `main` avant cette branche : reporting Meta Ads en lecture seule, instance par agence (Vercel Hobby ou autre Node.js), OAuth `ads_read`, dashboards, bilans, liens privés, démo synthétique, masquage et purge du synthétique (PR #18), guide de lancement (PR #17).
- Cette branche (PR #13) ajoute la copie AES-256-GCM du jeton de lien. L'accès reste vérifié par l'empreinte HMAC. `verifyShareToken` renvoie null quand le client synthétique est masqué.
- Usage réel rapporté le 30 octobre 2026 : un client a été testé sur ses vraies données Meta et est satisfait de cette version. Le dépôt ne contient pas le tableau de comparaison KPI contre Ads Manager. Ne pas écrire que les chiffres sont validés face à Ads Manager.
- Phase 2 Google Slides : recherche seulement (`docs/PHASE2_GOOGLE_SLIDES.md`).
- Google Ads : pas de code. Le cahier des charges pour un agent est `docs/PROMPT_GOOGLE_ADS.md`. Ne pas commencer l'implémentation sans demande explicite.
- PR ouvertes, à ne pas fusionner ici : [#14](https://github.com/leobrowncode/openmetrics/pull/14) texte des couleurs et bouton « Générer un bilan », [#15](https://github.com/leobrowncode/openmetrics/pull/15) tri des dashboards, [#16](https://github.com/leobrowncode/openmetrics/pull/16) barre d'aperçu et dates des graphiques.

## Fait (vérifié dans ce code)

- Pipeline : client Graph GET seulement → `normalize.ts` → Postgres / PGlite (Drizzle) → `src/lib/metrics.ts` (ratio des sommes) → dashboards.
- Synchro idempotente, verrouillée, par tranches de 31 jours, données récentes d'abord, historique 760 jours, budget 200 s, passages interrompus clos. Cron `0 4 * * *`, `maxDuration` 300.
- Admin : scrypt, sessions, rate limit, clients, un compte Meta affiché à la fois sur la fiche, conversions avec refus des alias qui se recouvrent, nommage des événements, dashboards, modèles, couleurs de courbes, renommage du titre, bilans, copie des tableaux et des graphiques en tableau, équipe, `ADMIN_PASSWORD` réappliqué au compte déjà créé.
- Liens privés : jeton 256 bits, empreinte HMAC pour chaque accès, copie AES-256-GCM pour réafficher l'URL après rechargement, fragment d'URL, cookie HttpOnly. Un lien créé avant cette copie reste valide mais ne se reconstruit pas : il faut le renouveler.
- OAuth Meta maison, `ads_read`, cookie d'état signé, token longue durée pour un jeton utilisateur, expiration stockée, alerte à moins de 14 jours.
- Démo publique si `DEMO_MODE=true`. Réglage synthétique `auto` / `hide` / `show`. **Masquer**, et **Automatique** dès qu'un compte Meta réel est relié, retire les clients fictifs, dashboards, comptes, connexion de démo, synchronisations et liens privés de l'affichage. Ils sont effacés après une synchro Meta qui a enregistré des lignes (succès ou import partiel). **Afficher** ne supprime rien. Un client mixte garde ses comptes Meta ; seuls les comptes de démo partent. Les données réelles ne sont pas touchées.
- Migrations au démarrage (`0000` à `0004_share_token`), guide `docs/LANCEMENT.md`. `main` s'arrête à `0003_bilans` : pas de collision de numéro.

## Travail actif

- Sujet : PR #13 remise à jour avec `origin/main` (PR #17 et #18). Les deux comportements restent : lien recopiable, et masquage / purge du synthétique.
- Ne pas merger les PR #14 à #16 sans demande. Ne pas merger cette PR sans demande.

## Décisions qui contraignent la suite

- Meta en lecture seule : pas de méthode autre que GET dans le client Graph.
- Ratios toujours recalculés sur les sommes. CTR, CPC et CVR du modèle de référence : clics sur un lien (`inline_link_clicks`). Validé le 2026-10-20.
- Conversions = types d'action choisis par compte. Alias recouvrants refusés. Validé le 2026-10-20.
- Une instance par agence, possédée par elle. Pas de valeur client en dur. Secrets Cursor = tests de l'agent seulement.
- Vercel Hobby accepté le 2026-10-20 (fonctions ≤ 300 s, un cron par jour). Les conditions Vercel réservent Hobby à un usage non commercial : risque déjà noté dans `docs/DECISIONS.md`.
- Dépôt de référence : `leobrowncode/openmetrics`. Chaque agence travaille sur une copie. Un projet Hobby ne se relie pas à un dépôt appartenant à une organisation Git.
- Pas de paramètres d'attribution envoyés à Meta (réglage du compte, comme Ads Manager depuis le 2026-01-12).
- Toute lecture dashboard passe par le `clientId` du dashboard. Jeton de lien et session : HMAC-SHA256. Le jeton de lien est aussi stocké en AES-256-GCM pour que l'admin puisse recopier l'URL après rechargement. Token Meta : AES-256-GCM.
- Éviter les sous-requêtes corrélées dans un `select` Drizzle mono-table (`src/server/admin/counts.ts`).
- Détail : `docs/DECISIONS.md`, `docs/METRICS.md`, `docs/SECURITY.md`.

## Limites connues

- Comparaison KPI vs Ads Manager : procédure dans `docs/METRICS.md`, résultat non consigné.
- La PR #7 est marquée fusionnée sur GitHub, mais son merge commit `8b13ee1` (29 octobre 2026, 12:17:42) a pour base la branche `cursor/faster-nav-dashboard-ux-c110` et pour premier parent `928fb24`. La PR #6 avait été fusionnée dans `main` treize secondes plus tôt (`8911963`, second parent `928fb24`), donc `a3a868d` n'a jamais été un ancêtre de `main`. Le comportement est rétabli ici : Masquer retire le synthétique de l'affichage, puis une synchro Meta réelle l'efface sans toucher aux données réelles.
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

Exécution du 31 octobre 2026 sur cette branche, après la fusion de `main` : 100 cas Vitest, 13 cas Playwright. Le décompte « 63 / 9 » du 20 octobre est périmé. `npm run typecheck` a besoin de `next typegen` sur un arbre sans `.next` (`next-env.d.ts` est ignoré par Git).

## Prochaine action

1. Laisser les PR #14 à #16 suivre leur revue. Ne pas les merger pour « nettoyer ».
2. Ne pas implémenter Google Ads tant que ce n'est pas demandé. Le prompt autonome est `docs/PROMPT_GOOGLE_ADS.md`. La prochaine migration après celle-ci est le numéro suivant `0004_share_token`.
3. Ne pas déclarer les KPI conformes à Ads Manager tant qu'un relevé n'est pas écrit dans `docs/ACCEPTANCE.md`.

## Dernière mise à jour

- Date : 2026-10-31
- Sujet : fusion de `origin/main` dans la branche des liens privés persistants. Conflit limité à ce fichier. `share-links.ts` garde la copie chiffrée et le refus d'accès quand `syntheticClientHidden` est vrai.
