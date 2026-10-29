import { describe, expect, test } from "vitest";
import { compareLabels, filterAccountsByQuery, suggestedClientName } from "@/lib/account-search";

const accounts = [
  { name: "Zéphyr Voyages", metaAccountId: "9" },
  { name: "École du Regard", metaAccountId: "4" },
  { name: "Le Rocher", metaAccountId: "5" },
  { name: "Librairie Page", metaAccountId: "6" },
  { name: "Lumen Studio", metaAccountId: "7" },
  { name: "Café des Arts", metaAccountId: "3" },
  { name: "Maison Lumen", metaAccountId: "8" },
  { name: "Compte 10", metaAccountId: "2" },
  { name: "Compte 2", metaAccountId: "1" },
];

describe("filterAccountsByQuery", () => {
  test("sorts names in French alphabetical order, with numeric order", () => {
    expect(filterAccountsByQuery(accounts, "").items.map((account) => account.name)).toEqual([
      "Café des Arts",
      "Compte 2",
      "Compte 10",
      "École du Regard",
      "Le Rocher",
      "Librairie Page",
      "Lumen Studio",
      "Maison Lumen",
      "Zéphyr Voyages",
    ]);
    expect(compareLabels("Compte 2", "Compte 10")).toBeLessThan(0);
  });

  test("typing l keeps the accounts whose name starts with l", () => {
    const result = filterAccountsByQuery(accounts, "l");
    expect(result.mode).toBe("prefix");
    expect(result.items.map((account) => account.name)).toEqual(["Le Rocher", "Librairie Page", "Lumen Studio"]);
  });

  test("matches prefixes without accents", () => {
    expect(filterAccountsByQuery(accounts, "e").items.map((account) => account.name)).toEqual(["École du Regard"]);
    expect(filterAccountsByQuery(accounts, "É").items.map((account) => account.name)).toEqual(["École du Regard"]);
  });

  test("falls back to a contains search when no name starts with the query", () => {
    const result = filterAccountsByQuery(accounts, "arts");
    expect(result.mode).toBe("contains");
    expect(result.items.map((account) => account.name)).toEqual(["Café des Arts"]);
  });

  test("lumen matches the name that starts with it, not every name that contains it", () => {
    const result = filterAccountsByQuery(accounts, "lumen");
    expect(result.mode).toBe("prefix");
    expect(result.items.map((account) => account.name)).toEqual(["Lumen Studio"]);
  });
});

describe("suggestedClientName", () => {
  test("drops the campaign suffix and the demo tag", () => {
    expect(suggestedClientName("Le Rocher — Dons (démo)")).toBe("Le Rocher");
    expect(suggestedClientName("Maison Lumen")).toBe("Maison Lumen");
  });
});
