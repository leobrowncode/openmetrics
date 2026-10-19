# Définitions des KPI Meta Ads

Source de vérité : `src/lib/metrics.ts`. Tous les ratios sont calculés **après agrégation** (somme des numérateurs ÷ somme des dénominateurs), sur la période, la sélection de campagnes et le pas de temps du graphique. Un dénominateur nul affiche « — » (jamais 0 ni ∞).

| KPI | Formule | Colonne Ads Manager | Champ API |
| --- | --- | --- | --- |
| Montant dépensé | Σ spend | Montant dépensé | `spend` |
| Impressions | Σ impressions | Impressions | `impressions` |
| Clics (tous) | Σ clicks | Clics (tous) | `clicks` |
| Clics sur un lien | Σ inline_link_clicks | Clics sur un lien | `inline_link_clicks` |
| CTR (tous) | clics ÷ impressions | CTR (tous) | — |
| CTR lien | clics lien ÷ impressions | CTR (taux de clics sur le lien) | — |
| CPC (tous) | dépense ÷ clics | CPC (tous) | — |
| CPC lien | dépense ÷ clics lien | CPC (coût par clic sur un lien) | — |
| CPM | dépense ÷ impressions × 1000 | CPM | — |
| Conversions | Σ actions des types configurés | Résultats / colonne de l'événement | `actions` |
| Valeur de conversion | Σ action_values des types configurés | Valeur de conversion | `action_values` |
| CVR | conversions ÷ clics lien | (non natif) | — |
| Coût par conversion | dépense ÷ conversions | Coût par résultat | — |
| ROAS | valeur ÷ dépense | ROAS des achats | — |

**Devise** : celle du compte publicitaire, jamais convertie. Un dashboard mélangeant plusieurs devises est refusé.
**Fuseau** : les jours sont ceux du fuseau du compte (comme Ads Manager). Les périodes relatives excluent aujourd'hui (« 7 derniers jours » = J-7 à J-1).
**Comparaison** : période précédente de même durée, immédiatement antérieure.

## Écarts attendus avec Ads Manager

- Les conversions des 28 derniers jours évoluent (attribution) : comparer après la synchronisation du jour.
- Le jour en cours est partiel.
- Une campagne supprimée reste dans l'historique synchronisé.

## Procédure de vérification (à réaliser sur un vrai compte — non faite à ce jour)

1. Ads Manager → niveau Campagnes → même période (ex. mois dernier) → colonnes : Montant dépensé, Impressions, Clics (tous), Clics sur un lien, CTR (lien), CPC (lien), CPM, colonne de l'événement de conversion choisi et sa valeur.
2. Comparer au dashboard (total puis tableau par campagne), même période, sans filtre.
3. Tolérance : égalité au centime pour la dépense, à l'unité pour les volumes ; ratios à l'arrondi d'affichage près.
4. Consigner le résultat dans `docs/ACCEPTANCE.md`.
