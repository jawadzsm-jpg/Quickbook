INSERT INTO vat_codes (company_id, code, name, rate, description, active, system)
SELECT id, 'REVERSE_CHARGE', 'Reverse charge', 5, 'UAE reverse-charge supply reported in VAT201 Boxes 3 and 10', true, true
FROM companies
ON CONFLICT (company_id, code) DO UPDATE
SET name = EXCLUDED.name,
    rate = EXCLUDED.rate,
    description = EXCLUDED.description,
    active = true,
    system = true,
    updated_at = now();
