ALTER TABLE item_logistics_options ADD COLUMN IF NOT EXISTS source_value text;
ALTER TABLE item_logistics_options ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
--> statement-breakpoint
DROP INDEX IF EXISTS item_logistics_options_company_type_value;
CREATE UNIQUE INDEX item_logistics_options_company_type_value ON item_logistics_options(company_id, type, value) WHERE NOT hidden;
CREATE UNIQUE INDEX IF NOT EXISTS item_logistics_options_company_type_source ON item_logistics_options(company_id, type, source_value);
