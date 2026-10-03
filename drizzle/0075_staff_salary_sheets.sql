CREATE TABLE IF NOT EXISTS staff_salary_sheets (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1,
  data text NOT NULL,
  letterhead text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS staff_salary_sheets_company_idx ON staff_salary_sheets(company_id);
