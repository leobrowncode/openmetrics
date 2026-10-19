import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const adminUsers = pgTable("admin_users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("admin_sessions_user_idx").on(t.userId)],
);

export const clients = pgTable("clients", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

/**
 * An agency-level Meta access (ideally a Business Manager system user token
 * with ads_read only). The token is stored encrypted (AES-256-GCM).
 */
export const metaConnections = pgTable("meta_connections", {
  id: id(),
  label: text("label").notNull(),
  kind: text("kind", { enum: ["meta", "demo"] }).notNull(),
  encryptedToken: text("encrypted_token"),
  status: text("status", { enum: ["active", "invalid", "expired", "permission_denied", "error"] })
    .notNull()
    .default("active"),
  grantedScopes: jsonb("granted_scopes").$type<string[]>().notNull().default([]),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: createdAt(),
});

export const adAccounts = pgTable(
  "ad_accounts",
  {
    id: id(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => metaConnections.id, { onDelete: "restrict" }),
    metaAccountId: text("meta_account_id").notNull(),
    name: text("name").notNull(),
    currency: text("currency").notNull(),
    timezoneName: text("timezone_name").notNull(),
    /** Meta action_type values counted as conversions (e.g. offsite_conversion.fb_pixel_purchase). */
    conversionActionTypes: jsonb("conversion_action_types").$type<string[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncStatus: text("last_sync_status"),
    syncLockedUntil: timestamp("sync_locked_until", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("ad_accounts_meta_account_uidx").on(t.metaAccountId),
    index("ad_accounts_client_idx").on(t.clientId),
  ],
);

export const campaigns = pgTable(
  "campaigns",
  {
    adAccountId: text("ad_account_id")
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    metaCampaignId: text("meta_campaign_id").notNull(),
    name: text("name").notNull(),
    objective: text("objective"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.adAccountId, t.metaCampaignId] })],
);

/** Daily campaign-level facts, one row per account × campaign × day (account timezone). */
export const insightsDaily = pgTable(
  "insights_daily",
  {
    adAccountId: text("ad_account_id")
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    metaCampaignId: text("meta_campaign_id").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    spend: doublePrecision("spend").notNull().default(0),
    impressions: bigint("impressions", { mode: "number" }).notNull().default(0),
    clicks: bigint("clicks", { mode: "number" }).notNull().default(0),
    linkClicks: bigint("link_clicks", { mode: "number" }).notNull().default(0),
    conversions: doublePrecision("conversions").notNull().default(0),
    conversionValue: doublePrecision("conversion_value").notNull().default(0),
    /** Raw Meta `actions` / `action_values`, kept so conversions can be recomputed without re-sync. */
    rawActions: jsonb("raw_actions").$type<Record<string, number>>().notNull().default({}),
    rawActionValues: jsonb("raw_action_values").$type<Record<string, number>>().notNull().default({}),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.adAccountId, t.metaCampaignId, t.date] }),
    index("insights_daily_account_date_idx").on(t.adAccountId, t.date),
  ],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: id(),
    adAccountId: text("ad_account_id")
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    trigger: text("trigger", { enum: ["cron", "manual", "backfill"] }).notNull(),
    status: text("status", { enum: ["running", "success", "error", "skipped"] }).notNull(),
    rangeFrom: date("range_from", { mode: "string" }).notNull(),
    rangeTo: date("range_to", { mode: "string" }).notNull(),
    rowsWritten: integer("rows_written").notNull().default(0),
    apiCalls: integer("api_calls").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("sync_runs_account_started_idx").on(t.adAccountId, t.startedAt)],
);

export const dashboardTemplates = pgTable("dashboard_templates", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  config: jsonb("config").notNull(),
  builtIn: boolean("built_in").notNull().default(false),
  createdAt: createdAt(),
});

export const dashboards = pgTable(
  "dashboards",
  {
    id: id(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Subset of the client's ad accounts; empty means all of the client's accounts. */
    adAccountIds: jsonb("ad_account_ids").$type<string[]>().notNull().default([]),
    config: jsonb("config").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("dashboards_client_idx").on(t.clientId)],
);

/** Private viewer links. Only an HMAC-SHA256 fingerprint of the token is stored. */
export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    dashboardId: text("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    accessCount: integer("access_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("share_links_dashboard_idx").on(t.dashboardId)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt)],
);
