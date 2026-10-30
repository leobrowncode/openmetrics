# Lancement d'une instance OpenMetrics chez une nouvelle agence

Liste ordonnée des actions humaines, d'un dépôt vide jusqu'au premier dashboard partagé avec un client. Elle décrit le code de `main` au 30 octobre 2026 (`e41bb84`) et les règles Meta et Vercel relues le même jour. Les durées sont des ordres de grandeur, pas des mesures.

Le résumé technique plus court reste dans [`DEPLOYMENT.md`](DEPLOYMENT.md). Les secrets ne vont jamais dans Git.

Légende **Automatisable ?**

| Valeur | Sens |
| --- | --- |
| Oui maintenant | Une API ou une commande existe déjà (GitHub, Vercel, `openssl`, le cron de l'application). Personne n'a à recopier l'étape à la main si un script authentifié la lance. |
| Oui en mode SaaS | L'étape disparaît ou devient un réglage d'usine le jour où OpenMetrics est hébergé en multi-tenant par l'éditeur. Aujourd'hui, chaque agence la refait. |
| Non | Une personne doit le faire : identité, paiement, consentement, jugement métier, ou revue Meta / Google. |

## Avant de commencer

- Décision déjà écrite le 20 octobre 2026 : une instance par agence, sur **son** compte Vercel, **sa** base, **son** app Meta. Le dépôt `leobrowncode/openmetrics` reste la référence. Rien de spécifique à un client n'est codé en dur.
- Vercel documente que le plan **Hobby est réservé à un usage personnel non commercial** ([fair use](https://vercel.com/docs/limits/fair-use-guidelines)). Un reporting produit pour les clients payants d'une agence entre dans les exemples commerciaux (site réalisé contre rémunération). L'agence a accepté ce risque le 20 octobre 2026. Le plan Pro lève cette limite et ne demande pas de changement de code. Le cron du dépôt (`0 4 * * *`) reste valide sur les deux plans.
- Un projet Hobby **ne se connecte pas** à un dépôt appartenant à une organisation Git ([limites](https://vercel.com/docs/limits)). La copie doit vivre sur un compte GitHub **personnel**. Hobby n'inclut pas les fonctions de collaboration d'équipe Vercel.

## Étapes

### 1. Compte GitHub personnel de l'agence

| | |
| --- | --- |
| Qui | Agence |
| Durée | 10 minutes |
| Prérequis | Adresse e-mail de l'agence |
| Automatisable ? | Non — créer le compte et accepter les conditions GitHub est une action d'identité. |

Ne pas créer une organisation GitHub pour ce dépôt tant que l'hébergement est Hobby.

### 2. Copier le code

| | |
| --- | --- |
| Qui | Développeur, sur le compte GitHub de l'étape 1 |
| Durée | 10 minutes |
| Prérequis | Le dépôt de référence est lisible (`https://github.com/leobrowncode/openmetrics`) |
| Automatisable ? | Oui maintenant — l'API GitHub crée un fork ou un import. Le dépôt ne contient ni secret ni donnée client. |

| | Fork | Copie privée |
| --- | --- | --- |
| Création | Fork du dépôt de référence | *Import repository*, visibilité privée, sur le compte personnel |
| Mises à jour | *Sync fork*, puis Vercel redéploie | `git remote add upstream` une fois, puis `git pull upstream main && git push origin main` |

Le développeur peut être ajouté comme collaborateur du dépôt (API GitHub). Sur Hobby, c'est le propriétaire du projet Vercel qui doit pousser ou fusionner pour obtenir un déploiement : le client fusionne lui-même les pull requests.

### 3. Compte Vercel

| | |
| --- | --- |
| Qui | Agence (le développeur peut tenir le clavier) |
| Durée | 15 minutes |
| Prérequis | Le compte GitHub de l'étape 1 |
| Automatisable ? | Non — inscription, choix Hobby ou Pro, acceptation des conditions. Le paiement Pro est un acte humain. |

Importer ensuite le dépôt, branche `main`, framework Next.js détecté. Cette importation, elle, est **Oui maintenant** (API ou CLI Vercel) une fois le compte et le lien Git existants.

Contrôle à faire dans *Settings → Deployment Protection* : la **production** doit atteindre l'application sans page de connexion Vercel. Sinon le lien privé du client s'arrête avant OpenMetrics. Protéger les previews ne gêne pas le partage. Régler ce drapeau est **Oui maintenant** (API Vercel) ; décider qu'il est ouvert est le sens du produit.

### 4. Base Postgres

| | |
| --- | --- |
| Qui | Développeur |
| Durée | 15 minutes |
| Prérequis | Projet Vercel créé |
| Automatisable ? | Oui maintenant — l'intégration Marketplace (Neon) ou l'API du fournisseur peut créer la base et poser `DATABASE_URL`. Accepter les conditions du fournisseur, et payer si le plan gratuit ne suffit plus, est **Non**. |

Chemin prévu par le projet : projet Vercel → Storage / Marketplace → **Neon** (Postgres). L'intégration remplit `DATABASE_URL`. Toute autre Postgres accessible en TLS convient (Supabase, autre Neon, serveur). Coller alors l'URL dans les variables d'environnement.

Le code applique les migrations au premier démarrage (`src/server/db/client.ts`, verrou `727001`). Aucun `npm run db:migrate` n'est requis sur Vercel. Les fichiers sont `drizzle/0000_init.sql` à `drizzle/0003_bilans.sql`.

Sans `DATABASE_URL`, l'application démarre quand même sur PGlite. Sur Vercel ce fichier est éphémère : l'instance réelle doit avoir `DATABASE_URL` **avant** la première visite, sinon un premier hit peut amorcer une base vide qui ne sera pas celle de Neon.

Quota gratuit Neon : celui affiché par Neon au moment de la création. Ce dépôt ne garantit pas un plafond.

### 5. Secrets d'application

| | |
| --- | --- |
| Qui | Développeur, valeurs transmises à l'agence par un canal sûr |
| Durée | 5 minutes |
| Prérequis | `openssl` |
| Automatisable ? | Oui maintenant — trois commandes, puis l'API des variables Vercel. |

```bash
openssl rand -hex 32    # TOKEN_ENCRYPTION_KEY
openssl rand -hex 32    # TOKEN_HASH_SECRET
openssl rand -hex 24    # CRON_SECRET (au moins 16 caractères)
```

Les poser sur l'environnement **Production** (et Preview si les previews doivent parler à une base). Ne pas les committer.

| Variable | Effet si on la change plus tard |
| --- | --- |
| `TOKEN_ENCRYPTION_KEY` | Les tokens Meta déjà stockés deviennent illisibles. Il faut reconnecter Meta. |
| `TOKEN_HASH_SECRET` | Tous les liens privés et toutes les sessions admin cessent de marcher. |
| `CRON_SECRET` | Vercel envoie la nouvelle valeur. L'ancienne n'ouvre plus `/api/cron/sync`. |

### 6. Premier administrateur

| | |
| --- | --- |
| Qui | Agence (choisit l'e-mail et le mot de passe), développeur (les saisit dans Vercel) |
| Durée | 5 minutes |
| Prérequis | Mot de passe d'au moins 12 caractères, e-mail valide |
| Automatisable ? | Non — le mot de passe est un secret choisi par une personne. Le dépôt dans Vercel, lui, est Oui maintenant. |

`ADMIN_EMAIL` et `ADMIN_PASSWORD`. Tant que ces variables restent, **chaque démarrage réécrit le mot de passe de ce compte** et ferme ses sessions (`src/server/auth/admin.ts`). Les autres administrateurs ne sont pas touchés. Il faudra les retirer à l'étape 16.

`DEMO_MODE=false`. Si la première visite a lieu avec `DEMO_MODE=true` sur une base vide, les clients fictifs Association Horizon et Maison Lumen sont créés. Repasser à `false` ne les efface pas. Sur `main`, les masquer ne les efface pas non plus.

Ne pas définir `PGLITE_DATA_DIR` sur Vercel.

### 7. Domaine et `APP_URL`

| | |
| --- | --- |
| Qui | Agence pour l'achat et le DNS chez le registrar ; développeur pour le projet Vercel |
| Durée | 20 minutes, plus la propagation DNS (parfois quelques heures) |
| Prérequis | Un nom de domaine, ou acceptation de l'URL `*.vercel.app` |
| Automatisable ? | Achat et délégation DNS : **Non** (paiement, registrar). Rattacher un domaine déjà vérifié et écrire `APP_URL` : **Oui maintenant** (API Vercel). |

`APP_URL` est l'origine seule, sans chemin et sans slash final : `https://reporting.agence.fr`. Le code retire un slash final s'il est présent.

Cette URL sert aux liens privés et à l'URI OAuth. La poser avant l'app Meta évite d'enregistrer une URI de preview.

Une URL `*.vercel.app` suffit pour un essai. Il faut alors la figer dans `APP_URL` et dans Meta, puis tout mettre à jour si le domaine définitif change.

### 8. Premier déploiement

| | |
| --- | --- |
| Qui | Développeur |
| Durée | 10 minutes |
| Prérequis | Étapes 3 à 7 |
| Automatisable ? | Oui maintenant — un push sur `main` ou l'API Vercel déploie. Vérifier `https://<APP_URL>/login` (HTTP 200, pas la page de protection Vercel) se fait avec un client HTTP. |

Au premier hit, les tables sont créées et le compte `ADMIN_EMAIL` est inséré. Se connecter tout de suite n'est pas encore utile : l'app Meta peut attendre que la page **Connexions Meta** affiche l'URI de redirection exacte.

Variables Meta : les laisser vides pour ce premier déploiement. `META_GRAPH_API_VERSION` peut rester absente (`v24.0`).

### 9. Compte Meta for Developers et Business Portfolio

| | |
| --- | --- |
| Qui | Agence |
| Durée | 20 minutes si le Business Portfolio existe déjà, sinon plus |
| Prérequis | Un compte Facebook de l'agence qui administrera l'app |
| Automatisable ? | Non — compte personnel Meta et portefeuille entreprise. |

[developers.facebook.com](https://developers.facebook.com/) et [business.facebook.com](https://business.facebook.com/). Les comptes publicitaires des clients doivent être accessibles par ce portefeuille (partage partenaire ou propriété), avec au moins le droit de voir les performances.

### 10. Créer l'application Meta

| | |
| --- | --- |
| Qui | Agence ou développeur, dans le tableau de bord Meta |
| Durée | 20 minutes |
| Prérequis | Étape 9 |
| Automatisable ? | Non — le tableau de bord Meta et le rattachement au portefeuille. Ce dépôt n'appelle aucune API de création d'app. |

Si Meta propose un type d'app, choisir **Entreprise** (*Business*) et la rattacher au Business Portfolio de l'agence. Si Meta propose des cas d'usage à la place du type, choisir celui qui permet d'ajouter ensuite les deux produits ci-dessous. La doc d'autorisation Marketing API parle encore du type Business ([authorization](https://developers.facebook.com/docs/marketing-api/get-started/authorization/)).

Ajouter les produits :

1. **Marketing API**
2. **Facebook Login for Business** (connexion professionnelle)

### 11. URI de redirection OAuth

| | |
| --- | --- |
| Qui | Développeur |
| Durée | 10 minutes |
| Prérequis | Étape 8 (l'URI affichée par l'application) et étape 10 |
| Automatisable ? | Non — saisie dans *Facebook Login → Paramètres → URI de redirection OAuth valides*. |

Valeur exacte, caractère pour caractère :

```text
https://<hôte de APP_URL>/admin/connections/meta/callback
```

Elle est aussi affichée sur **Connexions Meta** (`metaRedirectUri` dans `src/server/meta/oauth-flow.ts`). Pas de slash final, pas d'URL de preview, schéma `https`.

Renseigner dans *Paramètres → Général* le domaine de l'app (l'hôte de `APP_URL`) et l'e-mail de contact.

Copier l'identifiant d'app et la clé secrète. Ils deviendront `META_APP_ID` et `META_APP_SECRET` à l'étape 15. La clé secrète ne se remet pas dans Git.

### 12. Configuration Facebook Login for Business (recommandée)

| | |
| --- | --- |
| Qui | Développeur |
| Durée | 15 minutes |
| Prérequis | Produit Facebook Login for Business |
| Automatisable ? | Non — création de la configuration dans le tableau de bord. |

*Facebook Login for Business → Configurations → Create configuration* ([documentation](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/)) :

- type de jeton : **System-user access token** (jeton d'utilisateur système d'intégration) ;
- permission : **`ads_read` seulement** ;
- copier le Configuration ID dans `META_LOGIN_CONFIG_ID`.

Sans cette variable, le code ouvre le dialogue classique avec `scope=ads_read`. Avec elle, le code envoie `config_id` et **n'envoie pas** `scope` : les permissions sont celles de la configuration. Une configuration qui demande aussi `ads_management` sera signalée dans l'admin, mais l'application ne sait de toute façon qu'émettre des GET.

Le jeton utilisateur système obtenu ainsi est celui que Meta émet pour un accès continu aux comptes. Le dialogue demande une connexion au portefeuille entreprise, pas seulement un profil personnel.

### 13. Rôles sur l'app

| | |
| --- | --- |
| Qui | Agence |
| Durée | 10 minutes |
| Prérequis | Liste des personnes qui cliqueront « Se connecter avec Facebook » |
| Automatisable ? | Non — ce sont des identités. |

*Rôles de l'app* : Administrateur, Développeur ou Testeur.

Toute app neuve est en **mode développement**. Dans ce mode, Meta n'accorde les permissions qu'aux personnes qui ont un rôle ([app modes](https://developers.facebook.com/docs/development/build-and-test/app-modes/)). Pour une agence dont seuls les collaborateurs cliquent, ce mode suffit **si** ces personnes ont le rôle et l'accès Business Manager aux comptes clients.

Le mode **Live** permet de demander une permission à quelqu'un qui n'a pas de rôle, et seulement si cette permission a passé l'App Review. Ce n'est pas requis pour le premier client interne.

### 14. Pages légales et passage éventuel en Live

| | |
| --- | --- |
| Qui | Agence (rédaction), développeur (URL hébergée quelque part) |
| Durée | 1 à 3 heures de rédaction ; plusieurs jours si un conseil relit |
| Prérequis | Un site ou une page que Meta peut ouvrir |
| Automatisable ? | Non — texte juridique et responsabilité de l'agence. |

OpenMetrics **n'a pas** de page politique de confidentialité, de CGU, ni de route de callback de suppression. Il faut les publier ailleurs.

D'après *Paramètres → Général* relu le 30 octobre 2026 ([basic settings](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/basic-settings/)), Meta marque comme nécessaires pour passer en Live : nom affiché, e-mail de contact, icône, catégorie, objet de l'app, URL des conditions d'utilisation. Le champ *Privacy Policy URL* existe. Le champ *User Data Deletion* est l'URL d'instructions (ou un callback) appelée quand une personne retire l'app de ses réglages Facebook. Prévoir au minimum une page qui dit comment écrire à l'agence pour faire effacer les données stockées dans cette instance.

La vérification d'entreprise **n'est pas** exigée par cette page pour passer en Live. La même page dit qu'elle est exigée pour accéder à des données que l'entreprise ne possède pas. Un compte publicitaire client entre dans cette zone : si Meta refuse la lecture, lancer [Business Verification](https://developers.facebook.com/docs/development/release/business-verification/) sur le portefeuille. Délai : celui de Meta (souvent plusieurs jours), pièces d'identité de l'entreprise. **Non** automatisable.

### 15. Variables Meta et redéploiement

| | |
| --- | --- |
| Qui | Développeur |
| Durée | 10 minutes |
| Prérequis | Étapes 11 et, si retenue, 12 |
| Automatisable ? | Oui maintenant — écriture des variables et redéploiement par l'API Vercel. Les valeurs viennent d'un humain qui les a copiées depuis Meta. |

| Variable | Contenu |
| --- | --- |
| `META_APP_ID` | Identifiant numérique de l'app |
| `META_APP_SECRET` | Clé secrète |
| `META_LOGIN_CONFIG_ID` | Optionnel, identifiant de la configuration de l'étape 12 |
| `META_GRAPH_API_VERSION` | Optionnel. Défaut du code : `v24.0`, expiration Meta le 18 février 2028. Version courante au 30 octobre 2026 : `v26.0` ([versions](https://developers.facebook.com/docs/graph-api/changelog/versions/)). Monter la variable avant l'expiration, sans changer le code. |

`META_APP_ID` doit matcher `^\d{5,25}$`.

### 16. Première connexion admin et mot de passe définitif

| | |
| --- | --- |
| Qui | Agence |
| Durée | 15 minutes |
| Prérequis | Étape 8 réussie |
| Automatisable ? | Non — la personne prouve qu'elle connaît le mot de passe. Retirer `ADMIN_PASSWORD` ensuite est Oui maintenant (API Vercel) et doit être fait, sinon le mot de passe choisi dans l'application est réécrit au prochain démarrage. |

1. Ouvrir `/login`, e-mail et mot de passe des variables.
2. **Équipe** : changer le mot de passe (l'actuel est exigé). Ajouter les autres administrateurs. On ne peut pas retirer le dernier, ni soi-même.
3. Supprimer `ADMIN_PASSWORD` des variables Vercel. On peut laisser `ADMIN_EMAIL` sans mot de passe : le réalignement ne se fait que si les deux sont définies. Redéployer pour que le retrait soit pris en compte.
4. Se reconnecter avec le mot de passe choisi dans l'application.

### 17. Autoriser Meta

Deux chemins. Un suffit.

#### 17.a OAuth (recommandé si l'étape 15 est faite)

| | |
| --- | --- |
| Qui | Agence — la personne qui a un rôle sur l'app (étape 13) et l'accès aux comptes clients |
| Durée | 5 minutes |
| Prérequis | Étapes 13 et 15, `TOKEN_ENCRYPTION_KEY` déjà posée |
| Automatisable ? | Non — consentement sur Facebook. Le code ne peut pas cliquer à la place de la personne. |

**Connexions Meta → Se connecter avec Facebook.** Accepter `ads_read`. Le retour attendu est « Connexion Meta enregistrée ». Annuler ne crée rien. Un refus de `ads_read` n'enregistre pas la connexion.

Le jeton utilisateur est échangé contre un jeton longue durée. Le code retient la plus proche des deux dates renvoyées par `debug_token` (expiration du jeton et expiration d'accès aux données) et affiche un avertissement à moins de 14 jours.

#### 17.b Token d'utilisateur système, sans dialogue

| | |
| --- | --- |
| Qui | Agence, dans le Business Manager |
| Durée | 20 minutes |
| Prérequis | Portefeuille entreprise, app créée, comptes clients assignables |
| Automatisable ? | Non — le Business Manager montre le token une fois ; une personne le copie dans l'admin. |

1. Paramètres du business → Utilisateurs → Utilisateurs système → créer un utilisateur.
2. Lui assigner les comptes publicitaires clients avec le seul droit de voir les performances (« Afficher les performances »).
3. Générer un token pour **cette** app, permission **`ads_read` seule**. Choisir une expiration « jamais » si Meta le propose : c'est le token que l'écran décrit comme sans expiration. S'il a une date, l'application la stocke.
4. **Connexions Meta → Option avancée** : nom + token. L'application interroge les permissions avant de chiffrer. Le token n'est plus réaffiché.

Le niveau **Limited** de la Marketing API (défaut) autorise 1 utilisateur système et 1 utilisateur système admin. **Full** en autorise 10 + 1 ([authorization](https://developers.facebook.com/docs/marketing-api/get-started/authorization/)).

### 18. Niveaux d'accès Meta, seulement si la lecture est refusée ou trop lente

| | |
| --- | --- |
| Qui | Agence |
| Durée | Le temps de revue Meta, après avoir accumulé les appels |
| Prérequis | L'app existe et a déjà appelé l'API |
| Automatisable ? | Non — App Review et vérification d'entreprise. |

Deux échelles distinctes, relues le 30 octobre 2026. Le dépôt ne dit pas laquelle a été utilisée pour le client déjà satisfait.

**Permission `ads_read` (standard ou avancé).** L'accès standard est accordé d'office aux apps Business. Meta écrit que l'accès standard suffit pour les comptes que vous possédez ou auxquels le propriétaire vous a donné accès, et que l'accès **avancé** est requis si l'app gère les comptes d'autres personnes (personnes sans rôle, une fois l'app en Live). Le demander : *App Review → Permissions and Features → ads_read → Request advanced access*. Business Verification est exigée pour l'accès avancé ([access levels](https://developers.facebook.com/docs/graph-api/overview/access-levels/)).

**Marketing API Access Tier (Limited ou Full).** Depuis le 4 mai 2026, « Standard » s'appelle **Limited** et « Advanced » s'appelle **Full**. Limited est le défaut : quotas serrés par compte, décrit par Meta comme destiné au développement, pas aux apps de production qui servent des annonceurs réels. Full se demande sur la même page de fonctionnalités. Conditions affichées : au moins 500 appels Marketing API réussis sur 15 jours, et moins de 15 % d'erreurs sur les 500 derniers appels. Pour une agence et un cron quotidien, Limited peut suffire au début ; s'il y a des erreurs de quota, demander Full. Ce n'est pas un changement de code.

Pour le premier client, ne pas bloquer le lancement sur Full ni sur l'accès avancé tant que l'OAuth de l'étape 17 a réussi et que la synchro lit le compte.

### 19. Créer le client et rattacher le compte

| | |
| --- | --- |
| Qui | Agence |
| Durée | 10 minutes |
| Prérequis | Connexion Meta active (étape 17) |
| Automatisable ? | Non — le choix du compte et du nom est un jugement. Il n'existe pas d'API publique d'onboarding. En SaaS, l'écran peut être self-service, le clic reste humain (voir plus bas). |

**Clients → Nouveau client.** Le sélecteur liste les comptes `act_…` déjà visibles et pas encore rattachés. Le nom est proposé à partir du compte et reste modifiable (2 à 120 caractères). Créer lance l'import en arrière-plan.

Un même `act_` ne peut pas être sur deux clients. La fiche ne montre « Ajouter un compte » que tant que ce client n'en a aucun.

### 20. Laisser l'import initial avancer

| | |
| --- | --- |
| Qui | Personne, sauf si un passage échoue |
| Durée | De quelques minutes à plusieurs jours |
| Prérequis | Compte rattaché, cron ou bouton |
| Automatisable ? | Oui maintenant — le bouton « Synchroniser » et le cron `0 4 * * *` reprennent seuls. Sur Hobby, l'heure n'est garantie qu'à 59 minutes près ([cron](https://vercel.com/docs/cron-jobs/usage-and-pricing)). |

L'import couvre 760 jours (environ 25 mois), du plus récent au plus ancien, par fenêtres de 31 jours. Aucune nouvelle fenêtre ne démarre après 200 secondes. Un passage « Historique en cours » est normal : le suivant reprend à `history_from`. Les 28 jours avant la dernière synchro réussie sont toujours rafraîchis (attribution).

Surveiller **Synchronisations**. Un token refusé passe la connexion en « Token expiré » ou « Permissions insuffisantes ». Le niveau Limited peut ralentir fortement : ce n'est pas un blocage du code.

Le dashboard avertit si la période demandée commence avant l'historique déjà stocké.

### 21. Choisir l'événement de conversion

| | |
| --- | --- |
| Qui | Agence |
| Durée | 10 minutes, après qu'au moins un passage a écrit des actions |
| Prérequis | Étape 20 commencée |
| Automatisable ? | Non — quel événement est « une conversion » pour ce client est un choix métier. Le recalcul, lui, est déjà dans l'application. |

Fiche client → *Conversions comptées*. Cocher un seul alias par événement (`purchase` et `offsite_conversion.fb_pixel_purchase` ensemble sont refusés). Enregistrer recalcule les conversions depuis `raw_actions`, sans rappeler Meta.

Tant que rien n'est coché, les conversions affichées restent à 0 et un avertissement l'indique. Le nom retenu (Achats, Prospects, etc.) remplace « Conversions » sur le dashboard. Le type technique reste en seconde ligne.

### 22. Créer le dashboard

| | |
| --- | --- |
| Qui | Agence |
| Durée | 10 minutes |
| Prérequis | Client et compte |
| Automatisable ? | Oui en mode SaaS — l'hôte peut créer le dashboard du modèle de référence dès que le compte est rattaché. Aujourd'hui il n'y a pas d'API : l'agence le fait dans l'écran. |

Fiche client → modèle **Référence agence - 4 sections** → créer. Onglets : Aperçu, Configuration, Bilans, Partage.

L'aperçu est ce que le client verra. Périodes : 7, 14, 30, 90 jours, ce mois, mois dernier, cette année. Les périodes relatives excluent aujourd'hui. La comparaison est la période précédente de même longueur. Le filtre de campagnes est optionnel.

« Générer un bilan » demande au moins une campagne cochée. Il fige les campagnes et les dates. Ce n'est pas obligatoire pour le premier lien.

Plusieurs devises sur un même dashboard : les montants ne sont pas additionnés. Avec un seul compte, le cas ne se présente pas.

### 23. Lien privé et envoi au client

| | |
| --- | --- |
| Qui | Agence |
| Durée | 10 minutes |
| Prérequis | Dashboard |
| Automatisable ? | Générer l'URL : **Oui en mode SaaS** (l'hôte peut le faire après le choix du dashboard). Aujourd'hui, pas d'API hors session admin. Transmettre le lien à la bonne personne : **Non**. |

*Partage → Nouveau lien privé* : libellé (souvent le nom du destinataire), expiration 7, 30, 90, 365 jours, jamais, ou une date. « Générer le lien ».

Copier tout de suite. L'URL a la forme `https://<APP_URL>/share#t=…`. Le jeton est dans le fragment : il n'est pas envoyé au serveur dans l'URL. Après un rechargement, la ligne ne peut plus reconstruire le lien (seule l'empreinte est stockée). Renouveler en crée un nouveau et révoque l'ancien. La PR #13, non fusionnée, changerait ce point.

Toute personne qui possède le lien voit le dashboard, sans compte. L'écran de partage le dit. Parade : un lien par destinataire, une expiration, la révocation (effective au prochain chargement).

Ouvrir le lien dans une fenêtre privée avant de l'envoyer. Vérifier que la production n'affiche pas la protection Vercel (étape 3).

Le premier dashboard partagé est livré ici.

## Maintenance

| Sujet | Qui | Quand | Automatisable ? |
| --- | --- | --- | --- |
| Jeton qui expire | Agence | L'admin affiche l'alerte sous 14 jours. Reconnecter Facebook ou passer à un token système. | Non — un nouveau consentement ou un nouveau token BM. Un e-mail d'alerte n'existe pas dans le code : l'avertissement est seulement dans l'écran. |
| Rotation `TOKEN_ENCRYPTION_KEY` | Développeur, puis agence qui reconnecte Meta | Incident ou politique interne | Oui maintenant pour poser la variable. Reconnecter Meta est Non. |
| Rotation `TOKEN_HASH_SECRET` | Développeur | Incident | Oui maintenant. Conséquence humaine : regénérer tous les liens et reconnecter les admins. |
| Rotation `CRON_SECRET` | Développeur | Incident | Oui maintenant. |
| Rotation `META_APP_SECRET` | Agence dans Meta, développeur dans Vercel | Incident | Non pour régénérer chez Meta. |
| Quotas Vercel Hobby | Agence | Si le site s'arrête en fin de mois | Non — attendre la fenêtre ou passer en Pro (paiement). Repères publiés par Vercel : transfert rapide jusqu'à 100 Go, CPU actif jusqu'à 4 h, mémoire provisionnée jusqu'à 360 Go-heures, jusqu'à 1 million d'invocations, 100 déploiements par jour, fonctions 300 s max, cron une fois par jour ([Hobby](https://vercel.com/docs/plans/hobby), [fair use](https://vercel.com/docs/limits/fair-use-guidelines)). |
| Quotas Meta Limited | Agence | Erreurs de débit dans Synchronisations | Non — demande Full (étape 18). |
| Version Graph | Développeur | Avant le 18 février 2028 pour `v24.0` | Oui maintenant — changer `META_GRAPH_API_VERSION` et redéployer, après un essai de synchro. |
| Mises à jour du code | Agence fusionne, développeur ouvre la PR | Quand `main` de la référence avance | Oui maintenant pour ouvrir la PR (git). La fusion par le propriétaire du compte Hobby est le geste qui déploie. |
| Effacement d'un client | Agence | Sur demande | Non — taper `SUPPRIMER` sur la fiche. Pas de callback Meta automatique. |
| Sauvegarde de la base | Agence ou développeur | Selon le fournisseur Postgres | Oui maintenant si le fournisseur a une API de backup. Ce dépôt n'en lance pas. |

## Autre hébergeur que Vercel

Node.js 20 ou plus, HTTPS, Postgres :

```bash
npm ci && npm run build && npm start
```

Mêmes variables. Une tâche quotidienne :

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://<APP_URL>/api/cron/sync"
```

Le plafond de 200 s par passage reste dans le code même si l'hébergeur autorise plus longtemps. Le monter serait un changement de code, pas une variable.

## Vers un SaaS

Aujourd'hui chaque agence refait les étapes 1 à 15 : compte GitHub, copie du dépôt, compte Vercel, base, secrets, domaine, app Meta, rôles, vérification d'entreprise éventuelle, App Review éventuelle.

Si l'éditeur héberge **une** instance multi-tenant (une base, une app Meta, un déploiement) :

**Disparaissent pour l'agence cliente**

- Compte GitHub, fork, fusions de mises à jour (étapes 1, 2, maintenance code).
- Compte Vercel, choix Hobby/Pro, Neon, secrets de chiffrement, cron, domaine technique (étapes 3 à 8 et 15). L'éditeur les fait une fois.
- Création de l'app Meta, URI OAuth, configuration Login for Business, rôles de testeurs, Business Verification, accès avancé `ads_read`, passage Limited → Full (étapes 10 à 14 et 18). Une seule app vérifiée, au nom de l'éditeur.

**Restent, côté client de l'agence**

- Créer son compte dans le SaaS (identité, mot de passe ou SSO).
- Cliquer « Se connecter avec Facebook » et accepter `ads_read`. Ce consentement n'est pas contournable : c'est le client (ou l'agence mandatée) qui autorise la lecture de ses comptes.
- Choisir les comptes publicitaires à rattacher et l'événement de conversion.
- Relire le dashboard et décider à qui envoyer le lien privé.

L'agence peut faire le clic Facebook à la place du client final si elle a déjà les comptes dans son Business Manager. Le geste OAuth reste une personne devant l'écran de Meta.

**Prérequis côté éditeur, avant d'ouvrir le service**

- App Meta en Live, **accès avancé** sur `ads_read` (les utilisateurs du SaaS n'auront pas un rôle sur l'app), App Review avec parcours filmé : login, accord, affichage de statistiques. Doc : [authorization](https://developers.facebook.com/docs/marketing-api/get-started/authorization/) et [permissions](https://developers.facebook.com/docs/permissions/).
- **Business Verification** du portefeuille de l'éditeur. Sans elle, Meta refuse l'accès avancé et la lecture de données que l'éditeur ne possède pas.
- Marketing API Access Tier **Full** dès que le volume dépasse le palier Limited (500 appels réussis / 15 jours, taux d'erreur < 15 % sur 500 appels, puis la demande).
- Schéma multi-tenant : aujourd'hui l'isolation est « une base = une agence ». Un SaaS doit ajouter un locataire au-dessus de `clients`, isoler sessions, liens, connexions et cron, et empêcher qu'une agence lise la connexion Meta d'une autre. Ce n'est pas dans le schéma actuel.
- Facturation (les liens privés ne paient personne aujourd'hui).
- CGU, politique de confidentialité, registre des traitements, base légale et DPA pour des données publicitaires de clients finaux (RGPD). L'application n'a aucune de ces pages.
- Hébergement sur un plan qui autorise l'usage commercial (Vercel Pro ou équivalent), avec une durée de fonction et un cron adaptés au nombre de comptes. Le budget de 200 s et un seul passage quotidien ne tiendront pas pour des dizaines d'agences dans la même invocation.
- Une politique de rétention et une vraie procédure d'effacement (le callback Meta n'existe pas).

Le prompt d'ajout Google Ads (`PROMPT_GOOGLE_ADS.md`) reste valable en instance par agence. En SaaS, le projet Google Cloud et l'écran de consentement deviennent aussi uniques, avec vérification de l'app Google et, si le volume l'exige, l'accès Standard.

## Sources relues le 30 octobre 2026

- Meta, autorisation Marketing API : https://developers.facebook.com/docs/marketing-api/get-started/authorization/
- Meta, niveaux d'accès standard / avancé : https://developers.facebook.com/docs/graph-api/overview/access-levels/
- Meta, modes d'app : https://developers.facebook.com/docs/development/build-and-test/app-modes/
- Meta, paramètres de base (Live, suppression) : https://developers.facebook.com/docs/development/create-an-app/app-dashboard/basic-settings/
- Meta, Facebook Login for Business : https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/
- Meta, versions Graph (v24.0 expire le 18 février 2028, v26.0 publiée le 29 juillet 2026) : https://developers.facebook.com/docs/graph-api/changelog/versions/
- Annonce Meta du 4 mai 2026 (Limited / Full, seuil 500 appels) : https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/
- Vercel Hobby : https://vercel.com/docs/plans/hobby
- Vercel, limites et dépôts d'organisation : https://vercel.com/docs/limits
- Vercel, fair use commercial : https://vercel.com/docs/limits/fair-use-guidelines
- Vercel, cron : https://vercel.com/docs/cron-jobs/usage-and-pricing
- Vercel, durée des fonctions (Hobby 300 s) : https://vercel.com/docs/functions/limitations
