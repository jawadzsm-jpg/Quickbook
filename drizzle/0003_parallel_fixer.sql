ALTER TABLE "contacts" ADD COLUMN "billing_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "whatsapp" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "country" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "trn" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "reseller" text DEFAULT 'Reseller' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "planet" text DEFAULT 'No' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "passport" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "currency" text DEFAULT 'AED' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "description" text DEFAULT '' NOT NULL;