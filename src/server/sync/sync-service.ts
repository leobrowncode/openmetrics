import "server-only";
import { and, asc, between, eq, isNull, lt, or, sql } from "drizzle-orm";
import { addDays, todayInTimezone, type DateRange } from "@/lib/periods";
import type { Db } from "../db/client";
import { adAccounts, campaigns, insightsDaily, metaConnections, syncRuns } from "../db/schema";
import { env } from "../env";
import { decryptSecret } from "../security/encryption";
import { createDemoSource } from "../meta/demo-source";
import { describeMetaError, MetaApiError } from "../meta/errors";
import { createMetaSource, type InsightsSource } from "../meta/source";
import { normalizeInsightRow, NormalizationError, type NormalizedInsight } from "./normalize";

/** Conversions keep changing for ~28 days because of click attribution windows. */
export const ATTRIBUTION_REFRESH_DAYS = 28;
/** First sync history; Meta keeps 37 months of non-breakdown totals. */
export const INITIAL_BACKFILL_DAYS = 395;
const CHUNK_DAYS = 31;
const LOCK_MINUTES = 15;
const INSERT_BATCH = 500;

export type SyncTrigger = "cron" | "manual" | "backfill";

export interface SyncResult {
  runId: string | null;
  status: "success" | "error" | "skipped";
  rowsWritten: number;
  range: DateRange | null;
  errorMessage?: string;
}

type Connection = typeof metaConnections.$inferSelect;
export type SourceFactory = (connection: Connection) => InsightsSource;

export const defaultSourceFactory: SourceFactory = (connection) => {
  if (connection.kind === "demo") return createDemoSource();
  if (!connection.encryptedToken) throw new Error("Connexion Meta sans token.");
  return createMetaSource({
    accessToken: decryptSecret(connection.encryptedToken),
    apiVersion: env().META_GRAPH_API_VERSION,
    appSecret: env().META_APP_SECRET,
  });
};

export function splitRange(range: DateRange, chunkDays = CHUNK_DAYS): DateRange[] {
  const chunks: DateRange[] = [];
  for (let from = range.from; from <= range.to; from = addDays(from, chunkDays)) {
    const to = addDays(from, chunkDays - 1);
    chunks.push({ from, to: to < range.to ? to : range.to });
  }
  return chunks;
}

export function defaultSyncRange(
  timezoneName: string,
  lastSyncedAt: Date | null,
  now: Date = new Date(),
): DateRange {
  const today = todayInTimezone(timezoneName, now);
  const lookback = lastSyncedAt ? ATTRIBUTION_REFRESH_DAYS : INITIAL_BACKFILL_DAYS;
  return { from: addDays(today, -lookback), to: today };
}

function toErrorInfo(error: unknown): { code: string; message: string } {
  if (error instanceof MetaApiError) {
    return { code: `meta_${error.kind}${error.code ? `_${error.code}` : ""}`, message: describeMetaError(error) };
  }
  if (error instanceof NormalizationError) return { code: "normalization", message: error.message };
  return { code: "internal", message: "Erreur interne pendant la synchronisation." };
}

async function acquireLock(db: Db, accountId: string, now: Date): Promise<boolean> {
  const locked = await db
    .update(adAccounts)
    .set({ syncLockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) })
    .where(
      and(
        eq(adAccounts.id, accountId),
        or(isNull(adAccounts.syncLockedUntil), lt(adAccounts.syncLockedUntil, now)),
      ),
    )
    .returning({ id: adAccounts.id });
  return locked.length === 1;
}

async function writeChunk(db: Db, accountId: string, chunk: DateRange, rows: NormalizedInsight[]): Promise<void> {
  await db.transaction(async (tx) => {
    // Replace the whole window: rows Meta no longer returns (e.g. zeroed days) disappear too.
    await tx
      .delete(insightsDaily)
      .where(and(eq(insightsDaily.adAccountId, accountId), between(insightsDaily.date, chunk.from, chunk.to)));

    const syncedAt = new Date();
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const batch = rows.slice(i, i + INSERT_BATCH);
      await tx.insert(insightsDaily).values(
        batch.map((r) => ({
          adAccountId: accountId,
          metaCampaignId: r.metaCampaignId,
          date: r.date,
          spend: r.spend,
          impressions: r.impressions,
          clicks: r.clicks,
          linkClicks: r.linkClicks,
          conversions: r.conversions,
          conversionValue: r.conversionValue,
          rawActions: r.rawActions,
          rawActionValues: r.rawActionValues,
          syncedAt,
        })),
      );
    }

    const latestNames = new Map<string, NormalizedInsight>();
    for (const r of rows) {
      const prev = latestNames.get(r.metaCampaignId);
      if (!prev || r.date >= prev.date) latestNames.set(r.metaCampaignId, r);
    }
    for (const r of latestNames.values()) {
      await tx
        .insert(campaigns)
        .values({ adAccountId: accountId, metaCampaignId: r.metaCampaignId, name: r.campaignName, objective: r.objective })
        .onConflictDoUpdate({
          target: [campaigns.adAccountId, campaigns.metaCampaignId],
          set: { name: r.campaignName, objective: r.objective, updatedAt: syncedAt },
        });
    }
  });
}

export async function syncAdAccount(
  db: Db,
  accountId: string,
  options: { trigger: SyncTrigger; range?: DateRange; sourceFactory?: SourceFactory; now?: Date } = {
    trigger: "manual",
  },
): Promise<SyncResult> {
  const now = options.now ?? new Date();
  const [account] = await db.select().from(adAccounts).where(eq(adAccounts.id, accountId));
  if (!account) throw new Error("Compte publicitaire introuvable.");

  const range = options.range ?? defaultSyncRange(account.timezoneName, account.lastSyncedAt, now);

  if (!(await acquireLock(db, accountId, now))) {
    const [run] = await db
      .insert(syncRuns)
      .values({
        adAccountId: accountId,
        trigger: options.trigger,
        status: "skipped",
        rangeFrom: range.from,
        rangeTo: range.to,
        errorMessage: "Une synchronisation est déjà en cours pour ce compte.",
        finishedAt: new Date(),
      })
      .returning({ id: syncRuns.id });
    return { runId: run.id, status: "skipped", rowsWritten: 0, range };
  }

  const [run] = await db
    .insert(syncRuns)
    .values({ adAccountId: accountId, trigger: options.trigger, status: "running", rangeFrom: range.from, rangeTo: range.to })
    .returning({ id: syncRuns.id });

  let source: InsightsSource | null = null;
  let rowsWritten = 0;
  try {
    const [connection] = await db.select().from(metaConnections).where(eq(metaConnections.id, account.connectionId));
    if (!connection) throw new Error("Connexion Meta introuvable.");
    source = (options.sourceFactory ?? defaultSourceFactory)(connection);

    for (const chunk of splitRange(range)) {
      const raw = await source.fetchCampaignDailyInsights(account.metaAccountId, chunk);
      const normalized = raw.map((row) => normalizeInsightRow(row, account.conversionActionTypes));
      const outOfRange = normalized.find((r) => r.date < chunk.from || r.date > chunk.to);
      if (outOfRange) {
        throw new NormalizationError(`Date hors période reçue de Meta : ${outOfRange.date}.`);
      }
      await writeChunk(db, accountId, chunk, normalized);
      rowsWritten += normalized.length;
    }

    const finishedAt = new Date();
    await db
      .update(syncRuns)
      .set({ status: "success", rowsWritten, apiCalls: source.apiCalls, finishedAt })
      .where(eq(syncRuns.id, run.id));
    await db
      .update(adAccounts)
      .set({ lastSyncedAt: finishedAt, lastSyncStatus: "success", syncLockedUntil: null })
      .where(eq(adAccounts.id, accountId));
    if (connection.status !== "active") {
      await db
        .update(metaConnections)
        .set({ status: "active", lastError: null, lastCheckedAt: finishedAt })
        .where(eq(metaConnections.id, connection.id));
    }
    return { runId: run.id, status: "success", rowsWritten, range };
  } catch (error) {
    const info = toErrorInfo(error);
    if (info.code === "internal") console.error("[sync] internal error", { accountId, error });
    await db
      .update(syncRuns)
      .set({
        status: "error",
        rowsWritten,
        apiCalls: source?.apiCalls ?? 0,
        errorCode: info.code,
        errorMessage: info.message,
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, run.id));
    await db
      .update(adAccounts)
      .set({ lastSyncStatus: "error", syncLockedUntil: null })
      .where(eq(adAccounts.id, accountId));
    if (error instanceof MetaApiError && (error.kind === "auth" || error.kind === "permission")) {
      await db
        .update(metaConnections)
        .set({
          status: error.kind === "auth" ? "expired" : "permission_denied",
          lastError: info.message,
          lastCheckedAt: new Date(),
        })
        .where(eq(metaConnections.id, account.connectionId));
    }
    return { runId: run.id, status: "error", rowsWritten, range, errorMessage: info.message };
  }
}

/** Syncs every active account, least recently synced first, within a time budget. */
export async function syncAllAccounts(
  db: Db,
  options: { budgetMs: number; sourceFactory?: SourceFactory; trigger?: SyncTrigger },
): Promise<Array<SyncResult & { accountId: string }>> {
  const startedAt = Date.now();
  const accounts = await db
    .select({ id: adAccounts.id })
    .from(adAccounts)
    .where(eq(adAccounts.isActive, true))
    .orderBy(sql`${adAccounts.lastSyncedAt} asc nulls first`, asc(adAccounts.createdAt));

  const results: Array<SyncResult & { accountId: string }> = [];
  for (const { id } of accounts) {
    if (Date.now() - startedAt > options.budgetMs) break;
    const result = await syncAdAccount(db, id, {
      trigger: options.trigger ?? "cron",
      sourceFactory: options.sourceFactory,
    });
    results.push({ accountId: id, ...result });
  }
  return results;
}

/** Re-derives conversions from stored raw actions after the conversion setting changes. */
export async function recomputeConversions(db: Db, accountId: string, actionTypes: string[]): Promise<void> {
  const types = JSON.stringify([...new Set(actionTypes)]);
  await db.execute(sql`
    update ${insightsDaily} set
      conversions = coalesce((
        select sum((${insightsDaily.rawActions} ->> t)::float8)
        from jsonb_array_elements_text(${types}::jsonb) as t
      ), 0),
      conversion_value = coalesce((
        select sum((${insightsDaily.rawActionValues} ->> t)::float8)
        from jsonb_array_elements_text(${types}::jsonb) as t
      ), 0)
    where ${insightsDaily.adAccountId} = ${accountId}
  `);
}

/** Action types observed in stored data, to help the admin pick the conversion event. */
export async function observedActionTypes(
  db: Db,
  accountId: string,
): Promise<Array<{ actionType: string; total: number; value: number }>> {
  const rows = await db.execute(sql`
    select a.key as action_type,
           sum((a.value)::float8)::float8 as total,
           coalesce(sum((${insightsDaily.rawActionValues} ->> a.key)::float8), 0)::float8 as value
    from ${insightsDaily}, jsonb_each_text(${insightsDaily.rawActions}) as a
    where ${insightsDaily.adAccountId} = ${accountId}
    group by a.key
    order by total desc
  `);
  const list = (Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows) as Array<{
    action_type: string;
    total: number;
    value: number;
  }>;
  return list.map((r) => ({ actionType: r.action_type, total: Number(r.total), value: Number(r.value) }));
}
