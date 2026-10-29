import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { getBilan } from "@/server/dashboards/bilans";
import { loadDashboardPayload } from "@/server/dashboards/query";
import { rateLimit } from "@/server/security/rate-limit";
import { verifyViewer, VIEWER_RESPONSE_HEADERS } from "@/server/share/viewer-session";

export async function GET(request: NextRequest, ctx: RouteContext<"/share/[linkId]/data">) {
  const { linkId } = await ctx.params;
  const db = await getDb();

  const limit = await rateLimit(db, `share-data:${linkId}`, 240, 600);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Patientez quelques instants." },
      { status: 429, headers: { ...VIEWER_RESPONSE_HEADERS, "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const share = await verifyViewer(db, linkId);
  if (!share) {
    return NextResponse.json({ error: "Ce lien n'est plus valide." }, { status: 401, headers: VIEWER_RESPONSE_HEADERS });
  }

  const bilan = share.link.bilanId ? await getBilan(db, share.dashboard.id, share.link.bilanId) : null;
  if (share.link.bilanId && !bilan) {
    return NextResponse.json({ error: "Ce lien n'est plus valide." }, { status: 401, headers: VIEWER_RESPONSE_HEADERS });
  }
  const lock = bilan ? { range: { from: bilan.rangeFrom, to: bilan.rangeTo }, campaignIds: bilan.campaignIds } : undefined;
  const payload = await loadDashboardPayload(db, share.dashboard, request.nextUrl.searchParams, "viewer", lock);
  if ("error" in payload) {
    return NextResponse.json({ error: payload.error }, { status: 400, headers: VIEWER_RESPONSE_HEADERS });
  }
  return NextResponse.json(payload, { headers: VIEWER_RESPONSE_HEADERS });
}
