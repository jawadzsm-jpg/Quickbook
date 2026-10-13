-- Accounts without a password (for example the admin@comnet.local row seeded by migration 0014) could sign in with any
-- company's Admin PIN. That path is removed; deactivate such accounts so they cannot be used. An administrator can
-- reactivate one in Users & access by setting a temporary password.
UPDATE "app_users" SET "active" = false, "must_change_password" = true, "updated_at" = now() WHERE "password_hash" = '';
--> statement-breakpoint
DELETE FROM "auth_sessions" WHERE "user_id" IN (SELECT "id" FROM "app_users" WHERE "password_hash" = '');
