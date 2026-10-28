"use client";

import { ActionForm } from "@/components/admin/ActionForm";
import { createBilanAction } from "@/app/admin/actions/bilans";
import { formatDateFr, type DateRange } from "@/lib/periods";
import { buttonClass, Field, inputClass } from "../ui";

export function GenerateBilan({
  dashboardId,
  campaignIds,
  campaigns,
  range,
}: {
  dashboardId: string;
  campaignIds: string[];
  campaigns: Array<{ id: string; name: string }>;
  range: DateRange;
}) {
  if (campaignIds.length === 0) {
    return (
      <button type="button" className={buttonClass("secondary", "sm")} disabled title="Cochez au moins une campagne">
        Générer un bilan
      </button>
    );
  }

  const names = campaignIds.map((id) => campaigns.find((c) => c.id === id)?.name).filter((name): name is string => Boolean(name));
  const defaultName = (names.length === 1 ? `Bilan — ${names[0]}` : `Bilan — ${campaignIds.length} campagnes`).slice(0, 120);

  return (
    <details className="relative">
      <summary className={`${buttonClass("secondary", "sm")} cursor-pointer list-none`}>Générer un bilan</summary>
      <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
        <p className="mb-2 text-xs text-slate-500">
          {formatDateFr(range.from)} – {formatDateFr(range.to)} · {campaignIds.length} campagne{campaignIds.length > 1 ? "s" : ""}. Les dates ne bougeront plus.
        </p>
        <ActionForm action={createBilanAction} hidden={{ dashboardId, from: range.from, to: range.to }} submitLabel="Enregistrer le bilan">
          <Field label="Nom">
            <input name="name" required maxLength={120} defaultValue={defaultName} className={inputClass} />
          </Field>
          {campaignIds.map((id) => (
            <input key={id} type="hidden" name="campaignIds" value={id} />
          ))}
        </ActionForm>
      </div>
    </details>
  );
}
