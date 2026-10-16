-- Sent emails keep no history (lib/email-addresses.ts): document_emails now holds only the addresses each party
-- (customer, supplier or "Report · <title>") was emailed at, one row per company and party, newest first (up to 50),
-- for the email dialog's suggestions. Earlier sends are folded into those rows and everything else about them —
-- subject, sender, attachment, failures, delivery checks, the link to the document — is deleted, in one statement.
WITH "old" AS (
  DELETE FROM "document_emails" RETURNING "company_id", "party", "recipients", "cc", "status", "created_at"
), "addresses" AS (
  SELECT "company_id", "party", lower(trim("address")) AS "email", max("created_at") AS "last_used"
  FROM "old", jsonb_array_elements_text(
    (CASE WHEN "recipients" LIKE '[%' THEN "recipients"::jsonb ELSE '[]'::jsonb END) ||
    (CASE WHEN "cc" LIKE '[%' THEN "cc"::jsonb ELSE '[]'::jsonb END)) AS "address"
  WHERE "status" = 'sent' AND trim("address") <> ''
  GROUP BY 1, 2, 3
), "ranked" AS (
  SELECT *, row_number() OVER (PARTITION BY "company_id", "party" ORDER BY "last_used" DESC, "email") AS "n" FROM "addresses"
)
INSERT INTO "document_emails" ("company_id", "party", "recipients", "created_at")
SELECT "company_id", "party", jsonb_agg("email" ORDER BY "last_used" DESC, "email")::text, max("last_used")
FROM "ranked" WHERE "n" <= 50 GROUP BY "company_id", "party";
--> statement-breakpoint
-- Inventory Overview stock emails no longer leave an audit line per send; the addresses stay in the email lists.
DELETE FROM "audit_log" WHERE "entity_type" = 'inventory_email';
