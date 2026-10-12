-- Post-dated cheque reminders: when to remind (UTC instant), whether a person set it (otherwise it follows the cheque
-- date: 7 days before at 09:00 UAE time) and when the reminder notices were sent.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "reminder_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "reminder_custom" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "reminded_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transactions_reminder_due" ON "transactions" ("reminder_at") WHERE "reminded_at" IS NULL AND "reminder_at" IS NOT NULL;
