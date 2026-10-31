# Critères de conformité — MVP Meta Ads

Légende : ✅ fait et vérifié · 🧪 fait, vérifié uniquement avec données simulées · ⏳ à faire · ❓ décision attendue

Dernière mise à jour : 30/10/2026.

Un client réel a utilisé l'outil sur ses données Meta et s'est dit satisfait de cette version (fait rapporté, pas un relevé dans le dépôt). La comparaison chiffrée avec Ads Manager reste à consigner. Les PR #14 à #16 sont ouvertes et ne comptent pas comme livrées. La copie chiffrée du lien privé est dans cette branche.

## Sécurité et confidentialité

| Critère | Statut | Preuve |
| --- | --- | --- |
| Token de lien aléatoire 256 bits, empreinte HMAC et copie chiffrée | ✅ | `tests/share-links.test.ts` |
| Vérification serveur à chaque accès, révocation et expiration immédiates | ✅ | tests d'intégration + `e2e/mvp.spec.ts` |
| Token absent des URL envoyées au serveur, des logs et du Referer | ✅ | e2e (aucune requête ne contient le token) |
| Pages Viewer non indexées, non mises en cache | ✅ | e2e (en-têtes) |
| Limitation de débit (échange de lien, données, connexion admin) | ✅ | `tests/security.test.ts` |
| Viewer sans accès à l'admin ni aux autres dashboards | ✅ | e2e |
| Isolation stricte entre clients (y compris filtres forgés) | ✅ | `tests/share-links.test.ts` |
| Tokens Meta chiffrés, jamais exposés au navigateur | ✅ | `tests/security.test.ts`, revue de code |
| Client Meta en lecture seule (aucune méthode d'écriture) | ✅ | `tests/graph-client.test.ts` |
| Modèle d'accès par lien expliqué à l'admin | ✅ | écran Partage |
| HTTPS / cookies `Secure` | ⏳ | Effectif uniquement une fois déployé sur Vercel |

## Exactitude des métriques

| Critère | Statut | Preuve |
| --- | --- | --- |
| Ratios calculés après agrégation | ✅ | `tests/metrics.test.ts` |
| Devise et fuseau du compte respectés, multi-devises refusé | ✅ | tests + écran |
| Attribution du compte (comme Ads Manager) | 🧪 | aucune fenêtre forcée (`tests/graph-client.test.ts`) |
| Double comptage des alias de conversion empêché | ✅ | tests + e2e |
| **Comparaison avec Ads Manager sur un vrai compte** | ⏳ | Usage réel rapporté le 30/10/2026, relevé chiffré non consigné (`docs/METRICS.md`) |
| Définition des clics retenue (tous vs lien) | ✅ | Validée le 2026-10-20 : clics sur un lien |
| Définition de la conversion par client | ✅ | Validée le 2026-10-20 : configurée par l'admin, compte par compte |

## Fonctionnalités MVP

| Critère | Statut |
| --- | --- |
| Connexion Meta par token (vérification des permissions) | 🧪 (tests avec réponses simulées). Un compte client réel a été lu ; le mode de connexion n'est pas consigné. |
| Connexion Meta « Se connecter avec Facebook » (OAuth, `ads_read`) | 🧪 (redirection, CSRF, annulation testés en e2e ; échange de code testé avec réponses simulées). Un compte client réel a été lu ; le dépôt ne dit pas si c'était cet OAuth ou un token système. |
| Gestion des administrateurs (Équipe) | ✅ (tests + e2e) |
| Installation autonome : migrations automatiques au démarrage | ✅ (vérifié avec un vrai Postgres 16 en mode production) |
| Clients, comptes publicitaires, rattachement exclusif | ✅ |
| Synchronisation planifiée, idempotente, tracée, verrouillée | ✅ (cron non testé sur Vercel) |
| Synchronisation compatible Vercel Hobby (≤ 300 s) : import reprenable, données récentes d'abord, exécutions interrompues clôturées | ✅ (`tests/sync.test.ts` ; mise à jour de schéma vérifiée sur Postgres 16) |
| Avertissement si la période ou la comparaison dépasse l'historique importé | ✅ (`tests/sync.test.ts`) |
| Dashboards multiples par client, à partir de modèles | ✅ |
| Modèle de référence 4 sections (Investissements, Impressions et clics, CTR et CPC, Conversions) | ✅ (organisation déduite du brief ; capture Looker non reçue) |
| Widgets configurables (KPI, graphique, tableau), sections, ordre | ✅ |
| Duplication de dashboard, enregistrement en modèle | ✅ |
| Sélecteur de période, comparaison période précédente, filtre campagnes | ✅ |
| Liens : création, révocation, renouvellement, expiration | ✅ |
| Supervision des synchronisations et des erreurs | ✅ |
| Ventilations âge / genre | ⏳ |
| Niveau ensemble de publicités (audiences) et publicités (créatives) | ⏳ |
| Instance hébergée chez le client (Vercel ou autre) | 🧪 (un usage client réel est rapporté ; le dépôt ne décrit pas l'hébergeur de cette instance. Guide : `docs/LANCEMENT.md`) |
| Responsive | 🧪 (vérifié en 1280-1440 px ; mobile à vérifier) |

## Hors MVP

- Phase 2 Google Slides : analysée (`docs/PHASE2_GOOGLE_SLIDES.md`), non implémentée.
- Google Ads : pas de code. Cahier des charges pour un agent : `docs/PROMPT_GOOGLE_ADS.md`.
