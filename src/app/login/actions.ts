"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { loginWithPassword, logout } from "@/server/auth/admin";

const schema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export async function loginAction(_prev: { error?: string } | null, formData: FormData): Promise<{ error?: string }> {
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "E-mail ou mot de passe invalide." };
  const result = await loginWithPassword(parsed.data.email, parsed.data.password);
  if (result === "rate_limited") return { error: "Trop de tentatives. Réessayez dans 15 minutes." };
  if (result === "invalid") return { error: "E-mail ou mot de passe incorrect." };
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}
