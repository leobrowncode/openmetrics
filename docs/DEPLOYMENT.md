# Installation chez le client (hébergement autonome)

La liste ordonnée des actions humaines, les niveaux d'accès Meta et le passage vers un SaaS sont dans [`LANCEMENT.md`](LANCEMENT.md) (relu le 30 octobre 2026). Cette page reste le résumé technique.

Objectif : l'agence possède **sa propre instance**. Elle détient le compte d'hébergement, la base de données, l'app Meta et toutes les données, et peut se connecter, ajouter des collaborateurs et connecter Meta **sans intervention du développeur**.

> Les « secrets Cursor » ne concernent que l'environnement de développement de l'agent (tests contre un vrai compte Meta). Ils ne sont jamais utilisés par l'instance du client. En production, tous les secrets sont saisis par le client dans **son** hébergement.

## Ce que le client possède

| Élément | Où | Coût |
| --- | --- | --- |
| Code source | Copie du dépôt de référence sur le compte GitHub **personnel** du client (voir étape 0) | Gratuit |
| Hébergement | Projet Vercel **Hobby** du client (ou tout hébergeur Node.js) | Gratuit |
| Base de données | Postgres (Neon via Vercel Marketplace, Supabase, ou autre) | Offre gratuite possible |
| App Meta | developers.facebook.com, rattachée au Business Manager de l'agence | Gratuit |
| Accès admin | Page **Équipe** de l'application | — |

## 0. Copier le code

Le dépôt de référence (`leobrowncode/openmetrics`) reste au développeur, qui peut le réutiliser pour d'autres clients. Le client travaille sur **sa copie**, sur son compte GitHub **personnel** : un projet Vercel Hobby ne se relie pas à un dépôt appartenant à une organisation Git ([limites](https://vercel.com/docs/limits), relu le 30 octobre 2026). Un dépôt public ou privé sur un compte personnel convient.

| | Fork (recommandé) | Copie privée |
| --- | --- | --- |
| Création | GitHub → dépôt de référence → **Fork** | GitHub → **Import repository** → URL du dépôt de référence → *Private* |
| Visibilité | Publique (comme le dépôt de référence) | Privée |
| Mises à jour | Bouton **Sync fork** sur GitHub → Vercel redéploie seul | Commandes `git` (ci-dessous) ou PR du développeur |

Le code ne contient **aucun secret ni aucune donnée client** (tout est dans les variables Vercel et la base), un fork public est donc acceptable. Ne jamais committer de fichier `.env`.

Mise à jour d'une copie privée :

```bash
git remote add upstream https://github.com/leobrowncode/openmetrics.git   # une seule fois
git pull upstream main && git push origin main
```

Intervention du développeur sur la copie du client : le client l'ajoute en collaborateur, le développeur ouvre une **pull request**, et **le client la fusionne lui-même**. Sur Hobby, seuls les commits du propriétaire du compte Vercel déclenchent un déploiement : une fusion faite par le client est toujours déployée.

## 1. Base de données

Vercel → projet → **Storage** → ajouter **Neon** (Postgres). L'intégration crée `DATABASE_URL` automatiquement.
Les tables sont créées **automatiquement au premier démarrage** : aucune commande à lancer.

## 2. Variables d'environnement

Vercel → projet → **Settings → Environment Variables** (environnement *Production*) :

| Variable | Valeur | Remarque |
| --- | --- | --- |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` | Chiffre les tokens Meta et la copie des liens privés. Si elle est perdue ou changée, il faut reconnecter Meta, et les liens déjà créés restent valides mais ne s'affichent plus : il faut les renouveler. |
| `TOKEN_HASH_SECRET` | `openssl rand -hex 32` | Empreintes des liens privés et sessions. La changer invalide tous les liens et déconnecte tout le monde. |
| `CRON_SECRET` | `openssl rand -hex 24` | Protège la synchronisation automatique (Vercel l'envoie seul). |
| `APP_URL` | `https://reporting.agence.fr` | Adresse publique ; sert aux liens privés et au retour Facebook. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | e-mail du responsable, mot de passe ≥ 12 caractères | Créent ce compte, puis **remplacent son mot de passe** à chaque démarrage tant qu'elles restent définies (les sessions de ce compte sont fermées). À supprimer après la première connexion, sinon un mot de passe choisi dans l'application est réécrasé. |
| `META_APP_ID` / `META_APP_SECRET` | depuis l'app Meta (étape 4) | Activent « Se connecter avec Facebook ». |
| `META_LOGIN_CONFIG_ID` | optionnel | Configuration *Facebook Login for Business* (étape 4). |
| `DEMO_MODE` | `false` | Ne jamais activer sur l'instance réelle. |

Aucune de ces valeurs n'est envoyée au navigateur.

## 3. Premier démarrage

1. Déployer (Vercel redéploie ensuite à chaque modification fusionnée sur la branche principale).
2. Se connecter avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. **Équipe** → changer le mot de passe, ajouter les collaborateurs.
4. Supprimer `ADMIN_PASSWORD` des variables Vercel.

## 4. App Meta (une seule fois)

1. [developers.facebook.com](https://developers.facebook.com/apps) → **Créer une app** → type **Entreprise**, rattachée au Business Manager de l'agence.
2. Ajouter les produits **Facebook Login for Business** et **Marketing API**.
3. *Facebook Login → Paramètres* → **URI de redirection OAuth valides** : `https://<APP_URL>/admin/connections/meta/callback` (affichée telle quelle sur la page **Connexions Meta** de l'application).
4. *Paramètres → Général* : copier l'**ID** et la **clé secrète** dans `META_APP_ID` / `META_APP_SECRET`, puis redéployer.
5. Optionnel (recommandé) : *Facebook Login for Business → Configurations* → créer une configuration de type **utilisateur système**, permission **`ads_read` uniquement**, et copier son ID dans `META_LOGIN_CONFIG_ID`. Le token obtenu n'expire pas et ne dépend pas d'un collaborateur.

Ensuite, dans l'application : **Connexions Meta → Se connecter avec Facebook**. Seule la permission `ads_read` (lecture des statistiques) est demandée. Aucune fonction de l'application ne peut modifier une campagne ou un budget.

Règles Meta confirmées dans la doc officielle le 30 octobre 2026 (détail et ordre des clics dans [`LANCEMENT.md`](LANCEMENT.md)) :

- En **mode développement**, l'app ne peut demander des permissions qu'aux personnes qui ont un rôle (administrateur, développeur, testeur). Pour une agence dont seuls ces collaborateurs cliquent, cela suffit.
- Deux échelles différentes : la permission `ads_read` (accès standard d'office, accès avancé via App Review si des personnes sans rôle doivent autoriser l'app) et le **Marketing API Access Tier**. Depuis le 4 mai 2026, le palier bas s'appelle *Limited* et le palier haut *Full*. *Limited* est le défaut. *Full* se demande dans App Review une fois 500 appels réussis atteints sur 15 jours et moins de 15 % d'erreurs sur les 500 derniers appels.
- La vérification d'entreprise n'est pas exigée pour passer l'app en Live, mais Meta l'exige pour lire des données que l'entreprise ne possède pas.

Alternative sans dialogue OAuth : générer un token d'utilisateur système (`ads_read`) dans le Business Manager et le coller dans **Connexions Meta → Option avancée**.

## 5. Ce que l'agence gère seule ensuite

- Administrateurs (ajout, retrait immédiat, mot de passe).
- Connexions Meta (connexion, reconnexion avant expiration, remplacement de token).
- Clients, comptes publicitaires, événements de conversion, dashboards, modèles.
- Liens privés (création, expiration, révocation, renouvellement).
- Supervision des synchronisations.

## Autre hébergeur que Vercel

Toute plateforme Node.js ≥ 20 avec Postgres convient (Render, Railway, Scalingo, serveur privé…) :

```bash
npm ci && npm run build && npm start
```

avec les mêmes variables, HTTPS obligatoire, et une tâche planifiée quotidienne :

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<APP_URL>/api/cron/sync
```

## Vercel Hobby : limites et choix retenus

Choix validé par l'agence (2026-10-20) : **Vercel Hobby**. Les conditions de Vercel réservent Hobby à un usage non commercial ; l'agence a accepté ce point. Passer en Pro plus tard ne demande aucune modification du code.

| Limite Hobby | Effet sur l'application |
| --- | --- |
| Fonctions : 300 s maximum | Aucune synchronisation ne lance de nouvelle tranche après 200 s. L'import initial (25 mois) reprend où il s'est arrêté : au passage quotidien suivant, ou immédiatement via « Synchroniser ». Les données récentes sont importées en premier. |
| Cron : une fois par jour, à l'heure près | Synchronisation quotidienne vers 04:00 UTC ; le bouton « Synchroniser » reste disponible à tout moment. |
| Pas de dépôt d'une organisation Git ; pas de collaboration d'équipe | Copie sur un compte GitHub personnel ; le client fusionne lui-même les mises à jour. |

**Neon** (base) : offre gratuite suffisante pour démarrer. **Meta** : gratuit.
