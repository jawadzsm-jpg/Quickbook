ALTER TABLE "items" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "specifications" text DEFAULT '[]' NOT NULL;