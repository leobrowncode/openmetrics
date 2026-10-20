import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { rateLimit } from "@/server/security/rate-limit";
import { recordShareAccess, verifyShareToken } from "@/server/share/share-links";
import { setShareCookie, VIEWER_RESPONSE_HEADERS } from "@/server/share/viewer-session";

export async function POST(request: NextRequest) {
  const db = await getDb();
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = await rateLimit(db, `share-session:${ip}`, 30, 600);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { ...VIEWER_RESPONSE_HEADERS, "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const share = await verifyShareToken(db, body?.token);
  if (!share) {
    return NextResponse.json(
      { error: "Ce lien n'est pas valide, a expiré ou a été révoqué. Contactez votre agence pour en obtenir un nouveau." },
      { status: 401, headers: VIEWER_RESPONSE_HEADERS },
    );
  }

  await setShareCookie(share, body!.token as string);
  await recordShareAccess(db, share.link.id);
  return NextResponse.json({ linkId: share.link.id }, { headers: VIEWER_RESPONSE_HEADERS });
}
