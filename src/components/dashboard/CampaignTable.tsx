"use client";

import { useState } from "react";
import { metricColumnHeader, presentMetric, type ConversionNaming } from "@/lib/conversion-actions";
import { computeMetric, formatMetric, type MetricKey, type Sums } from "@/lib/metrics";
import { plainDashes } from "@/lib/text";
import { CopyTableButton } from "./CopyTableButton";
import { campaignTableMatrix, type CampaignTableRow } from "./table-clipboard";

export function CampaignTable({
  title,
  metrics,
  rows,
  totals,
  currency,
  naming = null,
}: {
  title?: string;
  metrics: MetricKey[];
  rows: CampaignTableRow[];
  totals: Sums;
  currency: string;
  naming?: ConversionNaming | null;
}) {
  const [sortKey, setSortKey] = useState<MetricKey>(metrics[0]);
  const [desc, setDesc] = useState(true);
  const sorted = [...rows].sort((a, b) => {
    const va = computeMetric(sortKey, a) ?? -Infinity;
    const vb = computeMetric(sortKey, b) ?? -Infinity;
    return desc ? vb - va : va - vb;
  });

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">Aucune diffusion sur la période sélectionnée.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {title ? <h3 className="text-sm font-medium text-slate-700">{title}</h3> : <span />}
        <CopyTableButton matrix={campaignTableMatrix(metrics, sorted, totals, currency, naming)} />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4 font-medium">Campagne</th>
              {metrics.map((key) => (
                <th key={key} className="py-2 pl-4 text-right font-medium whitespace-nowrap">
                  <button
                    type="button"
                    className="hover:text-slate-900"
                    title={presentMetric(key, naming).description}
                    onClick={() => (key === sortKey ? setDesc(!desc) : (setSortKey(key), setDesc(true)))}
                  >
                    {metricColumnHeader(key, naming)}
                    {key === sortKey ? (desc ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {sorted.map((row) => (
              <tr key={row.campaignId} className="border-b border-slate-100 last:border-0">
                <td className="max-w-xs truncate py-2 pr-4 text-slate-800" title={plainDashes(row.name)}>
                  {plainDashes(row.name)}
                </td>
                {metrics.map((key) => (
                  <td key={key} className="py-2 pl-4 text-right whitespace-nowrap text-slate-700">
                    {formatMetric(key, computeMetric(key, row), currency)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="tabular">
            <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
              <td className="py-2 pr-4">Total</td>
              {metrics.map((key) => (
                <td key={key} className="py-2 pl-4 text-right whitespace-nowrap">
                  {formatMetric(key, computeMetric(key, totals), currency)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
