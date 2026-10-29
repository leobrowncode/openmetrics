"use client";

import { useActionState, useState, type ReactNode } from "react";
import type { ActionState } from "@/app/admin/actions/context";
import { Button, Notice, inputClass, cx } from "../ui";

type Action = (prev: ActionState | null, formData: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  variant = "primary",
  className,
  hidden,
}: {
  action: Action;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={cx("space-y-3", className)}>
      {hidden && Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      {children}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? (pendingLabel ?? "En cours…") : submitLabel}
      </Button>
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      {state?.message && <Notice tone="green">{state.message}</Notice>}
      {state?.shareUrl && <ShareUrlReveal url={state.shareUrl} />}
    </form>
  );
}

export function ShareUrlReveal({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-lg border border-brand-100 bg-brand-50 p-4">
      <p className="text-sm font-semibold text-brand-700">Lien privé généré - copiez-le maintenant</p>
      <p className="text-xs text-slate-600">
        Ce lien ne sera plus jamais affiché (seule son empreinte est conservée). Toute personne qui le possède peut consulter ce dashboard
        jusqu&apos;à sa révocation ou son expiration.
      </p>
      <div className="flex gap-2">
        <input readOnly value={url} className={cx(inputClass, "font-mono text-xs")} onFocus={(e) => e.currentTarget.select()} aria-label="Lien privé" />
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? "Copié" : "Copier"}
        </Button>
      </div>
    </div>
  );
}
