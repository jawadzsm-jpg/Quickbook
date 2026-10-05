ALTER TABLE contacts ADD COLUMN IF NOT EXISTS parent_contact_id integer REFERENCES contacts(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contacts_parent ON contacts(company_id, parent_contact_id);
