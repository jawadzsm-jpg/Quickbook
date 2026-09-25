ALTER TABLE companies ADD COLUMN IF NOT EXISTS login_logo_data text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE companies ADD COLUMN IF NOT EXISTS login_display_name text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE companies ADD COLUMN IF NOT EXISTS login_copyright_years text NOT NULL DEFAULT '1996-2021';
--> statement-breakpoint
ALTER TABLE companies ALTER COLUMN login_background_color SET DEFAULT '#f3f6fa';
