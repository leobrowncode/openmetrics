import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/app/admin/actions/context";
import { currentAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { metaConnections } from "@/server/db/schema";
import { isProduction } from "@/server/env";
import { metaOAuthConfig } from "@/server/meta/connections";
import { buildAuthorizeUrl } from "@/server/meta/oauth";
import { META_OAUTH_COOKIE, META_OAUTH_PATH, META_OAUTH_TTL_SECONDS, metaRedirectUri, type PendingMetaOAuth } from "@/server/meta/oauth-flow";
import { generateToken, signPayload } from "@/server/security/tokens";

export async function GET(request: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.redirect(new URL("/login", request.url), 303);

  const config = metaOAuthConfig();
  if (!config) return NextResponse.redirect(new URL("/admin/connections?meta=unavailable", request.url), 303);

  let connectionId: string | null = request.nextUrl.searchParams.get("connectionId");
  if (connectionId) {
    const db = await getDb();
    const [row] = await db.select({ kind: metaConnections.kind }).from(metaConnections).where(eq(metaConnections.id, connectionId));
    if (row?.kind !== "meta") connectionId = null;
  }

  const state = generateToken();
  const pending: PendingMetaOAuth = { s: state, u: admin.userId, c: connectionId, x: Date.now() + META_OAUTH_TTL_SECONDS * 1000 };
  const response = NextResponse.redirect(buildAuthorizeUrl(config, { redirectUri: metaRedirectUri(await appOrigin()), state }), 303);
  response.cookies.set(META_OAUTH_COOKIE, signPayload(pending), {
    httpOnly: true,
    secure: isProduction(),
    // Lax: the callback is a top-level navigation coming back from facebook.com.
    sameSite: "lax",
    path: META_OAUTH_PATH,
    maxAge: META_OAUTH_TTL_SECONDS,
  });
  return response;
}
