import "server-only";
import { cookies } from "next/headers";
import type { Db } from "../db/client";
import { isProduction } from "../env";
import { verifyShareToken, type VerifiedShare } from "./share-links";

export const SHARE_COOKIE = "om_share";
const MAX_COOKIE_SECONDS = 8 * 3600;

export const VIEWER_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
  "Referrer-Policy": "no-referrer",
} as const;

export function shareCookiePath(linkId: string): string {
  return `/share/${linkId}`;
}

/** Cookie scoped to the dashboard path; it holds the token so each request is re-verified. */
export async function setShareCookie(share: VerifiedShare, token: string): Promise<void> {
  const untilExpiry = share.link.expiresAt
    ? Math.floor((share.link.expiresAt.getTime() - Date.now()) / 1000)
    : MAX_COOKIE_SECONDS;
  (await cookies()).set(SHARE_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "strict",
    path: shareCookiePath(share.link.id),
    maxAge: Math.max(1, Math.min(MAX_COOKIE_SECONDS, untilExpiry)),
  });
}

export async function verifyViewer(db: Db, linkId: string): Promise<VerifiedShare | null> {
  const token = (await cookies()).get(SHARE_COOKIE)?.value;
  return verifyShareToken(db, token, { expectedLinkId: linkId });
}
