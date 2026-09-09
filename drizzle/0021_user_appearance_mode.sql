ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "appearance_mode" text DEFAULT 'light' NOT NULL;
