"use client";

import { useEffect, useRef, useState } from "react";
import { PERIOD_LABELS, PERIOD_PRESETS, formatDateFr, type DateRange, type PeriodPreset } from "@/lib/periods";
import { plainDashes } from "@/lib/text";
import { buttonClass, cx, inputClass } from "../ui";

export function PeriodPicker({
  period,
  range,
  disabled,
  onChange,
}: {
  period: PeriodPreset | "custom";
  range: DateRange;
  disabled?: boolean;
  onChange: (next: { period: PeriodPreset } | { period: "custom"; from: string; to: string }) => void;
}) {
  const [custom, setCustom] = useState(period === "custom");
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  return (
    <div className={cx("flex items-center gap-2", custom && "flex-wrap")}>
      <select
        aria-label="Période"
        className={cx(inputClass, "h-9 w-auto py-0")}
        value={custom ? "custom" : period}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === "custom") {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange({ period: e.target.value as PeriodPreset });
        }}
      >
        {PERIOD_PRESETS.map((p) => (
          <option key={p} value={p}>
            {PERIOD_LABELS[p]}
          </option>
        ))}
        <option value="custom">Personnalisée…</option>
      </select>
      {custom ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onChange({ period: "custom", from, to });
          }}
        >
          <input type="date" aria-label="Du" className={cx(inputClass, "h-9 w-auto py-0")} value={from} max={to} onChange={(e) => setFrom(e.target.value)} required />
          <span className="text-sm text-slate-500">au</span>
          <input type="date" aria-label="Au" className={cx(inputClass, "h-9 w-auto py-0")} value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
          <button type="submit" className={buttonClass("secondary", "sm")}>
            Appliquer
          </button>
        </form>
      ) : (
        <span className="inline-flex h-9 items-center whitespace-nowrap text-sm text-slate-500 tabular">
          {formatDateFr(range.from)} - {formatDateFr(range.to)}
        </span>
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
  const visible = campaigns.filter((c) => plainDashes(c.name).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={cx(buttonClass("secondary", "sm"), "h-9 max-w-72 py-0")}
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
