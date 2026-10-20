import { describe, expect, it } from "vitest";
import type { RawInsightRow } from "@/server/meta/source";
import { findOverlappingActionTypes, normalizeInsightRow, NormalizationError } from "@/server/sync/normalize";

const row: RawInsightRow = {
  campaign_id: "1202",
  campaign_name: "Campagne A",
  objective: "OUTCOME_SALES",
  date_start: "2026-10-01",
  date_stop: "2026-10-01",
  spend: "123.45",
  impressions: "10000",
  clicks: "250",
  inline_link_clicks: "120",
  actions: [
    { action_type: "link_click", value: "120" },
    { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" },
    { action_type: "purchase", value: "3" },
    { action_type: "lead", value: "2" },
  ],
  action_values: [
    { action_type: "offsite_conversion.fb_pixel_purchase", value: "450.50" },
    { action_type: "purchase", value: "450.50" },
  ],
};

describe("normalizeInsightRow", () => {
  it("parses Meta string values into numbers", () => {
    const n = normalizeInsightRow(row, ["offsite_conversion.fb_pixel_purchase"]);
    expect(n).toMatchObject({
      metaCampaignId: "1202",
      date: "2026-10-01",
      spend: 123.45,
      impressions: 10000,
      clicks: 250,
      linkClicks: 120,
      conversions: 3,
      conversionValue: 450.5,
    });
    expect(n.rawActions.lead).toBe(2);
  });

  it("counts only configured action types; none configured means zero conversions", () => {
    expect(normalizeInsightRow(row, []).conversions).toBe(0);
    expect(normalizeInsightRow(row, ["offsite_conversion.fb_pixel_purchase", "lead"]).conversions).toBe(5);
  });

  it("treats missing metrics as zero and falls back to link_click action", () => {
    const n = normalizeInsightRow(
      { campaign_id: "1", date_start: "2026-10-01", date_stop: "2026-10-01", actions: [{ action_type: "link_click", value: "7" }] },
      [],
    );
    expect(n).toMatchObject({ spend: 0, impressions: 0, clicks: 0, linkClicks: 7 });
  });

  it("rejects non-daily rows and invalid values", () => {
    expect(() => normalizeInsightRow({ ...row, date_stop: "2026-10-02" }, [])).toThrow(NormalizationError);
    expect(() => normalizeInsightRow({ ...row, spend: "abc" }, [])).toThrow(NormalizationError);
    expect(() => normalizeInsightRow({ ...row, impressions: "-5" }, [])).toThrow(NormalizationError);
  });
});

describe("findOverlappingActionTypes", () => {
  it("detects aliases of the same event that would double count", () => {
    expect(findOverlappingActionTypes(["purchase", "offsite_conversion.fb_pixel_purchase"])).toEqual([
      { label: "Achat", types: ["purchase", "offsite_conversion.fb_pixel_purchase"] },
    ]);
    expect(findOverlappingActionTypes(["offsite_conversion.fb_pixel_purchase", "lead"])).toEqual([]);
  });
});
