"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DEFAULT_CHART_COLORS } from "@/lib/chart-colors";
import { computeMetric, formatMetric, getMetric, type MetricKey, type Sums } from "@/lib/metrics";
import type { DateRange } from "@/lib/periods";
import { bucketSeries, formatBucket, pickGranularity } from "./aggregate";
import { CopyTableButton } from "./CopyTableButton";
import { seriesTableMatrix } from "./table-clipboard";

export function TimeSeriesChart({
  title,
  metrics,
  series,
  range,
  currency,
  chartStyle = "line",
  colors = DEFAULT_CHART_COLORS,
}: {
  title?: string;
  metrics: MetricKey[];
  series: Array<{ date: string } & Sums>;
  range: DateRange;
  currency: string;
  chartStyle?: "line" | "bar" | "area";
  colors?: readonly string[];
}) {
  const granularity = pickGranularity(range);
  const buckets = bucketSeries(series, range, granularity);
  const rows = buckets.map((b) => {
    const point: Record<string, number | string | null> = { label: formatBucket(b.bucket, granularity) };
    for (const key of metrics) point[key] = computeMetric(key, b);
    return point;
  });

  // A second axis is used when two metrics do not share a unit/scale (e.g. CTR and CPC).
  const units = metrics.map((k) => getMetric(k).unit);
  const dualAxis = metrics.length === 2 && (units[0] !== units[1] || metrics.includes("impressions"));
  const compact = (key: MetricKey) => (v: number) =>
    getMetric(key).unit === "currency"
      ? new Intl.NumberFormat("fr-FR", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v)
      : getMetric(key).unit === "percent"
        ? `${v.toFixed(1)} %`
        : new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(v);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        {title ? <h3 className="text-sm font-medium text-slate-700">{title}</h3> : <span />}
        <CopyTableButton matrix={seriesTableMatrix(metrics, buckets, granularity, currency)} />
      </div>
      <div className="h-72 w-full">
        <p className="mb-2 text-xs text-slate-400">
          Granularité : {granularity === "day" ? "jour" : granularity === "week" ? "semaine" : "mois"}
        </p>
        <ResponsiveContainer width="100%" height="90%">
        <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#eef0f4" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} tickFormatter={compact(metrics[0])} />
          {dualAxis && (
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} tickFormatter={compact(metrics[1])} />
          )}
          <Tooltip
            formatter={(value, name) => [formatMetric(name as MetricKey, typeof value === "number" ? value : null, currency), getMetric(name as MetricKey).label]}
            contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 12 }}
          />
          {metrics.length > 1 && <Legend formatter={(value) => getMetric(value as MetricKey).label} wrapperStyle={{ fontSize: 12 }} />}
          {metrics.map((key, i) => {
            const axis = dualAxis && i === 1 ? "right" : "left";
            const color = colors[i % colors.length] ?? DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length];
            const style = i === 0 ? chartStyle : "line";
            if (style === "bar") return <Bar key={key} isAnimationActive={false} yAxisId={axis} dataKey={key} fill={color} radius={[3, 3, 0, 0]} maxBarSize={28} />;
            if (style === "area")
              return <Area key={key} isAnimationActive={false} yAxisId={axis} dataKey={key} stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} type="linear" />;
            return <Line key={key} isAnimationActive={false} yAxisId={axis} dataKey={key} stroke={color} strokeWidth={2} dot={false} type="linear" connectNulls={false} />;
          })}
        </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
