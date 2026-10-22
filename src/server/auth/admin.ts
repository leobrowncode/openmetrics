import "server-only";
import { cache } from "react";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, type Db } from "../db/client";
import { adminSessions, adminUsers, auditLog } from "../db/schema";
import { isProduction } from "../env";
import { hashPassword, verifyPassword } from "../security/password";
import { rateLimit } from "../security/rate-limit";
import { generateToken, hashToken, isWellFormedToken } from "../security/tokens";

export const ADMIN_COOKIE = "om_admin";
const SESSION_HOURS = 12;

export interface AdminIdentity {
  userId: string;
  email: string;
}

export async function createAdminUser(db: Db, email: string, password: string): Promise<void> {
  await db
    .insert(adminUsers)
    .values({ email: email.toLowerCase(), passwordHash: await hashPassword(password) })
    .onConflictDoNothing();
}

export const PASSWORD_MIN_LENGTH = 12;

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  if (password.length > 200) return "Mot de passe trop long.";
  return null;
}

/**
 * Creates the bootstrap admin, or replaces that account's password when
 * `ADMIN_PASSWORD` has changed. Other admins are left untouched. A replacement
 * ends every session of this account. Surrounding whitespace is ignored so a
 * trailing newline from the host does not make the typed password fail.
 * Returns "unchanged" when the stored hash already matches.
 */
export async function syncEnvAdmin(
  db: Db,
  email: string,
  password: string,
): Promise<"created" | "updated" | "unchanged"> {
  const normalized = email.trim().toLowerCase();
  // Drop a trailing newline from the host, but keep a password that is only spaces.
  const secret = password.trim() || password;
  if (!normalized || !secret) return "unchanged";

  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, normalized));
  if (!user) {
    await createAdminUser(db, normalized, secret);
    return "created";
  }
  if (await verifyPassword(secret, user.passwordHash)) return "unchanged";

  await db.update(adminUsers).set({ passwordHash: await hashPassword(secret) }).where(eq(adminUsers.id, user.id));
  await db.delete(adminSessions).where(eq(adminSessions.userId, user.id));
  await audit(db, "env", "admin.password_sync", "admin_user", user.id);
  return "updated";
}

/** Returns false when the email is already used. */
export async function addAdminUser(db: Db, email: string, password: string): Promise<boolean> {
  const rows = await db
    .insert(adminUsers)
    .values({ email: email.toLowerCase(), passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning({ id: adminUsers.id });
  return rows.length > 0;
}

/** Verifies the current password, stores the new one and ends every other session of this admin. */
export async function changePassword(
  db: Db,
  userId: string,
  current: string,
  next: string,
  keepSessionToken: string | null,
): Promise<"ok" | "invalid" | "rate_limited"> {
  const limit = await rateLimit(db, `password:${userId}`, 8, 15 * 60);
  if (!limit.allowed) return "rate_limited";
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, userId));
  if (!user || !(await verifyPassword(current, user.passwordHash))) return "invalid";
  await db.update(adminUsers).set({ passwordHash: await hashPassword(next) }).where(eq(adminUsers.id, userId));
  const keepHash = keepSessionToken && isWellFormedToken(keepSessionToken) ? hashToken(keepSessionToken, "session") : "";
  await db.delete(adminSessions).where(and(eq(adminSessions.userId, userId), ne(adminSessions.tokenHash, keepHash)));
  return "ok";
}

/** Deleting cascades to the admin's sessions, so access stops immediately. */
export async function removeAdminUser(db: Db, actorId: string, userId: string): Promise<"ok" | "self" | "last" | "not_found"> {
  if (actorId === userId) return "self";
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(adminUsers);
  if (count <= 1) return "last";
  const rows = await db.delete(adminUsers).where(eq(adminUsers.id, userId)).returning({ id: adminUsers.id });
  return rows.length ? "ok" : "not_found";
}

export async function authenticate(
  db: Db,
  email: string,
  password: string,
): Promise<{ token: string; expiresAt: Date; identity: AdminIdentity } | null> {
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email.toLowerCase()));
  // Hash anyway on unknown users to keep timing similar.
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : (await hashPassword(password), false);
  if (!user || !ok) return null;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  await db.insert(adminSessions).values({ userId: user.id, tokenHash: hashToken(token, "session"), expiresAt });
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date()));
  return { token, expiresAt, identity: { userId: user.id, email: user.email } };
}

export async function resolveSession(db: Db, token: unknown): Promise<AdminIdentity | null> {
  if (!isWellFormedToken(token)) return null;
  const [row] = await db
    .select({ userId: adminUsers.id, email: adminUsers.email })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
    .where(and(eq(adminSessions.tokenHash, hashToken(token, "session")), gt(adminSessions.expiresAt, new Date())));
  return row ?? null;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function loginWithPassword(email: string, password: string): Promise<"ok" | "invalid" | "rate_limited"> {
  const db = await getDb();
  const ip = await clientIp();
  const perIp = await rateLimit(db, `login:ip:${ip}`, 20, 15 * 60);
  const perEmail = await rateLimit(db, `login:email:${email.toLowerCase()}`, 8, 15 * 60);
  if (!perIp.allowed || !perEmail.allowed) return "rate_limited";

  const session = await authenticate(db, email, password);
  if (!session) return "invalid";
  (await cookies()).set(ADMIN_COOKIE, session.token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  await audit(db, session.identity.email, "admin.login", "admin_user", session.identity.userId);
  return "ok";
}

export async function logout(): Promise<void> {
  const db = await getDb();
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (isWellFormedToken(token)) {
    await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(token, "session")));
  }
  store.delete(ADMIN_COOKIE);
}

/** Deduped for the request: the admin layout and the page both check the session. */
export const currentAdmin = cache(async (): Promise<AdminIdentity | null> => {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return resolveSession(await getDb(), token);
});

/** Use at the top of every admin page and server action. */
export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  return admin;
}

export async function audit(
  db: Db,
  actor: string,
  action: string,
  targetType: string,
  targetId: string | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLog).values({ actor, action, targetType, targetId, detail });
}
