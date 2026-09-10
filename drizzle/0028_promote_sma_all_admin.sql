UPDATE "app_users"
SET "role" = 'all_admin', "active" = true, "updated_at" = now()
WHERE lower("email") = 'sma@comnet.ae';
--> statement-breakpoint
DELETE FROM "app_user_companies"
WHERE "user_id" IN (
  SELECT "id" FROM "app_users" WHERE lower("email") = 'sma@comnet.ae'
);
