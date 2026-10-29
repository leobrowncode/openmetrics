"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateChartColorsAction } from "@/app/admin/actions/dashboards";
import {
  CHART_COLOR_GROUPS,
  CHART_SERIES_LABELS,
  DEFAULT_CHART_COLORS,
  colorsEqual,
} from "@/lib/chart-colors";
import { buttonClass, cx } from "@/components/ui";

export function ChartColorEditor({
  dashboardId,
  initialColors,
  onColorsChange,
  variant = "popover",
}: {
  dashboardId: string;
  initialColors: readonly string[];
  onColorsChange?: (colors: string[]) => void;
  variant?: "popover" | "panel";
}) {
  const [open, setOpen] = useState(variant === "panel");
  const [colors, setColors] = useState<string[]>([...initialColors]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const savedColors = useRef<string[]>([...initialColors]);
  const request = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (variant === "panel" || !open) return;
    const onPointer = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, variant]);

  function persist(next: string[]) {
    const id = ++request.current;
    setColors(next);
    onColorsChange?.(next);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateChartColorsAction(dashboardId, next);
      if (id !== request.current) return;
      if (result.error) {
        const previous = [...savedColors.current];
        setColors(previous);
        onColorsChange?.(previous);
        setError(result.error);
        return;
      }
      savedColors.current = next;
      setColors(next);
      onColorsChange?.(next);
      setSaved(true);
    });
  }

  function apply(hex: string) {
    if (colors[active] === hex) return;
    const next = colors.map((color, index) => (index === active ? hex : color));
    persist(next);
  }

  const isDefault = colorsEqual(colors, DEFAULT_CHART_COLORS);
  const status = error ? error : pending ? "Enregistrement…" : saved ? "Couleurs enregistrées pour ce dashboard." : null;

  const panel = (
    <div className="space-y-3">
      {variant === "popover" && <p className="text-sm font-semibold text-slate-900">Couleurs des courbes</p>}
      <p className="text-xs text-slate-500">
        Propres à ce dashboard. La courbe 1 colore la première série de chaque graphique, la courbe 2 la suivante.
      </p>
      <div role="radiogroup" aria-label="Courbe à colorer" className="flex flex-wrap gap-2">
        {CHART_SERIES_LABELS.map((label, index) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={active === index}
            onClick={() => setActive(index)}
            className={cx(
              "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
              active === index ? "border-slate-900 bg-slate-50 text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50",
            )}
          >
            <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ backgroundColor: colors[index] }} aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <div className="grid w-fit grid-cols-5 gap-1.5 p-0.5">
        {CHART_COLOR_GROUPS.flatMap((group) =>
          group.shades.map((hex, shadeIndex) => {
            const selected = colors[active] === hex;
            return (
              <button
                key={hex}
                type="button"
                aria-label={`${group.label}, nuance ${shadeIndex + 1}`}
                aria-pressed={selected}
                title={hex}
                onClick={() => apply(hex)}
                className={cx(
                  "h-6 w-6 rounded-full border border-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                  selected ? "ring-2 ring-slate-900 ring-offset-2" : "hover:ring-2 hover:ring-slate-300 hover:ring-offset-1",
                )}
                style={{ backgroundColor: hex }}
              />
            );
          }),
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className={buttonClass("ghost", "sm")}
          disabled={pending || isDefault}
          onClick={() => persist([...DEFAULT_CHART_COLORS])}
        >
          Réinitialiser
        </button>
        {status && (
          <p className={cx("text-xs", error ? "text-red-700" : "text-slate-500")} role={error ? "alert" : "status"} aria-live="polite">
            {status}
          </p>
        )}
      </div>
    </div>
  );

  if (variant === "panel") {
    return (
      <section aria-label="Couleurs des courbes" className="space-y-3">
        {panel}
      </section>
    );
  }

  return (
    <div ref={root}>
      <button
        type="button"
        className={cx(buttonClass("secondary", "sm"), "h-9 py-0")}
        aria-expanded={open}
        aria-controls={open ? "chart-color-panel" : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        Couleurs
      </button>
      {open && (
        <div
          id="chart-color-panel"
          className="fixed bottom-3 left-3 right-3 z-30 max-h-[min(32rem,calc(100dvh-1.5rem))] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:mt-2 sm:w-[22rem]"
        >
          {panel}
        </div>
      )}
    </div>
  );
}
