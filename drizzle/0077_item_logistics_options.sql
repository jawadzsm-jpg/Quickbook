CREATE TABLE IF NOT EXISTS item_logistics_options (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('hs_code', 'coo')),
  value text NOT NULL,
  label text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS item_logistics_options_company_type_value ON item_logistics_options(company_id, type, value);
