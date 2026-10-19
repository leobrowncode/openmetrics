import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { env } from "@/server/env";
import { safeEqual } from "@/server/security/tokens";
import { syncAllAccounts } from "@/server/sync/sync-service";

export const maxDuration = 300;

/** Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  const secret = env().CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const results = await syncAllAccounts(db, { budgetMs: 240_000, trigger: "cron" });
  return NextResponse.json({
    synced: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "error").length,
    skipped: results.filter((r) => r.status === "skipped").length,
  });
}
