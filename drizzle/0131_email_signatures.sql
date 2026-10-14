-- Email signature per user and company, added under document and stock-list emails. Each user edits their own.
-- `image_token` is a random key for the public image links the email uses (the company logo and brands banner).
CREATE TABLE IF NOT EXISTS "email_signatures" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT true,
  "closing" text NOT NULL DEFAULT '',
  "full_name" text NOT NULL DEFAULT '',
  "job_title" text NOT NULL DEFAULT '',
  "address" text NOT NULL DEFAULT '',
  "landline" text NOT NULL DEFAULT '',
  "fax" text NOT NULL DEFAULT '',
  "mobile" text NOT NULL DEFAULT '',
  "msn" text NOT NULL DEFAULT '',
  "skype" text NOT NULL DEFAULT '',
  "whatsapp" text NOT NULL DEFAULT '',
  "email" text NOT NULL DEFAULT '',
  "website" text NOT NULL DEFAULT '',
  "banner_data" text NOT NULL DEFAULT '',
  "image_token" text NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_signatures_company_user" ON "email_signatures" ("company_id", "user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_signatures_image_token" ON "email_signatures" ("image_token");
