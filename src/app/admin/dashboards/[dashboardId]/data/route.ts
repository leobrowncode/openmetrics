import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { currentAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { dashboards } from "@/server/db/schema";
import { loadDashboardPayload } from "@/server/dashboards/query";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: NextRequest, ctx: RouteContext<"/admin/dashboards/[dashboardId]/data">) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Session expirée." }, { status: 401, headers: NO_STORE });
  const { dashboardId } = await ctx.params;
  const db = await getDb();
  const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, dashboardId));
  if (!dashboard) return NextResponse.json({ error: "Dashboard introuvable." }, { status: 404, headers: NO_STORE });
  const payload = await loadDashboardPayload(db, dashboard, request.nextUrl.searchParams, "admin");
  if ("error" in payload) return NextResponse.json(payload, { status: 400, headers: NO_STORE });
  return NextResponse.json(payload, { headers: NO_STORE });
}
