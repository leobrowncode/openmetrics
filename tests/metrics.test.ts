import { describe, expect, it } from "vitest";
import { addSums, computeMetric, emptySums, formatMetric, METRIC_KEYS, relativeDelta, type Sums } from "@/lib/metrics";

const day = (s: Partial<Sums>): Sums => ({ ...emptySums(), ...s });

describe("KPI aggregation", () => {
  it("computes ratios from summed bases, not by averaging daily ratios", () => {
    const days = [
      day({ spend: 100, impressions: 10_000, clicks: 100, linkClicks: 50, conversions: 5, conversionValue: 500 }),
      day({ spend: 10, impressions: 1_000, clicks: 50, linkClicks: 10, conversions: 0, conversionValue: 0 }),
    ];
    const total = days.reduce((acc, d) => addSums(acc, d), emptySums());

    expect(computeMetric("ctr", total)).toBeCloseTo((150 / 11_000) * 100, 10);
    expect(computeMetric("linkCtr", total)).toBeCloseTo((60 / 11_000) * 100, 10);
    expect(computeMetric("cpc", total)).toBeCloseTo(110 / 150, 10);
    expect(computeMetric("linkCpc", total)).toBeCloseTo(110 / 60, 10);
    expect(computeMetric("cpm", total)).toBeCloseTo((110 / 11_000) * 1000, 10);
    expect(computeMetric("cvr", total)).toBeCloseTo((5 / 60) * 100, 10);
    expect(computeMetric("cpa", total)).toBeCloseTo(110 / 5, 10);
    expect(computeMetric("roas", total)).toBeCloseTo(500 / 110, 10);

    const averagedDailyCtr = ((100 / 10_000) * 100 + (50 / 1_000) * 100) / 2;
    expect(computeMetric("ctr", total)).not.toBeCloseTo(averagedDailyCtr, 3);
  });

  it("returns null instead of 0 or Infinity when the denominator is zero", () => {
    const zero = emptySums();
    for (const key of ["ctr", "linkCtr", "cpc", "linkCpc", "cpm", "cvr", "cpa", "roas"] as const) {
      expect(computeMetric(key, zero)).toBeNull();
    }
    expect(computeMetric("spend", zero)).toBe(0);
  });

  it("is additive across arbitrary partitions (campaigns or days)", () => {
    const a = day({ spend: 12.34, impressions: 1234, clicks: 56, linkClicks: 40, conversions: 2, conversionValue: 99.9 });
    const b = day({ spend: 7.66, impressions: 766, clicks: 4, linkClicks: 0, conversions: 1, conversionValue: 0.1 });
    const byCampaign = addSums(addSums(emptySums(), a), b);
    const byDay = addSums(addSums(emptySums(), b), a);
    for (const key of METRIC_KEYS) {
      expect(computeMetric(key, byCampaign)).toEqual(computeMetric(key, byDay));
    }
  });

  it("formats values with French conventions and the account currency", () => {
    expect(formatMetric("spend", 1234.5, "EUR")).toMatch(/^1\s234,50\s€$/);
    expect(formatMetric("spend", 12.5, "USD")).toMatch(/12,50\s?\$US|12,50\s?\$/);
    expect(formatMetric("linkCtr", 1.23456, "EUR")).toBe("1,23 %");
    expect(formatMetric("roas", 6.861, "EUR")).toBe("6,86");
    expect(formatMetric("cpa", null, "EUR")).toBe("-");
  });

  it("computes relative deltas only when meaningful", () => {
    expect(relativeDelta(120, 100)).toBeCloseTo(0.2);
    expect(relativeDelta(80, 100)).toBeCloseTo(-0.2);
    expect(relativeDelta(10, 0)).toBeNull();
    expect(relativeDelta(null, 10)).toBeNull();
  });
});
