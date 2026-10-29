CREATE TABLE "site_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"synthetic_display" text DEFAULT 'auto' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
