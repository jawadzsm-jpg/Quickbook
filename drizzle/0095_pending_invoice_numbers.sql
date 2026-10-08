-- Pending Cart drafts were numbered PEND-<random UUID>. Give them readable running numbers per company
-- (continuing after any existing PEND-0001 style numbers). Drafts have no journal, stock or balance postings.
WITH existing AS (
  SELECT company_id, COALESCE(MAX(CAST(substring(number from '^PEND-([0-9]+)$') AS integer)), 0) AS last
  FROM transactions WHERE number ~ '^PEND-[0-9]+$' GROUP BY company_id
), ranked AS (
  SELECT id, company_id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY id) AS position
  FROM transactions WHERE number ~ '^PEND-[0-9a-f]{8}-[0-9a-f]{4}-'
)
UPDATE transactions t
SET number = 'PEND-' || lpad((COALESCE(existing.last, 0) + ranked.position)::text, 4, '0')
FROM ranked LEFT JOIN existing ON existing.company_id = ranked.company_id
WHERE t.id = ranked.id;
