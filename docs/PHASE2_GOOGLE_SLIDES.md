# Phase 2 — Export Google Slides (analyse, non implémenté)

Référence : « Copie de LE ROCHER - CFA 2025 - Report final » (Google Slides, lu depuis le Drive de l'agence le 19/10/2026). La phase 2 ne démarre qu'après validation du MVP Meta Ads.

## 1. Cartographie du modèle et disponibilité des données

| # | Diapositive | Contenu observé | Source | Disponible aujourd'hui | Action |
| --- | --- | --- | --- | --- | --- |
| 1 | Couverture | « REPORT FINAL CFA 2025 », période | Saisie + période choisie | Oui (période) | Champs titre/période |
| 2 | Synthèse | Dons totaux (229), montant (48 719 €), rentabilité (6,86), don moyen, % des dons sur les 10 derniers jours | **Google + Meta cumulés** | Partie Meta seulement | Saisie manuelle des chiffres Google, ou intégration future |
| 3 | Performances des leviers | Comparatif Google vs Facebook, part de budget | Google + Meta | Ligne Meta seulement | Ligne Google saisie manuellement |
| 4 | Performances des audiences | Broad vs lookalike 180 j : volume, CTR, part de budget | Meta, **niveau ensemble de publicités** | Non (synchro niveau campagne) | Ajouter la synchro `level=adset` |
| 5 | Performances socio-démo | Âge (25-44 ans), genre, CTR par tranche | Meta, ventilations `age`, `gender` | Non | Ajouter la synchro ventilée âge × genre (13 mois max pour les uniques) |
| 6 | Performances des créatives | Visuels, conversions et CTR par créative | Meta, `level=ad` + vignettes `adcreatives` | Non | Synchro niveau publicité + vignettes |
| 7 | Éléments textuels | Top textes, top titre | Meta, ventilations `body_asset` / `title_asset` (créations dynamiques) ou texte de la publicité | Non, **disponibilité à vérifier** selon le format des publicités | Vérifier sur un compte réel |
| 8 | Performances des campagnes | Deux Performance Max (CTR 9,62 %, ROAS 9,59…) | **Google Ads** | Non (hors périmètre) | Saisie manuelle ; tableau Meta disponible en remplacement |
| 9 | Termes de recherche | Requêtes de marque / hors marque | **Google Ads uniquement** | Non | Saisie manuelle ou capture importée |
| 10 | Socio-démo (2) | Ventilation de l'ensemble des campagnes | Google + Meta | Partie Meta après #5 | Idem #5 + saisie Google |
| 11 | Recommandations | Recommandations stratégiques | Expertise de l'agence | — | Rédaction par l'admin ; suggestions factuelles seulement |

Conclusion : sur ce modèle, environ la moitié des contenus dépend de Google Ads ou d'une expertise humaine. Le générateur doit prévoir des **blocs de saisie manuelle** clairement identifiés.

## 2. Commentaires générés : règles

Le rapport de référence mélange des faits (« 53 % des dons sur les 10 derniers jours ») et des interprétations (« cohérente avec les comportements du secteur », « nous pouvons douter de la bonne implémentation du tracking »).

- Le générateur ne produit que des **constats chiffrés vérifiables** : totaux, parts, classements, évolutions vs période précédente, concentration temporelle, valeurs nulles ou atypiques.
- Chaque phrase générée référence la métrique et la période dont elle découle.
- Les causalités, comparaisons sectorielles et recommandations sont **proposées comme pistes à valider**, jamais comme des faits, et ne sont publiées qu'après relecture par l'admin.
- Signal utile repéré dans le modèle : conversions sans valeur ou valeurs atypiques → contrôle qualité du tracking (factuel).

## 3. Capacités vérifiées des API Google (documentation consultée le 19/10/2026)

| Besoin | API | Contraintes |
| --- | --- | --- |
| Copier le modèle dans le dossier du client | Drive `files.copy` (`parents`) | Accès en lecture au modèle et en écriture au dossier |
| Remplacer les KPI et textes | Slides `presentations.batchUpdate` → `replaceAllText` (`{{kpi.spend}}`…), limitable à certaines pages | — |
| Insérer des graphiques | `replaceAllShapesWithImage` (image PNG/JPEG/GIF, < 50 Mo, < 25 Mpx, **URL publiquement accessible** au moment de l'insertion, URL ≤ 2 Ko et conservée dans le fichier) ; ou `createSheetsChart` / `replaceAllShapesWithSheetsChart` depuis Google Sheets (scope `spreadsheets.readonly` minimum) | Pour les PNG : URL signée à usage unique et courte durée (quelques minutes), sans donnée sensible dans l'URL |
| Tableaux | Tableau du modèle pré-dimensionné + `replaceAllText` par cellule, `insertTableRows` si le nombre de lignes varie | — |
| Export PDF | Drive `files.export?mimeType=application/pdf` | **10 Mo maximum** par export ; au-delà, compresser les images |

Points d'architecture à décider au moment de la phase 2 :
- **Authentification Google** : OAuth du compte agence (scope `drive.file` + sélection du modèle via Google Picker) ou compte de service. Un compte de service ne peut en pratique pas posséder de fichiers dans un « Mon Drive » (pas de quota de stockage) : il faudrait un Drive partagé Google Workspace. À vérifier au démarrage de la phase 2 et à valider avec l'agence.
- Graphiques : rendu PNG côté serveur (recommandé : pas de feuilles intermédiaires) ou graphiques Sheets liés (rafraîchissables, mais créent des fichiers supplémentaires).

## 4. Parcours cible

1. Dashboard → « Générer un reporting » → client, période, modèle Slides.
2. Calcul des KPI via le même moteur que le dashboard (`src/lib/metrics.ts`).
3. Formulaire de relecture : blocs Meta pré-remplis, blocs Google à saisir, commentaires proposés éditables.
4. Validation → copie du modèle dans le dossier Drive du client → remplacements → export PDF enregistré à côté.
5. Historique des rapports générés (date, auteur, période, liens Drive).
