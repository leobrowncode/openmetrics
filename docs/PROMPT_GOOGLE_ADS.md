# Prompt — Ajouter Google Ads à OpenMetrics

Document autonome, à donner tel quel à un agent de code Cursor. Il décrit l'ajout de Google Ads en lecture seule pour que le même dashboard couvre Google et Meta. Ne pas l'implémenter dans la PR qui a créé ce fichier.

État du code visé : `main` au 30 octobre 2026, SHA `e41bb84e628c2e9dd9c2a29e9455ee03be606ad0`. Relire les fichiers cités avant de modifier : ils font foi si ce prompt a vieilli. Les PR #13 à #16 sont ouvertes : ne pas les merger et ne pas les prendre comme base, sauf demande explicite.

Les faits Google ci-dessous viennent de la documentation officielle relue le 30 octobre 2026. Si la doc a changé, suivre la doc et le noter dans la PR, ne pas suivre un palier périmé de ce prompt.

---

## Rôle

Tu ajoutes Google Ads à OpenMetrics sans casser le reporting Meta déjà en production chez une agence. Le produit reste une instance par agence, administrée depuis l'interface, déployable sur Vercel Hobby.

## Objectif

Un administrateur connecte Google en lecture seule, rattache un ou plusieurs comptes Google au même client que le compte Meta, et obtient :

- une vue combinée (dépense, impressions, clics, conversions, valeur, ratios) ;
- une vue Meta seule et une vue Google seule ;
- les mêmes liens privés, bilans, modèles, copie de tableaux et synchro planifiée.

Les ratios restent des ratios de sommes. Aucune écriture chez Google ni chez Meta.

## Contraintes (toutes obligatoires)

1. **Lecture seule.** Le client Meta (`src/server/meta/graph-client.ts`) n'expose que `GET`. Le client Google ne doit exposer que `GoogleAdsService.Search` ou `SearchStream` (reporting). Pas de `mutate`, pas de création de compte, pas de gestion d'utilisateurs. Un test doit échouer si une méthode d'écriture apparaît.
2. **Jetons chiffrés.** Réutiliser `encryptSecret` / `decryptSecret` (`src/server/security/encryption.ts`, AES-256-GCM, clé `TOKEN_ENCRYPTION_KEY`). Stocker le refresh token. Le access token (une heure) reste en mémoire le temps de l'appel. Jamais de jeton dans une URL, un log, une réponse admin ou un lien privé.
3. **Ratios recalculés.** Seules des mesures additives sont stockées. CTR, CPC, CPM, CVR, CPA, ROAS passent par `src/lib/metrics.ts` après agrégation. Ne jamais stocker un ratio renvoyé par Google.
4. **Vercel Hobby.** `src/app/api/cron/sync/route.ts` a `maxDuration = 300`. `SYNC_TIME_BUDGET_MS` vaut 200 000. Un seul cron, `0 4 * * *` dans `vercel.json`. Google et Meta partagent ce budget dans la même invocation. Pas de second cron. Pas de fonction plus longue.
5. **Instance par agence, zéro valeur en dur.** Identifiants Google Cloud, comptes clients, événements de conversion : variables d'environnement ou base. Pas de customer id, pas de login-customer-id, pas de nom d'agence dans le source.
6. **Tout est administrable dans l'UI.** Connexion, reconnexion, choix des comptes, choix des conversions, filtre de plateforme, modèles. Pas d'étape SQL manuelle pour l'agence. Les migrations s'appliquent au démarrage comme aujourd'hui (`src/server/db/client.ts`).
7. **Ne pas casser Meta.** Les dashboards, liens, bilans et synchros existants se comportent comme avant tant qu'aucun compte Google n'est rattaché. Les tests Meta actuels restent verts.
8. **Devises.** Déjà le cas Meta : un dashboard qui mélange des devises n'additionne pas (`getDashboardData` dans `src/server/dashboards/data.ts`). Même règle si Meta est en EUR et Google en USD. Ne pas convertir.
9. **Pas de SDK qui sait écrire**, ou alors un usage tellement restreint qu'un test d'isolation le prouve. Un petit client HTTP maison, sur le modèle de `graph-client.ts`, est préférable.
10. **Données synthétiques.** `DEMO_MODE` doit pouvoir montrer un compte Google fictif sans identifiants Google, comme `src/server/meta/demo-source.ts` le fait pour Meta.

## Ce qu'il ne faut pas faire

- Ne pas merger les PR #13 à #16.
- Ne pas ajouter `ads_management` ni élargir les scopes Meta.
- Ne pas envoyer de fenêtre d'attribution forcée à Meta.
- Ne pas moyenne des CTR journaliers.
- Ne pas copier `metrics.clicks` Google dans `link_clicks`. Le voir ci-dessous : un zéro stocké ferait afficher un CTR lien de 0 %, parce que `ratio` dans `metrics.ts` renvoie 0 dès que le dénominateur est positif.
- Ne pas exiger un developer token. Il a été retiré par Google le 9 septembre 2026 (voir prérequis).

## Architecture réelle à respecter

| Rôle | Fichier |
| --- | --- |
| Schéma | `src/server/db/schema.ts` — `meta_connections` (`kind` `meta` \| `demo`), `ad_accounts` (unique sur `meta_account_id`, devise, fuseau, `conversion_action_types`, `history_from`), `campaigns`, `insights_daily` (clé compte × campagne × jour), `dashboards.config`, `bilans`, `share_links` |
| Source Meta | `src/server/meta/source.ts` — interface `InsightsSource` : `listAdAccounts`, `getAdAccount`, `fetchCampaignDailyInsights` |
| Client HTTP Meta | `src/server/meta/graph-client.ts` — GET, pagination, retries, `appsecret_proof` |
| OAuth Meta | `src/server/meta/oauth.ts`, `oauth-flow.ts`, routes `src/app/admin/connections/meta/start` et `callback` |
| Normalisation | `src/server/sync/normalize.ts` — chaînes → nombres, `raw_actions` / `raw_action_values` |
| Synchro | `src/server/sync/sync-service.ts` — tranches 31 jours, verrou 15 min, budget 200 s, refresh d'attribution 28 jours, backfill 760 jours, `recomputeConversions` |
| Cron | `src/app/api/cron/sync/route.ts` |
| KPI | `src/lib/metrics.ts` — `spend`, `impressions`, `clicks`, `linkClicks`, `conversions`, `conversionValue` |
| Config dashboard | `src/lib/dashboard-config.ts` — widgets `kpi`, `timeseries`, `campaign_table` |
| Périmètre | `dashboardAccountScope` / `loadDashboardAccounts` dans `src/server/dashboards/data.ts` — filtre `client_id`, exclusion du synthétique |
| Conversions nommées | `src/lib/conversion-actions.ts` |
| UI connexions | `src/app/admin/connections/page.tsx` — libellé de nav « Connexions Meta » dans `src/app/admin/AdminNav.tsx` |
| Fiche client | `src/app/admin/clients/[clientId]/page.tsx` — le sélecteur d'ajout n'apparaît que si le client n'a aucun compte |
| Partage | `src/server/share/share-links.ts` — empreinte HMAC seulement ; copie du lien tant que la page le garde en mémoire |
| Bilans | table `bilans`, `src/server/dashboards/bilans.ts` — campagnes + dates figées |
| Chiffrement / admin | `src/server/security/encryption.ts`, `src/server/auth/admin.ts` |
| Env | `src/server/env.ts`, `.env.example` |

Le grain stocké est **campagne × jour**, fuseau du compte. Reach et uniques sont exclus parce qu'ils ne s'additionnent pas. Garder ce grain.

`docs/DECISIONS.md` dit encore « un client, un compte Meta ; Google Ads prévu en V2, pas avant ». Cette demande est ce V2. Mettre la décision à jour dans la même série de PR : un client peut avoir son compte Meta **et** des comptes Google. L'UI actuelle qui cache « Ajouter un compte » dès le premier compte doit être assouplie, sinon Google ne pourra pas être rattaché à un client qui a déjà Meta.

## Prérequis humains Google (ne pas les coder comme déjà faits)

Documentation relue le 30 octobre 2026.

Les **developer tokens sont retirés depuis le 9 septembre 2026**. Le niveau d'accès est porté par le **projet Google Cloud** qui possède le client OAuth (ou le compte de service). Envoyer l'en-tête `developer-token` reste toléré et ignoré. Ne pas ajouter de champ obligatoire « developer token » dans l'UI ni dans l'env. Un champ optionnel ignoré n'apporte rien : ne pas l'ajouter.

Niveaux, dans l'ordre, page [Access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels) :

| Niveau | Comptes | Opérations / 24 h glissantes | Comment |
| --- | --- | --- | --- |
| Test | Comptes de test seulement | 15 000 | Activer l'API Google Ads sur le projet |
| Explorer | Test et production | 2 880 en production, 15 000 en test | Demande sur la page Google Ads API du projet, souvent automatique. Bloque la création de comptes, la gestion d'utilisateurs, le planning, la facturation. Le reporting n'est pas dans cette liste. |
| Basic | Test et production | 15 000 | Après Explorer. **Brand verification** du projet exigée. Revue souvent automatique. |
| Standard | Test et production | Illimité (les quotas par service restent) | Revue manuelle, environ 10 jours ouvrés. Réservé aux outils à fort volume. Le *permissible use* « Reporting » (Search / SearchStream seulement) ne s'applique qu'au niveau Standard. |

Pour une agence et un cron quotidien, viser **Explorer** pour le premier essai réel, **Basic** dès que le volume ou la vérification de marque est prête. Standard est le palier d'un SaaS multi-agences, pas d'une instance.

À faire par un humain, une fois par instance (ou une fois pour tout le monde le jour du SaaS) :

1. Projet Google Cloud au nom de l'agence.
2. Activer **Google Ads API**.
3. Écran de consentement OAuth. Scope exact : `https://www.googleapis.com/auth/adwords`. Type **Interne** seulement si toutes les personnes qui cliquent sont dans le même Workspace. Sinon **Externe** : Google exigera la vérification de l'app pour ce scope sensible, et la brand verification avant Basic.
4. Client OAuth **application Web**. URI de redirection : `https://<APP_URL>/admin/connections/google/callback` (même logique que Meta, origine = `APP_URL`).
5. Compte administrateur Google Ads (**MCC**, manager). Les comptes clients y sont liés. L'en-tête `login-customer-id` est l'id du MCC **sans tirets** quand on lit un compte enfant. Il est inutile si l'utilisateur OAuth a un accès direct au compte cible. Le manquer quand on passe par le MCC produit `USER_PERMISSION_DENIED`.
6. Demander Explorer, puis Basic si besoin. Ne pas attendre Standard pour livrer une agence.

Variables d'environnement de l'instance, sur le modèle de `META_APP_ID` / `META_APP_SECRET` :

- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`

Pas de customer id dans l'env : il est choisi dans l'UI et stocké par compte. Le MCC (`login-customer-id`) est une propriété de la **connexion** (l'agence a en général un MCC), éditable dans l'UI, pas une constante.

Références : [developer token / retrait](https://developers.google.com/google-ads/api/docs/api-policy/developer-token), [access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels), [auth REST](https://developers.google.com/google-ads/api/rest/auth), [structure d'appel](https://developers.google.com/google-ads/api/docs/concepts/call-structure). Vérifier la version d'API encore servie au moment du code (les exemples officiels citaient `v26` le 30 octobre 2026) et la mettre dans une variable `GOOGLE_ADS_API_VERSION` avec un défaut, comme `META_GRAPH_API_VERSION`.

## Conception proposée

### Abstraction plateforme

Généraliser la source plutôt que coller un second pipeline à côté.

- Étendre `InsightsSource` (ou un successeur dans `src/server/ads/`) avec un discriminant `platform: "meta" | "google" | "demo"`. Meta et la démo actuelle restent des implémentations.
- `createMetaSource` ne change pas de comportement.
- `createGoogleSource` parle à `googleads.googleapis.com`, SearchStream de préférence (un flux par fenêtre), en-tête `Authorization: Bearer`, et `login-customer-id` si la connexion a un MCC.
- `defaultSourceFactory` dans `sync-service.ts` choisit l'implémentation selon la connexion. Le verrou, les tranches, le budget et `sync_runs` restent communs.

La table `meta_connections` peut être généralisée (colonne `platform`, refresh token chiffré, `login_customer_id` nullable) **ou** une table `google_connections` peut coexister, avec une union au moment de lister les connexions. Préférer la généralisation si la migration des lignes `kind = meta` est un simple défaut. Garder `kind = demo` pour le synthétique. Ne pas casser les lignes Meta déjà chiffrées : le format `v1.iv.tag.ciphertext` reste valide.

### Faits

Étendre `insights_daily` plutôt que créer une seconde table de faits. Le grain devient **plateforme × compte × campagne × jour**. En pratique :

- ajouter `platform` sur `ad_accounts` avec défaut `'meta'` ;
- garder les lignes Meta telles quelles ;
- la clé primaire de `insights_daily` inclut déjà le compte interne (`ad_account_id`), donc deux plateformes ne se mélangent pas tant que les comptes sont des lignes distinctes ;
- les id de campagne Google et Meta sont des espaces différents. Les préfixer au stockage si un doute de collision existe dans les filtres de bilan (`campaignIds` est une liste d'id sans plateforme). Un id Google stocké tel quel (`123`) ne doit pas être confondu avec un id Meta. Préfixe stable recommandé : l'id externe déjà unique du compte + l'id campagne, ou un préfixe `g:` / `m:`. Les bilans et liens déjà enregistrés utilisent les id Meta nus : **ne pas réécrire les id Meta**.

`meta_account_id` est mal nommé pour Google. Ajouter `external_account_id` (copie de `meta_account_id` pour les lignes existantes) et un unique `(platform, external_account_id)`. Ne pas exiger le motif `act_\d+` pour Google. Les customer id Google font 10 chiffres, sans tirets.

Colonnes de mesures : les réutiliser.

| Mesure stockée | Meta (déjà) | Google Ads (GAQL) |
| --- | --- | --- |
| `spend` | `spend` (unité de devise) | `metrics.cost_micros / 1_000_000`. Pas d'arrondi à l'insertion. `double precision`, comme Meta. |
| `impressions` | `impressions` | `metrics.impressions` |
| `clicks` | `clicks` (tous les clics) | `metrics.clicks` |
| `link_clicks` | `inline_link_clicks` | **Pas d'équivalent.** Stocker NULL, ou ne pas alimenter la colonne, et traiter NULL comme « mesure absente » dans `metrics.ts` pour les ratios lien. Ne pas stocker 0. |
| `conversions` / `conversion_value` | somme des `action_type` choisis | somme des actions de conversion choisies |
| `raw_actions` / `raw_action_values` | actions Meta | volumes et valeurs par ressource `conversion_action` (id stable, pas seulement le nom affiché) pour que `recomputeConversions` marche sans re-synchro |

Requête de principe, à adapter à la version d'API et à vérifier dans la doc du moment :

```sql
SELECT
  campaign.id,
  campaign.name,
  campaign.advertising_channel_type,
  segments.date,
  metrics.cost_micros,
  metrics.impressions,
  metrics.clicks,
  metrics.conversions,
  metrics.conversions_value
FROM campaign
WHERE segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'
```

Et une seconde lecture, ou `segments.conversion_action` dans une requête dédiée, pour remplir `raw_actions` sans double-compter. **Attention :** ajouter `segments.conversion_action` à la requête des totaux duplique `cost_micros` et `clicks` une fois par action. Ne pas faire ça. Deux requêtes, ou une requête de totaux sans segment de conversion et une requête de conversions ventilée. Documenter le choix dans un commentaire court près de la requête.

`segments.date` est le jour du **fuseau du compte** (`customer.time_zone`). Le stocker comme Meta stocke le jour du compte. `customer.currency_code` → colonne `currency`. Pas de conversion.

Conversions Google : elles peuvent être fractionnaires (déjà le type `double precision`). Le choix d'admin reprend le modèle Meta : cases à cocher des actions observées, refus de sélectionner deux fois la même action, libellé humain, type technique en second. Ne pas réutiliser les groupes Meta (`purchase`, `lead`, etc.) pour des actions Google : ce sont d'autres identifiants. Un dashboard qui mélange un « Achat » Meta et une action Google homonyme doit passer par `describeConversionActions` : aujourd'hui un mélange d'événements produit un avertissement. Conserver cet avertissement si les noms ne désignent pas le même événement.

Clics lien : étendre `compute` des métriques `linkCtr`, `linkCpc`, `cvr` pour que l'absence de mesure (NULL sur toute la sélection) affiche « — », pas 0 %. Si la sélection ne contient que Meta, le comportement actuel (0 est un vrai zéro) reste. Si la sélection est mixte, le CVR du modèle de référence (conversions ÷ clics lien) n'est pas honnête pour la part Google : le widget combiné utilise les clics (`cvr` documenté à part, ou un CVR « clics tous » explicite). L'écrire dans `docs/METRICS.md`. Ne pas changer en silence la définition validée le 2026-10-20 pour les dashboards 100 % Meta.

Historique : viser les mêmes 760 jours que Meta, du plus récent au plus ancien, mêmes tranches de 31 jours, même reprise. Si la version d'API Google refuse une fenêtre, couper plus court et le tracer dans `sync_runs`, sans bloquer Meta dans la même invocation.

Erreurs : classer quota (`RESOURCE_EXHAUSTED`), auth (`UNAUTHENTICATED`), permission (`USER_PERMISSION_DENIED`), et le refus « projet non approuvé pour la production » (`CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` à partir des versions qui l'ont). Message admin en français, sans le corps brut s'il peut contenir un jeton. Un refresh token révoqué passe la connexion en état expiré, comme un token Meta.

OAuth :

- début : session admin requise, `state` aléatoire 256 bits, cookie HttpOnly signé, durée courte, lié à l'admin, sur le modèle de `PendingMetaOAuth` ;
- échange du code **en POST serveur** ;
- conserver le refresh token chiffré ; s'il est absent au renouvellement, le dire clairement (il faut redemander `access_type=offline` et `prompt=consent` la première fois) ;
- appeler `customers:listAccessibleCustomers` pour lister les comptes, puis résoudre le MCC saisi.

Démarrage sans identifiants Google : le bouton est masqué ou explique qu'il manque `GOOGLE_ADS_CLIENT_ID` et `GOOGLE_ADS_CLIENT_SECRET`, comme le bouton Facebook quand `META_APP_ID` manque. L'instance Meta seule continue de marcher.

## UX

- Nav : renommer « Connexions Meta » en « Connexions » dès que l'écran couvre les deux. Ne pas perdre le bouton Facebook ni l'option token système.
- Bloc « Se connecter avec Google » à côté de Facebook. Champ MCC (login-customer-id, chiffres seulement, affiché avec tirets si utile mais stocké sans). Reconnexion et suppression dans les mêmes règles (suppression seulement si aucun compte n'est rattaché).
- Fiche client : rattacher un compte Google **même si un compte Meta est déjà là**. Empêcher un second compte de la même plateforme seulement si le produit doit rester « un compte par plateforme » : le permettre pour Google si l'agence a plusieurs comptes du même client, et garder le refus multi-devises au niveau du dashboard. Un compte externe ne appartient qu'à un client (unique plateforme + id).
- Le sélecteur de création de client liste aussi les comptes Google déjà autorisés (`listAvailableAdAccounts`).
- Dashboards et modèles : filtre **Plateforme** — Toutes, Meta, Google — dans l'aperçu, le lien privé (si le viewer a le droit de filtrer) et les données du bilan. Le bilan fige aussi la plateforme si un filtre était actif, sinon il reste ambigu : stocker la liste de campagnes déjà préfixée suffit si les id ne se croisent pas.
- Vue combinée : mêmes cartes, un graphique, un tableau. Le tableau a une colonne Plateforme. La vue par plateforme réutilise les widgets.
- Modèle de référence Meta inchangé (CTR lien, CPC lien). Ajouter un modèle « Google » (CTR et CPC sur `clicks`, pas sur `linkClicks`) et un modèle « Meta + Google » dont les widgets de clics sont étiquetés « clics (tous) » et dont le CVR est documenté. Ne pas laisser le modèle 4 sections afficher un CTR lien à 0 % sur un compte Google.
- Couleurs de courbes, renommage, copie de tableaux, liens privés : les réutiliser tels quels.
- Bilans : le nom du bilan reste affiché sur l'aperçu admin (déjà le cas).
- Avertissements existants à conserver : historique incomplet, conversion non configurée, plusieurs devises, plusieurs fuseaux, synthétique masqué.

## Migration sans casser Meta

- Nouvelle migration Drizzle, numéro suivant `0003_bilans`. Défauts qui rendent les lignes actuelles valides sans script manuel.
- `platform = 'meta'` par défaut. `external_account_id` backfill depuis `meta_account_id`.
- `link_clicks` : les lignes Meta restent NOT NULL. Pour Google, NULL autorisé (assouplir la colonne) **ou** table inchangée et une colonne `link_clicks_known boolean`. Choisir l'option la plus petite qui empêche le faux 0 %. Les agrégats SQL doivent ignorer NULL et non les remplacer par 0 avant le ratio.
- Les dashboards JSON (`version: 1`) restent lisibles. Un champ optionnel `platformFilter` défaut `"all"` évite de réécrire les configs existantes. Zod avec défaut, comme `allowCustomize`.
- Les liens privés existants ouvrent le même dashboard, filtre plateforme « toutes », ce qui équivaut à « Meta » tant qu'il n'y a pas de compte Google.
- Le cron qui tombe sur une connexion Google sans refresh token la saute avec un `sync_runs` explicite et continue les comptes Meta. Une erreur Google ne doit pas empêcher le reste du budget d'importer Meta.
- `DEMO_MODE` : ne pas recréer les clients démo si des clients existent déjà (`seedDemo` retourne si `count > 0`). Ne pas changer les id fixes des dashboards démo Meta.

## Tests

Unitaires (Vitest, réponses HTTP simulées, aucun appel réseau) :

- micros → devise, y compris un reste non rond ;
- pas de double comptage si la réponse ventilée par conversion est mélangée par erreur à la réponse de totaux (le test fixe le contrat de la fonction qui sépare les deux) ;
- NULL / absent pour les clics lien, CTR lien affiché absent, CTR « tous » calculé ;
- devise et fuseau recopiés depuis `customer` ;
- refresh token jamais présent dans l'erreur redigée ;
- le client Google n'a pas de méthode mutate ;
- `recomputeConversions` sur des id d'actions Google ;
- planification de synchro inchangée pour un compte Meta ;
- un compte Google et un compte Meta du même client : le filtre plateforme et le refus multi-devises ;
- OAuth : state invalide refusé, code échangé en POST.

E2E (Playwright, démo synthétique, pas de vrais identifiants) :

- `DEMO_MODE` affiche un dashboard combiné ou un second client Google synthétique ;
- le filtre plateforme change les totaux ;
- un lien privé en navigation privée ne montre pas l'admin et respecte le filtre ;
- le parcours Meta existant (`e2e/mvp.spec.ts`, `e2e/self-service.spec.ts`) passe encore.

Pas d'appel à l'API Google réelle en CI. Un essai réel est une étape humaine après Explorer, consignée à part, sur le modèle de `docs/METRICS.md` (ce prompt ne prétend pas qu'elle est faite).

## Documentation à mettre à jour dans la dernière PR de la série

- `README.md` : Google n'est plus « à venir » ; commandes et variables ; le statut « testé sur un vrai compte » ne s'étend pas à Google tant qu'un essai réel n'est pas écrit.
- `docs/LANCEMENT.md` : étapes Google (projet Cloud, activation API, consentement, URI, MCC, Explorer/Basic, variables, bouton dans Connexions). Mêmes colonnes Qui / Durée / Prérequis / Automatisable. Le consentement OAuth et la brand verification sont **Non**.
- `docs/METRICS.md` : colonnes Google, micros, clics lien absents, écarts attendus (conversions modélisées selon le compte Google, délai de conversion, devise non convertie).
- `docs/DECISIONS.md` : lever « Google Ads pas avant » et « un seul compte » dans le sens défini plus haut.
- `docs/SECURITY.md` : refresh token, scope unique, pas de mutate.
- `.env.example` : les deux variables client, la version d'API, rien d'autre de secret.
- `AGENT_STATE.md` : seulement si la série est le travail en cours. Ne pas y inventer un résultat d'essai réel.

## Critères d'acceptation

1. Une instance sans variable Google se comporte comme aujourd'hui : Meta, démo, liens, cron.
2. Avec les variables, un admin relie Google depuis Connexions, voit les comptes accessibles, en rattache un à un client qui a déjà un compte Meta.
3. La synchro écrit des faits campagne × jour, dépense en unité de devise, et s'arrête proprement au budget de 200 s sans couper une tranche au milieu (même transaction que Meta : effacer la fenêtre puis insérer).
4. Changer les actions de conversion recalcule sans appel Google.
5. Un dashboard combiné EUR+EUR additionne. EUR+USD refuse l'addition et le dit.
6. Aucun CTR lien à 0 % dû à l'absence de clics lien Google.
7. Les widgets 100 % Meta du modèle de référence gardent les définitions du 2026-10-20.
8. Un lien privé ne révèle ni jeton, ni refresh token, ni id d'autres clients.
9. Le client Google ne peut pas appeler un endpoint mutate (test).
10. `npm test`, `npm run lint`, `npm run typecheck` passent. `npm run test:e2e` passe sur la démo synthétique.
11. Aucun customer id réel dans le dépôt.

## Découpage en PR successives

Chaque PR est déployable. Ne pas ouvrir la suivante sur une base rouge.

1. **Schéma et client lecture seule.** Migration, interface de source, client Google SearchStream, normalisation micros et conversions, tests unitaires avec JSON simulé. Pas d'UI. Meta inchangé.
2. **OAuth et connexions.** Variables, routes start/callback, chiffrement du refresh token, écran Connexions, MCC, liste des comptes accessibles. Toujours pas de synchro planifiée.
3. **Rattachement et synchro.** Fiche client (Meta et Google ensemble), `sync-service` et cron partagés, choix des actions de conversion, recomputation, page Synchronisations compréhensible.
4. **Dashboards.** Filtre plateforme, colonne du tableau, modèles Google et combiné, garde sur le CTR lien, bilans et liens privés qui restent cohérents. Tests de périmètre multi-clients.
5. **Démo et e2e.** Source synthétique Google, parcours Playwright, pas de régression Meta.
6. **Docs** listées plus haut, et seulement elles plus les commentaires que les PR précédentes n'ont pas déjà dû poser près des requêtes.

## Rappel de contexte produit

OpenMetrics est le reporting d'agence de Léo. Le client final voit un lien privé, pas l'admin. L'agence a déjà un usage Meta réel satisfaisant : un écart Google ne doit pas vider ni recalculer les faits Meta. Les PR #13 à #16 (lien recopiable après rechargement, bouton de bilan, tri, barre d'aperçu) ne sont pas dans `main`. Si tu touches les mêmes composants, rebaser sur `main` et laisser ces PR tranquilles.
