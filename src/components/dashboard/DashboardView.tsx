"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { conversionSectionTitle, conversionWidgetTitle } from "@/lib/conversion-actions";
import type { DashboardConfig, DashboardWidget } from "@/lib/dashboard-config";
import type { DashboardPayload } from "@/server/dashboards/query";
import { plainDashes } from "@/lib/text";
import {
  applyViewerLayout,
  clearViewerLayout,
  mergeViewerLayout,
  readViewerLayoutSnapshot,
  subscribeViewerLayouts,
  writeViewerLayout,
  type ViewerLayout,
} from "@/lib/viewer-layout";
import { Button, Notice, formatDateTime } from "../ui";
import { CampaignTable } from "./CampaignTable";
import { ChartColorEditor } from "./ChartColorEditor";
import { CustomizePanel } from "./CustomizePanel";
import { CampaignFilter, PeriodPicker, PeriodReadout } from "./Filters";
import { GenerateBilan } from "./GenerateBilan";
import { KpiCards } from "./KpiCards";
import { TimeSeriesChart } from "./TimeSeriesChart";

export function DashboardView({
  config,
  initial,
  dataUrl,
  mode,
  dashboardId,
  title,
  subtitle,
  locked = false,
}: {
  config: DashboardConfig;
  initial: DashboardPayload;
  dataUrl: string;
  mode: "viewer" | "admin";
  dashboardId: string;
  title: string;
  subtitle?: string;
  /** Bilan: period and campaigns stay those saved with the bilan. */
  locked?: boolean;
}) {
  const [payload, setPayload] = useState(initial);
  const [chartColors, setChartColors] = useState<string[]>(() => [...config.chartColors]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [customizing, setCustomizing] = useState(false);
  const storedLayout = useSyncExternalStore(subscribeViewerLayouts, () => readViewerLayoutSnapshot(dashboardId), () => null);
  const showIdentity = mode !== "admin";
  const pageTitle = plainDashes(title);
  const pageSubtitle = subtitle ? plainDashes(subtitle) : undefined;
  const { data, query } = payload;
  const canChangePeriod = !locked && (mode === "admin" || config.viewer.allowPeriodChange);
  const canFilter = !locked && (mode === "admin" || config.viewer.allowCampaignFilter);
  const canCustomize = !locked && mode === "viewer" && config.viewer.allowCustomize;
  const selectedNames = data.campaigns.filter((c) => data.selectedCampaignIds.includes(c.id)).map((c) => plainDashes(c.name));

  const personalLayout = canCustomize ? mergeViewerLayout(config, storedLayout) : null;
  const shown = personalLayout ? applyViewerLayout(config, personalLayout) : config;

  function saveLayout(next: ViewerLayout) {
    writeViewerLayout(dashboardId, next);
  }

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
        return <KpiCards metrics={widget.metrics} totals={data.totals} previousTotals={data.previousTotals} currency={data.currency} naming={data.conversion.naming} />;
      case "timeseries": {
        const seriesTitle = conversionWidgetTitle(widget.title, widget.metrics, data.conversion.naming);
        return (
          <TimeSeriesChart
            title={seriesTitle ? plainDashes(seriesTitle) : undefined}
            metrics={widget.metrics}
            series={data.series}
            range={data.range}
            currency={data.currency}
            chartStyle={widget.chartStyle}
            naming={data.conversion.naming}
            colors={chartColors}
          />
        );
      }
      case "campaign_table":
        return (
          <CampaignTable
            title={widget.title ? plainDashes(widget.title) : undefined}
            metrics={widget.metrics}
            rows={data.byCampaign}
            totals={data.totals}
            currency={data.currency}
            naming={data.conversion.naming}
          />
        );
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-col gap-3">
        {showIdentity && (
          <div>
            {pageSubtitle && <p className="text-sm font-medium text-brand-600">{pageSubtitle}</p>}
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{pageTitle}</h1>
          </div>
        )}
        {locked && !showIdentity && <h2 className="text-lg font-semibold tracking-tight text-slate-900">{pageTitle}</h2>}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-slate-500">
              Dernière actualisation : <strong className="font-medium text-slate-700">{formatDateTime(data.lastSyncedAt)}</strong>
              {" · "}Devise {data.currency} · Jours au fuseau {data.timezoneName}
            </p>
            {data.conversion.technical && (
              <p className="text-sm text-slate-600">
                Action Meta : <code className="text-xs">{data.conversion.technical}</code>
              </p>
            )}
            {locked && (
              <p className="text-sm text-slate-600">
                Campagnes : {selectedNames.length > 0 ? selectedNames.join(", ") : "aucune campagne de ce bilan dans le périmètre"}
              </p>
            )}
          </div>
          <div className="relative flex flex-wrap items-center gap-2" aria-busy={pending}>
            {canChangePeriod ? (
              <PeriodPicker
                key={`${query.period}:${query.range.from}:${query.range.to}`}
                period={query.period}
                range={query.range}
                compare={data.previousRange}
                dataFrom={data.dataFrom}
                campaignCount={query.campaignIds.length}
                disabled={pending}
                onChange={(next) => load(next.period === "custom" ? next : { period: next.period })}
              />
            ) : (
              <PeriodReadout range={query.range} compare={data.previousRange} />
            )}
            {canFilter && data.campaigns.length > 0 && (
              <CampaignFilter key={query.campaignIds.join(",")} campaigns={data.campaigns} selected={query.campaignIds} onChange={(ids) => load({ campaigns: ids })} />
            )}
            {mode === "admin" && !locked && (
              <GenerateBilan dashboardId={dashboardId} campaignIds={query.campaignIds} campaigns={data.campaigns} range={query.range} />
            )}
            {mode === "admin" && (
              <ChartColorEditor dashboardId={dashboardId} initialColors={config.chartColors} onColorsChange={setChartColors} />
            )}
            {canCustomize && (
              <Button type="button" variant="secondary" size="sm" aria-expanded={customizing} onClick={() => setCustomizing((open) => !open)}>
                Personnaliser
              </Button>
            )}
          </div>
        </div>
      </header>

      {canCustomize && customizing && personalLayout && (
        <CustomizePanel
          config={config}
          layout={personalLayout}
          onChange={saveLayout}
          onReset={() => {
            clearViewerLayout(dashboardId);
          }}
        />
      )}

      {error && <Notice tone="red">{error}</Notice>}
      {data.warnings.map((w) => (
        <Notice key={w}>{w}</Notice>
      ))}

      <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <div className="space-y-8">
          {shown.sections.map((section) => (
            <section key={section.id} aria-labelledby={`h-${section.id}`}>
              <h2 id={`h-${section.id}`} className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
                <span className="h-5 w-1.5 rounded-full" style={{ backgroundColor: chartColors[0] }} aria-hidden />
                {plainDashes(conversionSectionTitle(section.title, data.conversion.naming))}
              </h2>
              <div className="space-y-4">
                {section.widgets.map((widget) => (
                  <div key={widget.id} className={widget.type === "kpi" ? "" : "rounded-xl border border-slate-200 bg-white p-4 shadow-sm"}>
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
