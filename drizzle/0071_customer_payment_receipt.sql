ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "payment_method" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "reference_no" text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE "transactions"
SET
  "payment_method" = CASE WHEN "payment_method" = '' THEN 'Bank transfer' ELSE "payment_method" END,
  "reference_no" = CASE WHEN "reference_no" = '' THEN "number" ELSE "reference_no" END
WHERE "type" = 'customer payment';
