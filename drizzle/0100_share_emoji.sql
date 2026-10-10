-- Inventory Overview share emoji: each user's WhatsApp and Telegram style, and a per-company on/off switch for administrators.
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "share_emoji_whatsapp" text DEFAULT 'classic' NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "share_emoji_telegram" text DEFAULT 'classic' NOT NULL;
--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "share_emojis" boolean DEFAULT true NOT NULL;
