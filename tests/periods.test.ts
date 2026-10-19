import { describe, expect, it } from "vitest";
import {
  daysBetweenInclusive,
  isIsoDate,
  previousPeriod,
  resolvePreset,
  todayInTimezone,
  validateRange,
} from "@/lib/periods";

describe("periods", () => {
  it("resolves relative presets excluding today, like Ads Manager", () => {
    expect(resolvePreset("last_7_days", "2026-10-19")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(resolvePreset("last_30_days", "2026-10-19")).toEqual({ from: "2026-09-19", to: "2026-10-18" });
    expect(daysBetweenInclusive(resolvePreset("last_30_days", "2026-10-19"))).toBe(30);
  });

  it("resolves calendar presets", () => {
    expect(resolvePreset("this_month", "2026-10-19")).toEqual({ from: "2026-10-01", to: "2026-10-18" });
    expect(resolvePreset("this_month", "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-01" });
    expect(resolvePreset("last_month", "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(resolvePreset("last_month", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("computes the previous period of identical length", () => {
    expect(previousPeriod({ from: "2026-10-12", to: "2026-10-18" })).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-01-29", to: "2026-02-28" });
  });

  it("uses the ad account timezone to determine today", () => {
    const now = new Date("2026-10-19T23:30:00Z");
    expect(todayInTimezone("Europe/Paris", now)).toBe("2026-10-20");
    expect(todayInTimezone("America/Los_Angeles", now)).toBe("2026-10-19");
  });

  it("validates custom ranges", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(validateRange({ from: "2026-10-10", to: "2026-10-01" })).not.toBeNull();
    expect(validateRange({ from: "2020-01-01", to: "2026-01-01" })).not.toBeNull();
    expect(validateRange({ from: "2026-10-01", to: "2026-10-10" })).toBeNull();
  });
});
