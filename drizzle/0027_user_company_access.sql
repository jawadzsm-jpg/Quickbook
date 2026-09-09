CREATE TABLE IF NOT EXISTS "app_user_companies" (
  "user_id" integer NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "app_user_companies_user_company_pk" PRIMARY KEY("user_id", "company_id")
);

CREATE INDEX IF NOT EXISTS "idx_app_user_companies_user" ON "app_user_companies" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_app_user_companies_company" ON "app_user_companies" ("company_id");

-- Preserve existing administrators: they remain Administrator and receive all current companies.
INSERT INTO "app_user_companies" ("user_id", "company_id")
SELECT u."id", c."id"
FROM "app_users" u
CROSS JOIN "companies" c
WHERE u."role" = 'admin'
ON CONFLICT DO NOTHING;
