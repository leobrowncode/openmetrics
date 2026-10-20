"use client";

import { useState } from "react";
import { computeMetric, formatMetric, getMetric, type MetricKey, type Sums } from "@/lib/metrics";

export function CampaignTable({
  metrics,
  rows,
  totals,
  currency,
}: {
  metrics: MetricKey[];
  rows: Array<{ campaignId: string; name: string } & Sums>;
  totals: Sums;
  currency: string;
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
                  title={getMetric(key).description}
                  onClick={() => (key === sortKey ? setDesc(!desc) : (setSortKey(key), setDesc(true)))}
                >
                  {getMetric(key).shortLabel}
                  {key === sortKey ? (desc ? " ↓" : " ↑") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular">
          {sorted.map((row) => (
            <tr key={row.campaignId} className="border-b border-slate-100 last:border-0">
              <td className="max-w-xs truncate py-2 pr-4 text-slate-800" title={row.name}>
                {row.name}
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
  );
}
