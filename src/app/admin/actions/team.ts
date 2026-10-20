"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_COOKIE, addAdminUser, changePassword, passwordProblem, removeAdminUser } from "@/server/auth/admin";
import { adminContext, formString, type ActionState } from "./context";

const emailSchema = z.string().email().max(200);

export async function addAdminAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const email = formString(formData, "email").toLowerCase();
  const password = formData.get("password");
  if (!emailSchema.safeParse(email).success) return { error: "Adresse e-mail invalide." };
  if (typeof password !== "string") return { error: "Mot de passe requis." };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (!(await addAdminUser(db, email, password))) return { error: "Un administrateur existe déjà avec cette adresse." };
  await log("admin.add", "admin_user", null, { email });
  revalidatePath("/admin/team");
  return { ok: true, message: `${email} peut maintenant se connecter. Transmettez-lui le mot de passe par un canal séparé et demandez-lui de le changer.` };
}

export async function changePasswordAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, admin, log } = await adminContext();
  const current = formData.get("current");
  const next = formData.get("next");
  const confirm = formData.get("confirm");
  if (typeof current !== "string" || typeof next !== "string" || typeof confirm !== "string") return { error: "Formulaire incomplet." };
  if (next !== confirm) return { error: "La confirmation ne correspond pas au nouveau mot de passe." };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  const result = await changePassword(db, admin.userId, current, next, (await cookies()).get(ADMIN_COOKIE)?.value ?? null);
  if (result === "rate_limited") return { error: "Trop de tentatives. Réessayez dans 15 minutes." };
  if (result === "invalid") return { error: "Mot de passe actuel incorrect." };
  await log("admin.change_password", "admin_user", admin.userId);
  return { ok: true, message: "Mot de passe modifié. Vos autres sessions ont été déconnectées." };
}

export async function removeAdminAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, admin, log } = await adminContext();
  const userId = formString(formData, "userId");
  const result = await removeAdminUser(db, admin.userId, userId);
  if (result === "self") return { error: "Vous ne pouvez pas retirer votre propre accès." };
  if (result === "last") return { error: "Il doit rester au moins un administrateur." };
  if (result === "not_found") return { error: "Administrateur introuvable." };
  await log("admin.remove", "admin_user", userId);
  revalidatePath("/admin/team");
  return { ok: true, message: "Accès retiré : ses sessions ont été fermées immédiatement." };
}
