-- Announcements: administrators post a message for all users of a company or chosen users. It shows as a banner on
-- Company Home until each user dismisses it, and as a notice in the bell (notifications.announcement_id).
CREATE TABLE IF NOT EXISTS "announcements" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "audience" text NOT NULL DEFAULT 'all' CHECK ("audience" IN ('all', 'users')),
  "created_by_user_id" integer REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_by_name" text NOT NULL DEFAULT '',
  "ends_at" timestamp with time zone,
  "removed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_announcements_company" ON "announcements" ("company_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_recipients" (
  "announcement_id" integer NOT NULL REFERENCES "announcements"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  PRIMARY KEY ("announcement_id", "user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_dismissals" (
  "announcement_id" integer NOT NULL REFERENCES "announcements"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "dismissed_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("announcement_id", "user_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "announcement_id" integer REFERENCES "announcements"("id") ON DELETE CASCADE;
