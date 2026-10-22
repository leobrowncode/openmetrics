import { describe, expect, it } from "vitest";
import { parseDashboardConfig } from "@/lib/dashboard-config";
import { includeAccountInDashboard, syntheticAccountsVisible } from "@/lib/synthetic-display";

describe("synthetic display", () => {
  it("hides synthetic data automatically once any real account exists", () => {
    expect(syntheticAccountsVisible({ display: "auto", instanceHasRealAccount: false })).toBe(true);
    expect(syntheticAccountsVisible({ display: "auto", instanceHasRealAccount: true })).toBe(false);
    expect(syntheticAccountsVisible({ display: "hide", instanceHasRealAccount: false })).toBe(false);
    expect(syntheticAccountsVisible({ display: "show", instanceHasRealAccount: true })).toBe(true);
  });

  it("never mixes synthetic accounts into a client that already has a real one", () => {
    expect(
      includeAccountInDashboard({
        kind: "demo",
        display: "show",
        instanceHasRealAccount: false,
        clientHasRealAccount: true,
      }),
    ).toBe(false);
    expect(
      includeAccountInDashboard({
        kind: "meta",
        display: "hide",
        instanceHasRealAccount: true,
        clientHasRealAccount: true,
      }),
    ).toBe(true);
    expect(
      includeAccountInDashboard({
        kind: "demo",
        display: "hide",
        instanceHasRealAccount: false,
        clientHasRealAccount: false,
      }),
    ).toBe(false);
  });

  it("keeps older dashboard configs customizable by default", () => {
    const parsed = parseDashboardConfig({
      version: 1,
      defaultPeriod: "last_30_days",
      compareToPreviousPeriod: true,
      viewer: { allowPeriodChange: true, allowCampaignFilter: false },
      sections: [],
    });
    expect(parsed.viewer.allowCustomize).toBe(true);
    expect(parsed.viewer.allowCampaignFilter).toBe(false);
  });
});
