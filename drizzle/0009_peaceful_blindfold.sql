DROP INDEX "idx_stock_transfers_reference";--> statement-breakpoint
CREATE INDEX "idx_stock_transfers_reference" ON "stock_transfers" USING btree ("reference");