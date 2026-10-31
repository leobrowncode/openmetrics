"use client";

import { useEffect, useRef, useState } from "react";
import { compareLabels } from "@/lib/account-search";
import { PERIOD_LABELS, PERIOD_PRESETS, formatDateFr, type DateRange, type PeriodPreset } from "@/lib/periods";
import { plainDashes } from "@/lib/text";
import { buttonClass, cx, inputClass, toolbarButtonClass, toolbarControlClass } from "../ui";

export function PeriodReadout({ range, compare }: { range: DateRange; compare?: DateRange | null }) {
  return (
    <span className="inline-flex h-10 items-center gap-2 whitespace-nowrap text-sm tabular">
      <span className="text-slate-700">
        <span className="sr-only">Période sélectionnée : </span>
        {formatDateFr(range.from)} - {formatDateFr(range.to)}
      </span>
      {compare && <CompareReadout compare={compare} />}
    </span>
  );
}

function CompareReadout({ compare }: { compare: DateRange }) {
  return (
    <span className="text-slate-500">
      <span className="sr-only">Comparé à </span>
      <span aria-hidden>vs </span>
      {formatDateFr(compare.from)} - {formatDateFr(compare.to)}
    </span>
  );
}

export function PeriodPicker({
  period,
  range,
  compare,
  disabled,
  onChange,
}: {
  period: PeriodPreset | "custom" | "since_start";
  range: DateRange;
  compare?: DateRange | null;
  disabled?: boolean;
  onChange: (
    next: { period: PeriodPreset } | { period: "since_start" } | { period: "custom"; from: string; to: string },
  ) => void;
}) {
  const [custom, setCustom] = useState(period === "custom");
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Période"
        className={toolbarControlClass}
        value={custom ? "custom" : period}
        disabled={disabled}
        onChange={(e) => {
          const value = e.target.value;
          if (value === "custom") {
            setCustom(true);
            return;
          }
          setCustom(false);
          if (value === "since_start") onChange({ period: "since_start" });
          else onChange({ period: value as PeriodPreset });
        }}
      >
        {PERIOD_PRESETS.map((p) => (
          <option key={p} value={p}>
            {PERIOD_LABELS[p]}
          </option>
        ))}
        <option value="since_start">Depuis le début</option>
        <option value="custom">Personnalisée…</option>
      </select>
      {custom ? (
        <>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onChange({ period: "custom", from, to });
            }}
          >
            <input type="date" aria-label="Du" className={toolbarControlClass} value={from} max={to} onChange={(e) => setFrom(e.target.value)} required />
            <span className="text-sm text-slate-500">au</span>
            <input type="date" aria-label="Au" className={toolbarControlClass} value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
            <button type="submit" className={toolbarButtonClass}>
              Appliquer
            </button>
          </form>
          {compare && (
            <span className="inline-flex h-10 items-center whitespace-nowrap text-sm tabular">
              <CompareReadout compare={compare} />
            </span>
          )}
        </>
      ) : (
        <PeriodReadout range={range} compare={compare} />
      )}
    </div>
  );
}

export function CampaignFilter({
  campaigns,
  selected,
  onChange,
}: {
  campaigns: Array<{ id: string; name: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const label =
    selected.length === 0
      ? "Toutes les campagnes"
      : selected.length === 1
        ? (plainDashes(campaigns.find((c) => c.id === selected[0])?.name ?? "") || "1 campagne")
        : `${selected.length} campagnes`;
  const visible = [...campaigns]
    .sort((a, b) => compareLabels(a.name, b.name))
    .filter((c) => plainDashes(c.name).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={cx(toolbarButtonClass, "max-w-72")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{label}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <input
            className={cx(inputClass, "mb-2 py-1.5")}
            placeholder="Rechercher une campagne"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-64 space-y-1 overflow-y-auto" role="listbox" aria-multiselectable>
            {visible.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={draft.includes(c.id)}
                  onChange={(e) => setDraft(e.target.checked ? [...draft, c.id] : draft.filter((id) => id !== c.id))}
                />
                <span className="text-slate-800">{plainDashes(c.name)}</span>
              </label>
            ))}
            {visible.length === 0 && <p className="px-2 py-1.5 text-sm text-slate-500">Aucune campagne.</p>}
          </div>
          <div className="mt-3 flex justify-between gap-2 border-t border-slate-100 pt-3">
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setDraft([])}>
              Tout désélectionner
            </button>
            <button
              type="button"
              className={buttonClass("primary", "sm")}
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              Appliquer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
