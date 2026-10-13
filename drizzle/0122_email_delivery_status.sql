-- Delivery status of document emails sent through the turboSMTP API: the message IDs turboSMTP returned, and the last
-- status looked up from its reports (GET /analytics/{id}). Emails sent over SMTP keep provider_message_ids = '[]'.
ALTER TABLE "document_emails" ADD COLUMN IF NOT EXISTS "provider_message_ids" text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE "document_emails" ADD COLUMN IF NOT EXISTS "delivery_status" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "document_emails" ADD COLUMN IF NOT EXISTS "delivery_detail" text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE "document_emails" ADD COLUMN IF NOT EXISTS "delivery_checked_at" timestamp with time zone;
