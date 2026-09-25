ALTER TABLE companies ADD COLUMN IF NOT EXISTS login_branding boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE companies ADD COLUMN IF NOT EXISTS login_background_data text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE companies ADD COLUMN IF NOT EXISTS login_background_color text NOT NULL DEFAULT '#020617';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_login_branding ON companies (login_branding) WHERE login_branding = true;
