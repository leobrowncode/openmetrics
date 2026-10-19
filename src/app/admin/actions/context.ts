import "server-only";
import { headers } from "next/headers";
import { audit, requireAdmin, type AdminIdentity } from "@/server/auth/admin";
import { getDb, type Db } from "@/server/db/client";
import { env, isProduction } from "@/server/env";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  shareUrl?: string;
}

export async function adminContext(): Promise<{ admin: AdminIdentity; db: Db; log: (action: string, targetType: string, targetId: string | null, detail?: Record<string, unknown>) => Promise<void> }> {
  const admin = await requireAdmin();
  const db = await getDb();
  return {
    admin,
    db,
    log: (action, targetType, targetId, detail) => audit(db, admin.email, action, targetType, targetId, detail),
  };
}

export async function appOrigin(): Promise<string> {
  const configured = env().APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = isProduction() ? "https" : (h.get("x-forwarded-proto") ?? "http");
  return `${proto}://${host}`;
}

export function shareUrl(origin: string, token: string): string {
  return `${origin}/share#t=${token}`;
}

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
