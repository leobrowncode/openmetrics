"use client";

import { useRef } from "react";
import Link from "next/link";
import { createClientAction } from "@/app/admin/actions/clients";
import { suggestedClientName } from "@/lib/account-search";
import { Field, Notice, inputClass } from "../ui";
import { ActionForm } from "./ActionForm";
import { AdAccountPicker, type AdAccountOption } from "./AdAccountPicker";

export function NewClientForm({
  accounts,
  errors,
  connectionCount,
}: {
  accounts: AdAccountOption[];
  errors: Array<{ connectionId: string; connectionLabel: string; message: string }>;
  connectionCount: number;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const autoName = useRef("");

  function onSelect(account: AdAccountOption | null) {
    const input = nameRef.current;
    if (!input) return;
    if (!account) {
      if (input.value === autoName.current) input.value = "";
      autoName.current = "";
      return;
    }
    const suggestion = suggestedClientName(account.name);
    if (suggestion.length < 2) return;
    if (input.value === "" || input.value === autoName.current) {
      input.value = suggestion;
      autoName.current = suggestion;
    }
  }

  return (
    <ActionForm action={createClientAction} submitLabel="Créer le client">
      {connectionCount === 0 ? (
        <Notice>
          Aucune connexion Meta active. <Link className="underline" href="/admin/connections">Ajouter une connexion</Link> pour choisir parmi les comptes déjà autorisés.
        </Notice>
      ) : (
        <>
          {errors.map((error) => (
            <Notice key={error.connectionId} tone="red">
              {error.connectionLabel} : {error.message}
            </Notice>
          ))}
          {accounts.length === 0 && errors.length === 0 ? (
            <p className="text-sm text-slate-500">Tous les comptes accessibles via Meta sont déjà rattachés à un client.</p>
          ) : accounts.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-slate-700">Comptes déjà connectés</p>
              <AdAccountPicker accounts={accounts} onSelect={onSelect} />
            </div>
          ) : null}
        </>
      )}
      <Field label="Nom du client" hint={accounts.length > 0 ? "Proposé à partir du compte choisi. Vous pouvez le modifier." : undefined}>
        <input ref={nameRef} name="name" required minLength={2} maxLength={120} className={inputClass} placeholder="Ex. Le Rocher" />
      </Field>
    </ActionForm>
  );
}
