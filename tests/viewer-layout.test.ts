import { describe, expect, it } from "vitest";
import { REFERENCE_TEMPLATE_CONFIG } from "@/lib/dashboard-config";
import { applyViewerLayout, mergeViewerLayout, moveId, parseViewerLayout } from "@/lib/viewer-layout";

const config = REFERENCE_TEMPLATE_CONFIG;

describe("viewer layout", () => {
  it("reorders and hides sections without dropping unknown future blocks", () => {
    const saved = mergeViewerLayout(config, {
      sectionOrder: ["sec_conversions", "sec_invest"],
      hiddenSectionIds: ["sec_traffic"],
      widgetOrder: { sec_invest: ["w_invest_chart", "w_invest_kpi"] },
      hiddenWidgetIds: ["w_conv_table"],
    });
    const shown = applyViewerLayout(config, saved);
    expect(shown.sections.map((section) => section.id)).toEqual(["sec_conversions", "sec_invest", "sec_efficiency"]);
    expect(shown.sections[1]?.widgets.map((widget) => widget.id)).toEqual(["w_invest_chart", "w_invest_kpi"]);
    expect(shown.sections[0]?.widgets.map((widget) => widget.id)).not.toContain("w_conv_table");
  });

  it("moves an id one step and ignores the ends", () => {
    expect(moveId(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b"], "a", -1)).toEqual(["a", "b"]);
  });

  it("rejects a corrupt saved layout", () => {
    expect(parseViewerLayout({ sectionOrder: "nope" })).toBeNull();
  });
});
