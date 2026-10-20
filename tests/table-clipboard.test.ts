import { describe, expect, it } from "vitest";
import { emptySums, type Sums } from "@/lib/metrics";
import { campaignTableMatrix, matrixToClipboard, matrixToTsv } from "@/components/dashboard/table-clipboard";

const sums = (partial: Partial<Sums>): Sums => ({ ...emptySums(), ...partial });

describe("campaign table clipboard", () => {
  const rows = [
    {
      campaignId: "c1",
      name: "Notoriété",
      ...sums({ spend: 1200.5, impressions: 10000, linkClicks: 80, conversions: 4, conversionValue: 400 }),
    },
    {
      campaignId: "c2",
      name: "=formule & <campagne>",
      ...sums({ spend: 10, impressions: 0, linkClicks: 0, conversions: 0, conversionValue: 0 }),
    },
  ];
  const totals = sums({ spend: 1210.5, impressions: 10100, linkClicks: 80, conversions: 4, conversionValue: 400 });

  it("builds a header, one row per campaign and a total, in the given order", () => {
    const matrix = campaignTableMatrix(["spend", "linkCtr"], rows, totals, "EUR");
    expect(matrix[0]).toEqual(["Campagne", "Dépenses", "CTR lien"]);
    expect(matrix[1][0]).toBe("Notoriété");
    expect(matrix[1][1]).toMatch(/€/);
    expect(matrix[1][2]).toMatch(/%/);
    expect(matrix[2][0]).toBe("=formule & <campagne>");
    expect(matrix[2][2]).toBe("—");
    expect(matrix[3][0]).toBe("Total");
    expect(matrix.map((row) => row[1])).toEqual([
      "Dépenses",
      matrix[1][1],
      matrix[2][1],
      matrix[3][1],
    ]);
  });

  it("exports tab-separated text and an HTML table safe to paste", () => {
    const matrix = campaignTableMatrix(["spend"], rows, totals, "EUR");
    const tsv = matrixToTsv(matrix);
    expect(tsv.split("\n")).toHaveLength(4);
    expect(tsv).toContain("Campagne\tDépenses");
    expect(tsv).toContain("'=formule & <campagne>\t");
    expect(tsv).not.toMatch(/\u202F/);

    const clip = matrixToClipboard(matrix);
    expect(clip["text/html"]).toContain("<th>Campagne</th>");
    expect(clip["text/html"]).toContain("<td>'=formule &amp; &lt;campagne&gt;</td>");
    expect(clip["text/html"]).not.toContain("<campagne>");
    expect(clip["text/plain"]).toBe(tsv);
  });
});
