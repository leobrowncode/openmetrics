"use client";

import { useState, useTransition } from "react";
import { renameDashboardAction } from "@/app/admin/actions/dashboards";
import { Button, inputClass, cx } from "@/components/ui";

export function DashboardTitle({ dashboardId, name }: { dashboardId: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [override, setOverride] = useState<string | null>(null);
  const [seenName, setSeenName] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (name !== seenName) {
    setSeenName(name);
    setOverride(null);
    setValue(name);
    setEditing(false);
    setError(null);
  }
  const shown = override ?? name;

  function cancel() {
    setValue(shown);
    setError(null);
    setEditing(false);
  }

  function save() {
    const next = value.trim();
    if (next === shown) {
      cancel();
      return;
    }
    if (next.length < 2 || next.length > 120) {
      setError("Le nom doit contenir entre 2 et 120 caractères.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await renameDashboardAction(dashboardId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOverride(next);
      setEditing(false);
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {editing ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancel();
                }
              }}
              className={cx(inputClass, "w-full max-w-xl py-1.5 text-base font-semibold")}
              aria-label="Nom du dashboard"
              maxLength={120}
              autoFocus
              autoComplete="off"
              disabled={pending}
              required
            />
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={pending}>
              Annuler
            </Button>
          </form>
        ) : (
          <button
            type="button"
            className="max-w-full cursor-pointer rounded-md text-left underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            title="Cliquer pour renommer"
            onClick={() => {
              setValue(shown);
              setError(null);
              setEditing(true);
            }}
          >
            {shown}
          </button>
        )}
      </h1>
      {error && (
        <p className="mt-1 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
