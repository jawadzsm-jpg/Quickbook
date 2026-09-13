ALTER TABLE companies ADD COLUMN IF NOT EXISTS right_logo_data text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE companies ADD COLUMN IF NOT EXISTS document_design text NOT NULL DEFAULT '';
