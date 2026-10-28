CREATE TABLE "bilans" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"dashboard_id" text NOT NULL,
	"name" text NOT NULL,
	"campaign_ids" jsonb NOT NULL,
	"range_from" date NOT NULL,
	"range_to" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bilans" ADD CONSTRAINT "bilans_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bilans_dashboard_idx" ON "bilans" USING btree ("dashboard_id");--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN "bilan_id" text;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_bilan_id_bilans_id_fk" FOREIGN KEY ("bilan_id") REFERENCES "public"."bilans"("id") ON DELETE cascade ON UPDATE no action;
