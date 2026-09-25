CREATE TABLE IF NOT EXISTS warranty_slips (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  invoice_id integer REFERENCES transactions(id) ON DELETE SET NULL,
  invoice_line_id integer REFERENCES transaction_lines(id) ON DELETE SET NULL,
  number text NOT NULL DEFAULT '',
  slip_date text NOT NULL,
  contact_name text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  customer_reference text NOT NULL DEFAULT '',
  invoice_number text NOT NULL DEFAULT '',
  brand text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  specs text NOT NULL DEFAULT '',
  serial_number text NOT NULL DEFAULT '',
  problem text NOT NULL,
  remarks text NOT NULL DEFAULT '',
  included_items text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Under Process',
  show_stamp boolean NOT NULL DEFAULT false,
  stamp_left integer NOT NULL DEFAULT 156,
  stamp_top integer NOT NULL DEFAULT 242,
  created_by_user_id integer REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_warranty_slips_company_date ON warranty_slips(company_id, slip_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_warranty_slips_customer ON warranty_slips(company_id, customer_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_warranty_slips_invoice ON warranty_slips(company_id, invoice_id);
