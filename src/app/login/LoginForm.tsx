"use client";

import { useActionState } from "react";
import { Button, Card, Field, Notice, inputClass } from "@/components/ui";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        <Field label="E-mail">
          <input name="email" type="email" autoComplete="username" required className={inputClass} />
        </Field>
        <Field label="Mot de passe">
          <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
        </Field>
        {state?.error && <Notice tone="red">{state.error}</Notice>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
    </Card>
  );
}
