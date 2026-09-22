ALTER TABLE "packing_list_lines" ADD COLUMN IF NOT EXISTS "carton_reference" text DEFAULT '' NOT NULL;
