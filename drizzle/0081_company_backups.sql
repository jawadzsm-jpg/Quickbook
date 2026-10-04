CREATE TABLE IF NOT EXISTS backup_schedules (
 company_id integer PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
 config text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 next_run_at timestamptz,
 lease_until timestamptz,
 revision integer NOT NULL DEFAULT 1,
 updated_by integer NOT NULL REFERENCES app_users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS company_backups (
 id uuid PRIMARY KEY,
 company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 run_key text NOT NULL UNIQUE,
 source text NOT NULL CHECK(source IN ('manual','scheduled')),
 status text NOT NULL CHECK(status IN ('running','completed','failed','deleted')),
 requested_by integer REFERENCES app_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 filename text NOT NULL,
 blob_path text,
 sha256 text,
 size_bytes integer,
 row_count integer,
 table_count integer,
 verified_at timestamptz,
 error text,
 expires_at timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS company_backups_running ON company_backups(company_id) WHERE status='running';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS company_backups_history ON company_backups(company_id,created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS backup_worker_status (id integer PRIMARY KEY CHECK(id=1), checked_at timestamptz NOT NULL);
