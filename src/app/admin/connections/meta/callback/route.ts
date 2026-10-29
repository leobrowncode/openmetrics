import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/app/admin/actions/context";
import { audit, currentAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { inspectToken, metaOAuthConfig, saveMetaConnection, tokenOwnerName } from "@/server/meta/connections";
import { MetaApiError } from "@/server/meta/errors";
import { obtainAccessToken } from "@/server/meta/oauth";
import { META_OAUTH_COOKIE, META_OAUTH_PATH, metaRedirectUri, type MetaOAuthResult, type PendingMetaOAuth } from "@/server/meta/oauth-flow";
import { safeEqual, verifySignedPayload } from "@/server/security/tokens";

const CODE_RE = /^[A-Za-z0-9_\-.#]{10,2048}$/;

export async function GET(request: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.redirect(new URL("/login", request.url), 303);

  const params = request.nextUrl.searchParams;
  const pending = verifySignedPayload<PendingMetaOAuth>(request.cookies.get(META_OAUTH_COOKIE)?.value);
  const finish = (result: MetaOAuthResult) => {
    const response = NextResponse.redirect(new URL(`/admin/connections?meta=${result}`, request.url), 303);
    response.cookies.set(META_OAUTH_COOKIE, "", { path: META_OAUTH_PATH, maxAge: 0 });
    return response;
  };

  const state = params.get("state") ?? "";
  if (!pending || pending.u !== admin.userId || pending.x < Date.now() || !safeEqual(pending.s, state)) return finish("state");
  if (params.get("error")) return finish("denied");
  const code = params.get("code") ?? "";
  if (!CODE_RE.test(code)) return finish("error");
  const config = metaOAuthConfig();
  if (!config) return finish("unavailable");

  try {
    const { accessToken, info } = await obtainAccessToken(config, { code, redirectUri: metaRedirectUri(await appOrigin()) });
    const { scopes, canRead } = await inspectToken(accessToken);
    if (!canRead) return finish("no_ads_read");
    const owner = pending.c ? null : await tokenOwnerName(accessToken);
    const db = await getDb();
    const id = await saveMetaConnection(db, {
      connectionId: pending.c,
      label: owner ? `Meta - ${owner}` : "Connexion Meta",
      token: accessToken,
      scopes,
      expiresAt: info.expiresAt,
    });
    await audit(db, admin.email, pending.c ? "connection.reconnect" : "connection.create", "meta_connection", id, {
      scopes,
      method: "oauth",
      tokenType: info.type,
    });
    return finish("connected");
  } catch (error) {
    // Only the classification is logged: messages could echo request data.
    console.warn("Meta OAuth callback failed", error instanceof MetaApiError ? { kind: error.kind, code: error.code } : "unexpected");
    return finish("error");
  }
}
