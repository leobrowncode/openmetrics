# Modèle de sécurité

## Liens privés (Viewer)

**Toute personne qui possède un lien valide peut consulter le dashboard associé.** Cette règle est affichée à l'administrateur sur l'écran de partage.

| Exigence | Mise en œuvre |
| --- | --- |
| Token non prédictible | 256 bits issus de `crypto.randomBytes`, encodés base64url |
| Pas de stockage en clair | Empreinte HMAC-SHA256 (`TOKEN_HASH_SECRET`) pour chaque accès. Une copie AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) permet à l'admin de réafficher l'URL. Un lien créé avant cette copie ne peut plus être reconstruit : il faut le renouveler. |
| Vérification serveur à chaque accès | Page et endpoint de données re-vérifient l'empreinte, la révocation et l'expiration en base à chaque requête |
| Révocation / expiration immédiates | Pas de cache ni de session autonome : le cookie contient le token, re-vérifié à chaque requête |
| Périmètre limité | Le lien donne accès à un seul dashboard ; les données sont filtrées par le client du dashboard ; les filtres de campagnes sont intersectés avec ce périmètre |
| Pas de fuite par URL / logs / Referer | Le token est dans le **fragment** (`/share#t=…`), jamais envoyé au serveur ; il est échangé en POST contre un cookie `HttpOnly`, `SameSite=Strict`, `Secure` (prod), limité au chemin `/share/<id>` et à 8 h ; l'URL est nettoyée ; `Referrer-Policy: no-referrer` |
| Pas de cache | `Cache-Control: private, no-store` sur les pages et données Viewer et Admin |
| Pas d'indexation | `X-Robots-Tag: noindex, nofollow, noarchive`, meta robots, `robots.txt` disallow |
| Protection contre les abus | Limitation de débit en base : 30 échanges de token / 10 min / IP, 240 requêtes de données / 10 min / lien |
| HTTPS | Imposé par Vercel ; en-tête HSTS |
| Aucun secret exposé | Les réponses Viewer ne contiennent que des agrégats ; testé (`e2e/mvp.spec.ts`) |

Limite connue : un destinataire peut transférer le lien d'origine à un tiers. C'est inhérent au modèle d'accès par lien ; les parades sont un lien par destinataire, une expiration et la révocation.

## Admin

- Mot de passe scrypt (N=16384), sessions aléatoires de 12 h stockées sous forme d'empreinte, cookie `HttpOnly`.
- Limitation : 8 tentatives / 15 min / e-mail, 20 / 15 min / IP.
- Chaque page et chaque action serveur appelle `requireAdmin()` ; les actions serveur Next.js vérifient l'origine (CSRF).
- Journal d'audit (`audit_log`) des actions sensibles (liens, connexions, administrateurs, suppression).
- Page Équipe : ajout d'administrateurs, retrait immédiat (sessions supprimées en cascade), impossible de se retirer soi-même ou de retirer le dernier admin. Changement de mot de passe : mot de passe actuel exigé, 8 essais / 15 min, autres sessions fermées.
- `ADMIN_EMAIL`/`ADMIN_PASSWORD` créent le compte correspondant s'il n'existe pas. Tant que ces variables restent définies, le mot de passe stocké pour cet e-mail est realigné sur `ADMIN_PASSWORD` (espaces autour ignorés) et les sessions de ce compte sont fermées. Les retirer après la première connexion, sinon le mot de passe choisi dans l'application est réécrasé. Les autres administrateurs ne sont pas touchés.

## Meta Ads

- Client Graph API **GET uniquement** (testé) ; chemin validé par expression régulière ; token passé en en-tête `Authorization`, jamais dans l'URL ; `appsecret_proof` si `META_APP_SECRET` est défini.
- Token chiffré AES-256-GCM (`TOKEN_ENCRYPTION_KEY`), jamais renvoyé au navigateur ; messages d'erreur expurgés.
- Avertissement si le token dispose de `ads_management` : recommandation d'un utilisateur système en `ads_read` seul.
- **« Se connecter avec Facebook »** (OAuth, `ads_read` seul) :
  - `state` aléatoire 256 bits, lié à l'admin qui lance la demande, conservé 10 min dans un cookie `HttpOnly` signé HMAC limité à `/admin/connections/meta` ; le retour est refusé si l'état ne correspond pas (CSRF / injection d'un compte Meta tiers).
  - Code échangé côté serveur en **POST** (le secret d'app n'apparaît dans aucune URL) ; `debug_token` vérifie que le token a été émis pour **cette** app ; token personnel converti en token longue durée, date d'expiration (y compris l'expiration d'accès aux données) stockée et signalée 14 jours avant.
  - Seule la classification de l'erreur est journalisée ; la page de retour n'affiche que des messages prédéfinis.

## Isolation entre clients

- `dashboardAccountScope()` restreint toute lecture aux comptes du client propriétaire du dashboard.
- Testé : identifiants de campagnes d'un autre client ignorés, configuration forgée pointant vers le compte d'un autre client sans effet, lien d'un dashboard inutilisable sur un autre.
