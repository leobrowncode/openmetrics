import { NextResponse, type NextRequest } from "next/server";
import { getPublicDemoDashboard } from "@/server/demo/public-demo";
import { getDb } from "@/server/db/client";
import { loadDashboardPayload } from "@/server/dashboards/query";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: NextRequest, ctx: RouteContext<"/demo/[dashboardId]/data">) {
  const { dashboardId } = await ctx.params;
  const db = await getDb();
  const demo = await getPublicDemoDashboard(db, dashboardId);
  if (!demo) return NextResponse.json({ error: "Dashboard introuvable." }, { status: 404, headers: NO_STORE });
  const payload = await loadDashboardPayload(db, demo.dashboard, request.nextUrl.searchParams, "viewer");
  if ("error" in payload) return NextResponse.json(payload, { status: 400, headers: NO_STORE });
  return NextResponse.json(payload, { headers: NO_STORE });
}
