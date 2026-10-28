import { presentMetric, type ConversionNaming } from "@/lib/conversion-actions";
import { computeMetric, formatMetric, relativeDelta, type MetricKey, type Sums } from "@/lib/metrics";
import { cx } from "../ui";

export function KpiCards({
  metrics,
  totals,
  previousTotals,
  currency,
  naming = null,
}: {
  metrics: MetricKey[];
  totals: Sums;
  previousTotals: Sums | null;
  currency: string;
  naming?: ConversionNaming | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {metrics.map((key) => {
        const def = presentMetric(key, naming);
        const value = computeMetric(key, totals);
        const previous = previousTotals ? computeMetric(key, previousTotals) : null;
        const delta = previousTotals ? relativeDelta(value, previous) : null;
        const good = delta === null ? null : delta === 0 ? null : (delta > 0) === def.higherIsBetter;
        return (
          <div key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" title={def.description}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{def.label}</p>
            <p className="tabular mt-2 text-2xl font-semibold text-slate-900" data-testid={`kpi-${key}`}>
              {formatMetric(key, value, currency)}
            </p>
            {previousTotals && (
              <p className="mt-1 text-xs text-slate-500">
                {delta === null ? (
                  <span>— vs période précédente</span>
                ) : (
                  <>
                    <span className={cx("font-semibold", good === true && "text-emerald-600", good === false && "text-red-600")}>
                      {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 }).format(Math.abs(delta))}
                    </span>{" "}
                    vs {formatMetric(key, previous, currency)}
                  </>
                )}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
