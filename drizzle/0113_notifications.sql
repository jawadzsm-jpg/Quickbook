-- In-app notifications with email delivery (cheque notices first). One row per recipient; email_status tracks the
-- email copy: pending (not sent yet), sent, failed, or skipped (no SMTP, no address, or the user turned emails off).
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "app_users"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "transaction_id" integer REFERENCES "transactions"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "read_at" timestamp with time zone,
  "email_status" text DEFAULT 'pending' NOT NULL,
  "emailed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_user" ON "notifications" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_email_pending" ON "notifications" ("email_status") WHERE "email_status" = 'pending';
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "notification_emails" boolean DEFAULT true NOT NULL;
