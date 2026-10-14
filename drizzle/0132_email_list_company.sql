-- Email list addresses get a company name beside the person's name, so stock emails can greet each recipient by name
-- and company ({name}, {contactCompany}).
ALTER TABLE "email_list_contacts" ADD COLUMN IF NOT EXISTS "company" text NOT NULL DEFAULT '';
