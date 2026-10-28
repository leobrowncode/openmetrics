import { getMetric, type MetricKey } from "./metrics";

/**
 * Meta reports one event under several aliases. Selecting two aliases of the
 * same event would double count conversions. Human labels are what the
 * dashboard shows; the technical action_type stays secondary.
 */
export const CONVERSION_ACTION_GROUPS: Array<{
  label: string;
  singular: string;
  plural: string;
  types: string[];
}> = [
  {
    label: "Achat",
    singular: "achat",
    plural: "Achats",
    types: [
      "purchase",
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
      "onsite_web_purchase",
      "onsite_web_app_purchase",
      "web_in_store_purchase",
      "app_custom_event.fb_mobile_purchase",
      "onsite_conversion.purchase",
    ],
  },
  {
    label: "Prospect (lead)",
    singular: "prospect",
    plural: "Prospects",
    types: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "leadgen_grouped", "onsite_conversion.lead"],
  },
  {
    label: "Inscription",
    singular: "inscription",
    plural: "Inscriptions",
    types: ["complete_registration", "omni_complete_registration", "offsite_conversion.fb_pixel_complete_registration"],
  },
  {
    label: "Ajout au panier",
    singular: "ajout au panier",
    plural: "Ajouts au panier",
    types: ["add_to_cart", "omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"],
  },
  {
    label: "Paiement initié",
    singular: "paiement initié",
    plural: "Paiements initiés",
    types: ["initiate_checkout", "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout"],
  },
];

export interface ActionLabel {
  /** Group name, or the raw action type when it is not a known event. */
  name: string;
  singular: string;
  plural: string;
  known: boolean;
}

export interface ConversionNaming {
  singular: string;
  plural: string;
}

export interface ConversionDisplay {
  /** Secondary line under the dashboard title. Empty when nothing is configured. */
  technical: string;
  /** Set when every configured account follows one and the same event. */
  naming: ConversionNaming | null;
  /** Explains a total that mixes different events. Empty when the name is unambiguous. */
  warning: string | null;
}

const CONVERSION_METRICS = new Set<MetricKey>(["conversions", "conversionValue", "cvr", "cpa", "roas"]);

export function isConversionMetric(key: MetricKey): boolean {
  return CONVERSION_METRICS.has(key);
}

export function findOverlappingActionTypes(types: string[]): Array<{ label: string; types: string[] }> {
  const selected = new Set(types);
  return CONVERSION_ACTION_GROUPS.map((g) => ({ label: g.label, types: g.types.filter((t) => selected.has(t)) })).filter(
    (g) => g.types.length > 1,
  );
}

export function actionLabel(actionType: string): ActionLabel {
  const group = CONVERSION_ACTION_GROUPS.find((g) => g.types.includes(actionType));
  if (!group) return { name: actionType, singular: actionType, plural: actionType, known: false };
  return { name: group.label, singular: group.singular, plural: group.plural, known: true };
}

/** One name only when every selected type is the same event. Mixed events stay unlabeled. */
export function namingForTypes(types: string[]): ConversionNaming | null {
  if (types.length === 0) return null;
  const labels = types.map(actionLabel);
  if (new Set(labels.map((l) => l.plural)).size !== 1) return null;
  return { singular: labels[0].singular, plural: labels[0].plural };
}

function phrase(types: string[]): string {
  return types
    .map((type) => {
      const label = actionLabel(type);
      return label.known ? `${label.name} (${type})` : type;
    })
    .join(", ");
}

export function describeConversionActions(accounts: Array<{ name: string; types: string[] }>): ConversionDisplay {
  const configured = accounts.filter((a) => a.types.length > 0);
  if (configured.length === 0) return { technical: "", naming: null, warning: null };

  const signatures = configured.map((a) => [...a.types].sort().join("\0"));
  const same = new Set(signatures).size === 1;
  const naming = same ? namingForTypes(configured[0].types) : null;
  const technical =
    same && naming
      ? configured[0].types.join(", ")
      : same
        ? phrase(configured[0].types)
        : configured.map((a) => `${a.name} : ${phrase(a.types)}`).join(" · ");
  const warning = !same
    ? "Les comptes de ce dashboard ne suivent pas la même action de conversion : les totaux additionnent des événements différents."
    : !naming
      ? "Plusieurs événements de conversion sont additionnés dans le même total."
      : null;

  return { technical, naming, warning };
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

export function presentMetric(key: MetricKey, naming: ConversionNaming | null) {
  const base = getMetric(key);
  if (!naming || !isConversionMetric(key)) return base;
  const lower = lowerFirst(naming.plural);
  switch (key) {
    case "conversions":
      return {
        ...base,
        label: naming.plural,
        shortLabel: naming.plural,
        description: `Somme des actions Meta « ${naming.singular} », selon le paramètre d'attribution du compte.`,
      };
    case "conversionValue":
      return {
        ...base,
        label: `Valeur des ${lower}`,
        shortLabel: `Valeur ${lower}`,
        description: `Somme des valeurs associées aux ${lower}.`,
      };
    case "cvr":
      return {
        ...base,
        label: `Taux de conversion (${lower})`,
        shortLabel: `CVR ${lower}`,
        description: `${naming.plural} ÷ clics sur un lien.`,
      };
    case "cpa":
      return {
        ...base,
        label: `Coût par ${naming.singular}`,
        shortLabel: `Coût / ${naming.singular}`,
        description: `Montant dépensé ÷ ${lower}.`,
      };
    case "roas":
      return {
        ...base,
        label: `ROAS (${lower})`,
        shortLabel: `ROAS ${lower}`,
        description: `Valeur des ${lower} ÷ montant dépensé.`,
      };
    default:
      return base;
  }
}

/** Column header: the full action name for conversion metrics, the short label otherwise. */
export function metricColumnHeader(key: MetricKey, naming: ConversionNaming | null): string {
  const presented = presentMetric(key, naming);
  return naming && isConversionMetric(key) ? presented.label : presented.shortLabel;
}

export function conversionSectionTitle(title: string, naming: ConversionNaming | null): string {
  if (naming && title === "Conversions") return naming.plural;
  return title;
}

export function conversionWidgetTitle(
  title: string | undefined,
  metrics: MetricKey[],
  naming: ConversionNaming | null,
): string | undefined {
  if (!naming || title !== "Conversions et valeur de conversion") return title;
  if (!metrics.some((m) => m === "conversions" || m === "conversionValue")) return title;
  return `${naming.plural} et valeur des ${lowerFirst(naming.plural)}`;
}
