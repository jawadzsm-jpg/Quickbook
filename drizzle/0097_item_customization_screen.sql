-- Product Customization Details: screen / display details shown with RAM and Storage.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "customization_screen" text DEFAULT '' NOT NULL;
