/** French-aware matching for long lists of Meta ad account names. */

export function foldAccountQuery(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr-FR");
}

export function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, "fr", { sensitivity: "base", numeric: true });
}

export type AccountMatchMode = "all" | "prefix" | "contains";

export function filterAccountsByQuery<T extends { name: string }>(
  accounts: readonly T[],
  query: string,
): { items: T[]; mode: AccountMatchMode } {
  const items = [...accounts].sort((a, b) => compareLabels(a.name, b.name));
  const q = foldAccountQuery(query.trim());
  if (!q) return { items, mode: "all" };
  const prefix = items.filter((account) => foldAccountQuery(account.name).startsWith(q));
  if (prefix.length > 0) return { items: prefix, mode: "prefix" };
  return {
    items: items.filter((account) => foldAccountQuery(account.name).includes(q)),
    mode: "contains",
  };
}

/** Client name suggested from an ad account title ("Le Rocher — Dons (démo)" → "Le Rocher"). */
export function suggestedClientName(accountName: string): string {
  const withoutTag = accountName.replace(/\s*\(démo\)\s*$/i, "").trim();
  const head = withoutTag.split(/\s+[—–-]\s+/)[0]?.trim() ?? withoutTag;
  return head.length >= 2 ? head : withoutTag;
}
