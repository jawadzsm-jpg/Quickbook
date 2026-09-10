CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_reset ON auth_rate_limits (reset_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS idempotency_requests (
  user_id integer NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  request_key text NOT NULL,
  request_hash text NOT NULL,
  company_id integer REFERENCES companies(id) ON DELETE CASCADE,
  response_body text,
  response_status integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_key)
);
