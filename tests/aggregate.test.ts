import { describe, expect, it } from "vitest";
import { pickGranularity } from "@/components/dashboard/aggregate";

describe("chart granularity", () => {
  it("keeps calendar days until a full year, then switches to months", () => {
    expect(pickGranularity({ from: "2026-07-01", to: "2026-10-28" })).toBe("day");
    expect(pickGranularity({ from: "2026-01-01", to: "2026-04-03" })).toBe("day");
    expect(pickGranularity({ from: "2025-01-01", to: "2026-01-01" })).toBe("day");
    expect(pickGranularity({ from: "2025-01-01", to: "2026-01-02" })).toBe("month");
  });
});
