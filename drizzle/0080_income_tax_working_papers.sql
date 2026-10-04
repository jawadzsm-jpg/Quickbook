CREATE TABLE IF NOT EXISTS income_tax_working_papers (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_start text NOT NULL,
  period_end text NOT NULL,
  config text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, period_start, period_end)
);
