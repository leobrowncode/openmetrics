import "server-only";
import { createHash } from "node:crypto";
import { and, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { rateLimits } from "../db/schema";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter stored in Postgres, so limits hold across serverless
 * instances without an extra service. Keys are hashed so IPs are not stored.
 */
export async function rateLimit(
  db: Db,
  rawKey: string,
  limit: number,
  windowSeconds: number,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const key = createHash("sha256").update(rawKey).digest("hex").slice(0, 32);
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  if (Math.random() < 0.01) {
    await db.delete(rateLimits).where(and(lt(rateLimits.windowStart, new Date(now.getTime() - 86_400_000))));
  }

  const count = row?.count ?? 1;
  const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds };
}
