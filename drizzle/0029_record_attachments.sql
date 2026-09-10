CREATE TABLE IF NOT EXISTS "record_attachments" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,
  "entity_id" integer NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL DEFAULT 'application/octet-stream',
  "file_data" text NOT NULL,
  "file_size" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_record_attachments_entity" ON "record_attachments" ("company_id", "entity_type", "entity_id");