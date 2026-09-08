ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "phone" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "whatsapp" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "avatar_data" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "last_login_ip" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "last_login_user_agent" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_settings" (
  "id" integer PRIMARY KEY NOT NULL,
  "host" text DEFAULT 'smtp.gmail.com' NOT NULL,
  "port" integer DEFAULT 465 NOT NULL,
  "secure" boolean DEFAULT true NOT NULL,
  "username" text DEFAULT '' NOT NULL,
  "password_encrypted" text DEFAULT '' NOT NULL,
  "from_name" text DEFAULT 'ComNet Accounting' NOT NULL,
  "from_email" text DEFAULT '' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
