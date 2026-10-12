-- Email templates: each user keeps their own (subject and message with {placeholders}) and may share one with the
-- company. `document_type` is a transaction type ("invoice", "purchase order", …) or "any".
CREATE TABLE IF NOT EXISTS "email_templates" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "owner_user_id" integer REFERENCES "app_users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "document_type" text DEFAULT 'any' NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "shared" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_templates_company_owner" ON "email_templates" ("company_id", "owner_user_id");
--> statement-breakpoint
-- Documents emailed to customers and suppliers with their PDF: who sent it, to whom, and whether the server accepted it.
CREATE TABLE IF NOT EXISTS "document_emails" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "transaction_id" integer REFERENCES "transactions"("id") ON DELETE SET NULL,
  "sent_by_user_id" integer REFERENCES "app_users"("id") ON DELETE SET NULL,
  "sent_by_name" text DEFAULT '' NOT NULL,
  "party" text DEFAULT '' NOT NULL,
  "recipients" text DEFAULT '[]' NOT NULL,
  "cc" text DEFAULT '[]' NOT NULL,
  "subject" text DEFAULT '' NOT NULL,
  "attachment_name" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'sent' NOT NULL,
  "error" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_emails_transaction" ON "document_emails" ("transaction_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_emails_party" ON "document_emails" ("company_id", "party", "created_at");
--> statement-breakpoint
-- Notification emails: a failed send is retried (up to 3 attempts) and a send interrupted mid-way is picked up again.
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "email_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "email_claimed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "email_error" text DEFAULT '' NOT NULL;
--> statement-breakpoint
-- Notices that failed or were cut off before this change are old news: do not retry them now.
UPDATE "notifications" SET "email_attempts" = 3 WHERE "email_status" IN ('failed', 'sending');
