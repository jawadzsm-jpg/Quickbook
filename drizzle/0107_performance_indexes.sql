-- Inventory Overview "Price Change" reads recent item audit rows; without this index it scans the whole item history.
CREATE INDEX IF NOT EXISTS "idx_audit_log_entity_created" ON "audit_log" ("entity_type", "created_at");
