import { describe, expect, it } from "vitest";
import {
  conversionSectionTitle,
  conversionWidgetTitle,
  describeConversionActions,
  metricColumnHeader,
  namingForTypes,
  presentMetric,
} from "@/lib/conversion-actions";
import { lockedDashboardQuery } from "@/server/dashboards/query";

const purchase = namingForTypes(["offsite_conversion.fb_pixel_purchase"]);

describe("conversion action labels", () => {
  it("names a known event on the cards, the chart and the columns", () => {
    expect(purchase).toEqual({ singular: "achat", plural: "Achats" });
    expect(presentMetric("conversions", purchase).label).toBe("Achats");
    expect(presentMetric("conversionValue", purchase).label).toBe("Valeur des achats");
    expect(presentMetric("cpa", purchase).label).toBe("Coût par achat");
    expect(presentMetric("cvr", purchase).label).toBe("Taux de conversion (achats)");
    expect(presentMetric("roas", purchase).label).toBe("ROAS (achats)");
    expect(presentMetric("spend", purchase).label).toBe("Montant dépensé");
    expect(metricColumnHeader("conversions", purchase)).toBe("Achats");
    expect(metricColumnHeader("cvr", purchase)).toBe("Taux de conversion (achats)");
    expect(metricColumnHeader("spend", purchase)).toBe("Dépenses");
    expect(conversionSectionTitle("Conversions", purchase)).toBe("Achats");
    expect(conversionSectionTitle("Investissements", purchase)).toBe("Investissements");
    expect(conversionWidgetTitle("Conversions et valeur de conversion", ["conversions", "conversionValue"], purchase)).toBe(
      "Achats et valeur des achats",
    );
  });

  it("keeps the generic label when no action is configured or events are mixed", () => {
    expect(namingForTypes([])).toBeNull();
    expect(namingForTypes(["purchase", "lead"])).toBeNull();
    expect(presentMetric("conversions", null).label).toBe("Conversions");
    expect(describeConversionActions([{ name: "A", types: [] }])).toEqual({ technical: "", naming: null, warning: null });
    const mixed = describeConversionActions([
      { name: "Compte A", types: ["offsite_conversion.fb_pixel_purchase"] },
      { name: "Compte B", types: ["lead"] },
    ]);
    expect(mixed.naming).toBeNull();
    expect(mixed.technical).toContain("Compte A : Achat (offsite_conversion.fb_pixel_purchase)");
    expect(mixed.technical).toContain("Compte B : Prospect (lead)");
    expect(mixed.warning).toMatch(/même action/);
  });

  it("shows the technical type once when every account follows the same event", () => {
    const display = describeConversionActions([
      { name: "A", types: ["offsite_conversion.fb_pixel_purchase"] },
      { name: "B", types: ["offsite_conversion.fb_pixel_purchase"] },
    ]);
    expect(display.naming).toEqual(purchase);
    expect(display.technical).toBe("offsite_conversion.fb_pixel_purchase");
    expect(display.warning).toBeNull();
  });

  it("leaves an unknown custom conversion as its Meta identifier", () => {
    const custom = "offsite_conversion.custom.123456";
    expect(namingForTypes([custom])).toEqual({ singular: custom, plural: custom });
    expect(presentMetric("conversions", namingForTypes([custom])).label).toBe(custom);
  });
});

describe("locked dashboard query", () => {
  it("uses the saved dates and ignores nothing about the range itself", () => {
    expect(lockedDashboardQuery({ range: { from: "2026-01-01", to: "2026-01-31" }, campaignIds: ["12"] })).toEqual({
      period: "custom",
      range: { from: "2026-01-01", to: "2026-01-31" },
      campaignIds: ["12"],
    });
    expect(lockedDashboardQuery({ range: { from: "2026-02-01", to: "2026-01-01" }, campaignIds: [] })).toEqual({
      error: "La date de début doit précéder la date de fin.",
    });
  });
});
