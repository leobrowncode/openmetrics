# Installation chez le client (hébergement autonome)

Objectif : l'agence possède **sa propre instance**. Elle détient le compte d'hébergement, la base de données, l'app Meta et toutes les données, et peut se connecter, ajouter des collaborateurs et connecter Meta **sans intervention du développeur**.

> Les « secrets Cursor » ne concernent que l'environnement de développement de l'agent (tests contre un vrai compte Meta). Ils ne sont jamais utilisés par l'instance du client. En production, tous les secrets sont saisis par le client dans **son** hébergement.

## Ce que le client possède

| Élément | Où | Coût |
| --- | --- | --- |
| Code source | Dépôt GitHub transféré à l'organisation du client (ou fork) | Gratuit |
| Hébergement | Projet Vercel du client (ou tout hébergeur Node.js) | Voir « Coûts » |
| Base de données | Postgres (Neon via Vercel Marketplace, Supabase, ou autre) | Offre gratuite possible |
| App Meta | developers.facebook.com, rattachée au Business Manager de l'agence | Gratuit |
| Accès admin | Page **Équipe** de l'application | — |

## 1. Base de données

Vercel → projet → **Storage** → ajouter **Neon** (Postgres). L'intégration crée `DATABASE_URL` automatiquement.
Les tables sont créées **automatiquement au premier démarrage** : aucune commande à lancer.

## 2. Variables d'environnement

Vercel → projet → **Settings → Environment Variables** (environnement *Production*) :

| Variable | Valeur | Remarque |
| --- | --- | --- |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` | Chiffre les tokens Meta. Si elle est perdue ou changée, il faut reconnecter Meta. |
| `TOKEN_HASH_SECRET` | `openssl rand -hex 32` | Empreintes des liens privés et sessions. La changer invalide tous les liens et déconnecte tout le monde. |
| `CRON_SECRET` | `openssl rand -hex 24` | Protège la synchronisation automatique (Vercel l'envoie seul). |
| `APP_URL` | `https://reporting.agence.fr` | Adresse publique ; sert aux liens privés et au retour Facebook. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | e-mail du responsable, mot de passe ≥ 12 caractères | Ne servent qu'à créer le **premier** compte. À supprimer après la première connexion. |
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

Points à confirmer lors du premier essai réel (non vérifiables sans compte Meta) :

- Tant que l'app reste en **mode développement**, seules les personnes ayant un rôle sur l'app peuvent l'autoriser : ajouter les collaborateurs de l'agence dans *Rôles de l'app* suffit pour un usage interne.
- Depuis mai 2026, Meta nomme les niveaux d'accès Marketing API *Limited* / *Full*. Le niveau *Limited* a des quotas plus faibles ; le passage en *Full* se demande via *App Review* une fois le volume d'appels atteint.

Alternative sans app Meta : générer un token d'utilisateur système (`ads_read`) dans le Business Manager et le coller dans **Connexions Meta → Option avancée**.

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

## Coûts (à valider par l'agence avant toute activation)

- **Vercel** : l'offre Hobby (gratuite) est réservée à un usage personnel non commercial selon les conditions de Vercel ; un usage par une agence relève normalement de l'offre **Pro** (payante, par membre). Les limites de durée des fonctions et de cron dépendent de l'offre.
- **Neon** : offre gratuite suffisante pour démarrer (quelques comptes publicitaires, données campagne × jour).
- **Meta** : gratuit.
