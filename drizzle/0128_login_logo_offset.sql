-- Sign-in page: how far the EasyBook logo is moved up (negative) or down (positive), in pixels, per company.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "login_logo_offset" integer NOT NULL DEFAULT 0;
