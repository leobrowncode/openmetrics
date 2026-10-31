import { describe, expect, it } from "vitest";
import { REFERENCE_TEMPLATE_CONFIG } from "@/lib/dashboard-config";
import { addDays, todayInTimezone } from "@/lib/periods";
import { parseDashboardQuery } from "@/server/dashboards/query";

describe("dashboard period query", () => {
  it("accepts since_start as a preset without dates", () => {
    const yesterday = addDays(todayInTimezone("Europe/Paris"), -1);
    expect(
      parseDashboardQuery(new URLSearchParams("period=since_start"), REFERENCE_TEMPLATE_CONFIG, "Europe/Paris", "admin"),
    ).toEqual({
      period: "since_start",
      range: { from: yesterday, to: yesterday },
      campaignIds: [],
    });
  });

  it("rejects an unknown period", () => {
    expect(
      parseDashboardQuery(new URLSearchParams("period=forever"), REFERENCE_TEMPLATE_CONFIG, "Europe/Paris", "admin"),
    ).toEqual({ error: "Période inconnue." });
  });

  it("ignores since_start when the viewer cannot change the period", () => {
    const config = {
      ...REFERENCE_TEMPLATE_CONFIG,
      viewer: { ...REFERENCE_TEMPLATE_CONFIG.viewer, allowPeriodChange: false },
    };
    const query = parseDashboardQuery(new URLSearchParams("period=since_start"), config, "Europe/Paris", "viewer");
    expect(query).toMatchObject({ period: "last_30_days" });
  });
});
