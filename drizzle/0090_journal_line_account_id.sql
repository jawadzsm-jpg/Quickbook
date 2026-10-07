-- Journal lines gain the Chart of Accounts ID they post to. Names alone are ambiguous when two accounts share
-- a name (for example one receivable account per currency), so reports and account history link by ID.
ALTER TABLE "journal_lines" ADD COLUMN IF NOT EXISTS "account_id" integer REFERENCES "accounts"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_journal_lines_account_id" ON "journal_lines" ("account_id");
--> statement-breakpoint
-- Resolve an account for a journal line the way posting chooses accounts: a unique active account with that
-- name; otherwise a unique name; otherwise receivable/payable/bank/card accounts follow the entry currency and
-- other accounts prefer the home currency. Returns NULL rather than guessing when it stays ambiguous.
CREATE OR REPLACE FUNCTION comnet_journal_line_account_id(p_entry integer, p_name text) RETURNS integer LANGUAGE sql STABLE AS $$
  WITH entry AS (
    SELECT j.company_id, upper(coalesce(nullif(j.currency, ''), c.base_currency)) AS currency, upper(c.base_currency) AS base
    FROM journal_entries j JOIN companies c ON c.id = j.company_id WHERE j.id = p_entry
  ), candidates AS (
    SELECT a.id, a.active, upper(a.currency) AS currency, a.type FROM accounts a, entry WHERE a.company_id = entry.company_id AND a.name = p_name
  ), picks AS (
    SELECT id, 0 AS rank FROM candidates WHERE active AND (SELECT count(*) FROM candidates WHERE active) = 1
    UNION ALL SELECT id, 1 FROM candidates WHERE (SELECT count(*) FROM candidates) = 1
    UNION ALL SELECT c.id, 2 FROM candidates c, entry e
      WHERE (SELECT bool_and(type IN ('Accounts Receivable', 'Accounts Payable', 'Bank', 'Credit Card')) FROM candidates)
        AND c.currency = e.currency AND (SELECT count(*) FROM candidates c2 WHERE c2.currency = e.currency) = 1
    UNION ALL SELECT c.id, 3 FROM candidates c, entry e WHERE c.currency = e.base AND (SELECT count(*) FROM candidates c2 WHERE c2.currency = e.base) = 1
    UNION ALL SELECT c.id, 4 FROM candidates c, entry e WHERE c.currency = e.currency AND (SELECT count(*) FROM candidates c2 WHERE c2.currency = e.currency) = 1
  )
  SELECT id FROM picks ORDER BY rank LIMIT 1
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION comnet_fill_journal_line_account_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_id IS NULL THEN
    NEW.account_id := comnet_journal_line_account_id(NEW.journal_entry_id, NEW.account_name);
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "journal_lines_fill_account_id" ON "journal_lines";
--> statement-breakpoint
CREATE TRIGGER "journal_lines_fill_account_id" BEFORE INSERT ON "journal_lines" FOR EACH ROW EXECUTE FUNCTION comnet_fill_journal_line_account_id();
--> statement-breakpoint
UPDATE "journal_lines" SET "account_id" = comnet_journal_line_account_id("journal_entry_id", "account_name") WHERE "account_id" IS NULL;
