CREATE TABLE IF NOT EXISTS "app_users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text DEFAULT 'user' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "failed_login_attempts" integer DEFAULT 0 NOT NULL,
  "locked_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_app_users_email" ON "app_users" USING btree ("email");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "auth_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_auth_sessions_token_hash" ON "auth_sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auth_sessions_user" ON "auth_sessions" USING btree ("user_id");
--> statement-breakpoint
INSERT INTO "app_users" ("email", "password_hash", "role") VALUES
  ('admin@comnet.local', '', 'admin')
ON CONFLICT ("email") DO NOTHING;
