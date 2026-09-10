ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "hs_code" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "country_of_origin" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "dimension_text" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "length_cm" double precision DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "width_cm" double precision DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "height_cm" double precision DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "weight_kg" double precision DEFAULT 0 NOT NULL;
