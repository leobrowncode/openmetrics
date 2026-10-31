import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { currentAdmin } from "@/server/auth/admin";
import { getBilan } from "@/server/dashboards/bilans";
import { getDb } from "@/server/db/client";
import { dashboards } from "@/server/db/schema";
import { loadDashboardPayload } from "@/server/dashboards/query";
import { syntheticClientHidden } from "@/server/settings/synthetic-scope";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(_request: NextRequest, ctx: RouteContext<"/admin/dashboards/[dashboardId]/bilans/[bilanId]/data">) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Session expirée." }, { status: 401, headers: NO_STORE });
  const { dashboardId, bilanId } = await ctx.params;
  const db = await getDb();
  const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, dashboardId));
  if (!dashboard || (await syntheticClientHidden(db, dashboard.clientId))) {
    return NextResponse.json({ error: "Dashboard introuvable." }, { status: 404, headers: NO_STORE });
  }
  const bilan = await getBilan(db, dashboardId, bilanId);
  if (!bilan) return NextResponse.json({ error: "Bilan introuvable." }, { status: 404, headers: NO_STORE });
  const payload = await loadDashboardPayload(db, dashboard, new URLSearchParams(), "admin", {
    range: { from: bilan.rangeFrom, to: bilan.rangeTo },
    campaignIds: bilan.campaignIds,
  });
  if ("error" in payload) return NextResponse.json(payload, { status: 400, headers: NO_STORE });
  return NextResponse.json(payload, { headers: NO_STORE });
}
