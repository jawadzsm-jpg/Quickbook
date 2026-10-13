-- Personal notes on Company Home: each user's private notes for one company (add, edit, tick done, delete).
CREATE TABLE IF NOT EXISTS "user_notes" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "done" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_notes_user_company" ON "user_notes" ("user_id", "company_id", "created_at");
