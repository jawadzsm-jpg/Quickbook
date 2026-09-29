INSERT INTO "vat_codes" ("company_id", "code", "name", "rate", "description", "active", "system")
SELECT company."id", defaults."code", defaults."name", defaults."rate", defaults."description", true, true
FROM "companies" company
CROSS JOIN (VALUES
  ('STANDARD', 'Standard rated', 5::double precision, 'Standard UAE VAT rate'),
  ('ZERO', 'Zero rated', 0::double precision, 'Taxable supply charged at 0%'),
  ('EXEMPT', 'Exempt', 0::double precision, 'Supply exempt from VAT'),
  ('REVERSE_CHARGE', 'Reverse charge', 5::double precision, 'UAE reverse-charge supply reported in VAT201 Boxes 3 and 10'),
  ('OUT_OF_SCOPE', 'Out of scope', 0::double precision, 'Transaction outside the scope of VAT')
) AS defaults("code", "name", "rate", "description")
ON CONFLICT ("company_id", "code") DO UPDATE SET
  "active" = true,
  "system" = true,
  "rate" = EXCLUDED."rate",
  "updated_at" = now();
