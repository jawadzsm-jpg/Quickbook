import { boolean, doublePrecision, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  baseCurrency: text("base_currency").notNull().default("AED"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_companies_name").on(table.name)]);

export const companySettings = pgTable("company_settings", {
  companyId: integer("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  negativeStockPinHash: text("negative_stock_pin_hash").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const inventoryLocations = pgTable("inventory_locations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  invoicePrefix: text("invoice_prefix").notNull(),
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_inventory_locations_company_code").on(table.companyId, table.code)]);

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["customer", "vendor", "employee"] }).notNull(),
  name: text("name").notNull(),
  company: text("company").notNull().default(""),
  billingName: text("billing_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  whatsapp: text("whatsapp").notNull().default(""),
  country: text("country").notNull().default(""),
  trn: text("trn").notNull().default(""),
  reseller: text("reseller").notNull().default("Reseller"),
  planet: text("planet").notNull().default("No"),
  passport: text("passport").notNull().default(""),
  currency: text("currency").notNull().default("AED"),
  description: text("description").notNull().default(""),
  balance: doublePrecision("balance").notNull().default(0),
  status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("idx_contacts_company_type_name").on(table.companyId, table.type, table.name)]);

export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  locationId: integer("location_id").notNull().references(() => inventoryLocations.id, { onDelete: "cascade" }),
  itemNumber: text("item_number"),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("General"),
  description: text("description").notNull().default(""),
  specifications: text("specifications").notNull().default("[]"),
  quantity: doublePrecision("quantity").notNull().default(0),
  reorderPoint: doublePrecision("reorder_point").notNull().default(0),
  salesPrice: doublePrecision("sales_price").notNull().default(0),
  cost: doublePrecision("cost").notNull().default(0),
  status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_items_location_item_number").on(table.companyId, table.locationId, table.itemNumber), uniqueIndex("idx_items_location_sku").on(table.companyId, table.locationId, table.sku), index("idx_items_company_location_name").on(table.companyId, table.locationId, table.name)]);

export const stockTransfers = pgTable("stock_transfers", {
  id: serial("id").primaryKey(),
  reference: text("reference").notNull(),
  sourceCompanyId: integer("source_company_id").notNull().references(() => companies.id, { onDelete: "restrict" }),
  sourceLocationId: integer("source_location_id").notNull().references(() => inventoryLocations.id, { onDelete: "restrict" }),
  destinationCompanyId: integer("destination_company_id").notNull().references(() => companies.id, { onDelete: "restrict" }),
  destinationLocationId: integer("destination_location_id").notNull().references(() => inventoryLocations.id, { onDelete: "restrict" }),
  itemNumber: text("item_number"),
  sku: text("sku").notNull(),
  itemName: text("item_name").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  transferDate: text("transfer_date").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("idx_stock_transfers_reference").on(table.reference), index("idx_stock_transfers_source_date").on(table.sourceCompanyId, table.transferDate), index("idx_stock_transfers_destination_date").on(table.destinationCompanyId, table.transferDate)]);

export const specificationOptions = pgTable("specification_options", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  value: text("value").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_specification_options_label_value").on(table.label, table.value)]);

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => inventoryLocations.id, { onDelete: "set null" }),
  number: text("number").notNull(),
  type: text("type").notNull(),
  party: text("party").notNull(),
  transactionDate: text("transaction_date").notNull(),
  dueDate: text("due_date").notNull().default(""),
  account: text("account").notNull().default("Accounts Receivable"),
  status: text("status").notNull().default("open"),
  memo: text("memo").notNull().default(""),
  subtotal: doublePrecision("subtotal").notNull().default(0),
  vatRate: doublePrecision("vat_rate").notNull().default(5),
  vatAmount: doublePrecision("vat_amount").notNull().default(0),
  total: doublePrecision("total").notNull().default(0),
  currency: text("currency").notNull().default("AED"),
  exchangeRate: doublePrecision("exchange_rate").notNull().default(1),
  baseTotal: doublePrecision("base_total").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("idx_transactions_company_date").on(table.companyId, table.transactionDate), index("idx_transactions_company_type_status").on(table.companyId, table.type, table.status)]);

export const transactionLines = pgTable("transaction_lines", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => items.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  quantity: doublePrecision("quantity").notNull().default(1),
  unitPrice: doublePrecision("unit_price").notNull().default(0),
  unitCost: doublePrecision("unit_cost").notNull().default(0),
  vatRate: doublePrecision("vat_rate").notNull().default(5),
  subtotal: doublePrecision("subtotal").notNull().default(0),
  vatAmount: doublePrecision("vat_amount").notNull().default(0),
  total: doublePrecision("total").notNull().default(0),
}, (table) => [index("idx_transaction_lines_transaction").on(table.transactionId), index("idx_transaction_lines_item").on(table.itemId)]);

export const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  movementDate: text("movement_date").notNull(),
  movementType: text("movement_type").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  unitCost: doublePrecision("unit_cost").notNull().default(0),
  reference: text("reference").notNull(),
}, (table) => [index("idx_inventory_movements_item_date").on(table.itemId, table.movementDate), index("idx_inventory_movements_transaction").on(table.transactionId)]);

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  balance: doublePrecision("balance").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_accounts_company_code").on(table.companyId, table.code)]);

export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").references(() => transactions.id, { onDelete: "cascade" }),
  entryDate: text("entry_date").notNull(),
  reference: text("reference").notNull(),
  description: text("description").notNull().default(""),
  posted: boolean("posted").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("idx_journal_entries_company_date").on(table.companyId, table.entryDate)]);

export const journalLines = pgTable("journal_lines", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
  accountName: text("account_name").notNull(),
  debit: doublePrecision("debit").notNull().default(0),
  credit: doublePrecision("credit").notNull().default(0),
}, (table) => [index("idx_journal_lines_entry").on(table.journalEntryId), index("idx_journal_lines_account").on(table.accountName)]);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  details: text("details").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("idx_audit_entity").on(table.entityType, table.entityId)]);
