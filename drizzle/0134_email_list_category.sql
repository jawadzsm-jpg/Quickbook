-- Email list addresses get a category (a country, region or any label the user types), so a list can be filtered and
-- emailed by category in the Inventory Overview Send dialog (app/api/email-lists).
ALTER TABLE "email_list_contacts" ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT '';
