import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { emptySums } from "@/lib/metrics";

const totals = { ...emptySums(), spend: 100, impressions: 1000, clicks: 50, linkClicks: 40 };

describe("KPI cards", () => {
  it("omits the placeholder dash when the previous period cannot be compared", () => {
    const html = renderToStaticMarkup(
      createElement(KpiCards, { metrics: ["spend", "impressions"], totals, previousTotals: emptySums(), currency: "EUR" }),
    );
    expect(html).not.toContain(">-<");
    expect(html).not.toContain("vs ");
    expect(html).toContain("100,00");
  });

  it("keeps the comparison when both periods have a value", () => {
    const html = renderToStaticMarkup(
      createElement(KpiCards, {
        metrics: ["spend"],
        totals,
        previousTotals: { ...emptySums(), spend: 80 },
        currency: "EUR",
      }),
    );
    expect(html).toContain("vs ");
    expect(html).toContain("80,00");
  });
});
