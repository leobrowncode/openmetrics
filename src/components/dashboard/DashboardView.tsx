"use client";

import { useState, useTransition } from "react";
import type { DashboardConfig, DashboardWidget } from "@/lib/dashboard-config";
import type { DashboardPayload } from "@/server/dashboards/query";
import { formatDateFr } from "@/lib/periods";
import { Notice, formatDateTime } from "../ui";
import { CampaignTable } from "./CampaignTable";
import { CampaignFilter, PeriodPicker } from "./Filters";
import { KpiCards } from "./KpiCards";
import { TimeSeriesChart } from "./TimeSeriesChart";

export function DashboardView({
  config,
  initial,
  dataUrl,
  mode,
  title,
  subtitle,
}: {
  config: DashboardConfig;
  initial: DashboardPayload;
  dataUrl: string;
  mode: "viewer" | "admin";
  title: string;
  subtitle?: string;
}) {
  const [payload, setPayload] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { data, query } = payload;
  const canChangePeriod = mode === "admin" || config.viewer.allowPeriodChange;
  const canFilter = mode === "admin" || config.viewer.allowCampaignFilter;

  function load(next: Partial<{ period: string; from: string; to: string; campaigns: string[] }>) {
    const params = new URLSearchParams();
    const period = next.period ?? query.period;
    params.set("period", period);
    if (period === "custom") {
      params.set("from", next.from ?? query.range.from);
      params.set("to", next.to ?? query.range.to);
    }
    const campaigns = next.campaigns ?? query.campaignIds;
    if (campaigns.length) params.set("campaigns", campaigns.join(","));

    startTransition(async () => {
      try {
        const res = await fetch(`${dataUrl}?${params}`, { cache: "no-store", credentials: "same-origin" });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setError(body?.error ?? (res.status === 401 ? "Ce lien n'est plus valide." : "Impossible de charger les données."));
          return;
        }
        setError(null);
        setPayload(body as DashboardPayload);
        window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
      } catch {
        setError("Connexion impossible. Vérifiez votre réseau puis réessayez.");
      }
    });
  }

  const renderWidget = (widget: DashboardWidget) => {
    switch (widget.type) {
      case "kpi":
        return <KpiCards metrics={widget.metrics} totals={data.totals} previousTotals={data.previousTotals} currency={data.currency} />;
      case "timeseries":
        return (
          <TimeSeriesChart metrics={widget.metrics} series={data.series} range={data.range} currency={data.currency} chartStyle={widget.chartStyle} />
        );
      case "campaign_table":
        return (
          <CampaignTable
            title={widget.title}
            metrics={widget.metrics}
            rows={data.byCampaign}
            totals={data.totals}
            currency={data.currency}
          />
        );
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {subtitle && <p className="text-sm font-medium text-brand-600">{subtitle}</p>}
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Dernière actualisation : <strong className="font-medium text-slate-700">{formatDateTime(data.lastSyncedAt)}</strong>
            {" · "}Devise {data.currency} · Jours au fuseau {data.timezoneName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
          {canChangePeriod ? (
            <PeriodPicker
              key={`${query.period}:${query.range.from}:${query.range.to}`}
              period={query.period}
              range={query.range}
              disabled={pending}
              onChange={(next) => load(next.period === "custom" ? next : { period: next.period })}
            />
          ) : (
            <span className="text-sm text-slate-600 tabular">
              {formatDateFr(query.range.from)} – {formatDateFr(query.range.to)}
            </span>
          )}
          {canFilter && data.campaigns.length > 0 && (
            <CampaignFilter key={query.campaignIds.join(",")} campaigns={data.campaigns} selected={query.campaignIds} onChange={(ids) => load({ campaigns: ids })} />
          )}
        </div>
      </header>

      {error && <Notice tone="red">{error}</Notice>}
      {data.warnings.map((w) => (
        <Notice key={w}>{w}</Notice>
      ))}
      {data.previousRange && (
        <p className="text-xs text-slate-500">
          Comparaison avec la période précédente : {formatDateFr(data.previousRange.from)} – {formatDateFr(data.previousRange.to)}
        </p>
      )}

      <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <div className="space-y-8">
          {config.sections.map((section) => (
            <section key={section.id} aria-labelledby={`h-${section.id}`}>
              <h2 id={`h-${section.id}`} className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
                <span className="h-5 w-1.5 rounded-full bg-brand-600" aria-hidden />
                {section.title}
              </h2>
              <div className="space-y-4">
                {section.widgets.map((widget) => (
                  <div key={widget.id} className={widget.type === "kpi" ? "" : "rounded-xl border border-slate-200 bg-white p-4 shadow-sm"}>
                    {widget.title && widget.type !== "kpi" && widget.type !== "campaign_table" && (
                      <h3 className="mb-3 text-sm font-medium text-slate-700">{widget.title}</h3>
                    )}
                    {renderWidget(widget)}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">
        Source : Meta Ads (Insights API), attribution selon le paramètre du compte publicitaire. Les conversions des 28 derniers jours peuvent encore évoluer.
        {mode === "viewer" && " Consultation en lecture seule."}
      </footer>
    </div>
  );
}
