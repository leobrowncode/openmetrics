ALTER TABLE "ad_accounts" ADD COLUMN "history_from" date;--> statement-breakpoint
-- Accounts synced before resumable backfills existed completed a 395-day import; the next sync extends it to the current target.
UPDATE "ad_accounts" SET "history_from" = (now() AT TIME ZONE "timezone_name")::date - 395 WHERE "last_synced_at" IS NOT NULL;
