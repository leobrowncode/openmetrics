export const SYNTHETIC_DISPLAYS = ["auto", "hide", "show"] as const;
export type SyntheticDisplay = (typeof SYNTHETIC_DISPLAYS)[number];

export function isSyntheticDisplay(value: string): value is SyntheticDisplay {
  return (SYNTHETIC_DISPLAYS as readonly string[]).includes(value);
}

/**
 * Whether dashboards that contain only synthetic accounts may show those numbers.
 * A client that also has a real Meta account never mixes the two: that case is
 * decided by `includeAccountInDashboard`.
 */
export function syntheticAccountsVisible(input: { display: SyntheticDisplay; instanceHasRealAccount: boolean }): boolean {
  if (input.display === "hide") return false;
  if (input.display === "show") return true;
  return !input.instanceHasRealAccount;
}

/** Demo accounts drop out once the client has a real account, or when synthetic data is hidden. */
export function includeAccountInDashboard(input: {
  kind: "demo" | "meta";
  display: SyntheticDisplay;
  instanceHasRealAccount: boolean;
  clientHasRealAccount: boolean;
}): boolean {
  if (input.kind !== "demo") return true;
  if (input.clientHasRealAccount) return false;
  return syntheticAccountsVisible(input);
}
