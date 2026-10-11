-- Category colours in Inventory Overview (shared by all companies, like the category list).
CREATE TABLE IF NOT EXISTS "category_colors" (
  "id" serial PRIMARY KEY NOT NULL,
  "category" text NOT NULL,
  "color" text NOT NULL,
  "updated_by_name" text DEFAULT '' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_category_colors_category" ON "category_colors" ("category");
