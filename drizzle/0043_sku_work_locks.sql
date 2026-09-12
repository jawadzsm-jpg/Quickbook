CREATE TABLE IF NOT EXISTS sku_work_locks (
  lock_key text PRIMARY KEY,
  user_id integer NOT NULL,
  token text NOT NULL,
  expires_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sku_work_locks_expiry ON sku_work_locks (expires_at);
