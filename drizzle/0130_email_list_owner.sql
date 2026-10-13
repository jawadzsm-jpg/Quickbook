-- Email lists become private per user: an address is unique per owner (the user who added it) in a company's Sales or
-- Purchase list. Administrators see everyone's addresses; other users only their own (app/api/email-lists).
DROP INDEX IF EXISTS "uq_email_list_contacts_address";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_list_contacts_owner_address" ON "email_list_contacts" ("company_id", "list_type", COALESCE("created_by_user_id", 0), lower("email"));
