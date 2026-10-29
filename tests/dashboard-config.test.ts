import { describe, expect, it } from "vitest";
import { CHART_PALETTE, DEFAULT_CHART_COLORS } from "@/lib/chart-colors";
import { parseDashboardConfig, REFERENCE_TEMPLATE_CONFIG, type DashboardConfig } from "@/lib/dashboard-config";

function legacyConfig(): Partial<DashboardConfig> {
  const legacy: Partial<DashboardConfig> = { ...REFERENCE_TEMPLATE_CONFIG };
  delete legacy.chartColors;
  return legacy;
}

describe("dashboard chart colors", () => {
  it("keeps the historical colors when a dashboard has none stored", () => {
    expect(parseDashboardConfig(legacyConfig()).chartColors).toEqual([...DEFAULT_CHART_COLORS]);
  });

  it("stores a palette choice on that dashboard only", () => {
    const parsed = parseDashboardConfig({
      ...REFERENCE_TEMPLATE_CONFIG,
      chartColors: ["#10b981", "#ef4444"],
    });
    expect(parsed.chartColors).toEqual(["#10b981", "#ef4444"]);
  });

  it("does not share the default array between dashboards", () => {
    const legacy = legacyConfig();
    const first = parseDashboardConfig(legacy);
    first.chartColors[0] = "#10b981";
    expect(parseDashboardConfig(legacy).chartColors[0]).toBe(DEFAULT_CHART_COLORS[0]);
  });

  it("rejects a color outside the palette", () => {
    expect(() =>
      parseDashboardConfig({
        ...REFERENCE_TEMPLATE_CONFIG,
        chartColors: ["#000000", "#ffffff"],
      }),
    ).toThrow();
  });

  it("offers each shade once", () => {
    expect(new Set(CHART_PALETTE).size).toBe(CHART_PALETTE.length);
    for (const hex of DEFAULT_CHART_COLORS) expect(CHART_PALETTE).toContain(hex);
  });
});
