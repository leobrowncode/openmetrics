"use client";

import { useEffect, useState } from "react";

/** Returns an error message, or navigates to the dashboard on success. */
async function exchange(token: string | null): Promise<string | null> {
  if (!token) return "Lien incomplet. Vérifiez que vous avez copié l'adresse en entier.";
  try {
    const res = await fetch("/api/share/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      credentials: "same-origin",
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.linkId) return body?.error ?? "Ce lien n'est pas valide.";
    window.location.replace(`/share/${body.linkId}`);
    return null;
  } catch {
    return "Connexion impossible. Vérifiez votre réseau puis réessayez.";
  }
}

/** Reads the token from the URL fragment (never sent to servers) and exchanges it for a scoped cookie. */
export function ShareExchange() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("t");
    window.history.replaceState(null, "", window.location.pathname);
    exchange(token).then(setError);
  }, []);

  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      {error ? (
        <>
          <p className="text-base font-semibold text-slate-900">Accès impossible</p>
          <p className="mt-2 text-sm text-slate-600" role="alert">
            {error}
          </p>
        </>
      ) : (
        <>
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" aria-hidden />
          <p className="mt-4 text-sm text-slate-600">Ouverture du reporting…</p>
        </>
      )}
    </div>
  );
}
