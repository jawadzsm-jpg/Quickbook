CREATE INDEX IF NOT EXISTS "idx_transactions_company_location_type_status"
  ON "transactions" ("company_id", "location_id", "type", "status");
