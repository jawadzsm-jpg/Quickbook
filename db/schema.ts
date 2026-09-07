import { boolean, doublePrecision, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
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
}, (table) => [index("idx_contacts_type_name").on(table.type, table.name)]);

export const items = pgTable("items", {
  id: serial("id").primaryKey(),
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
}, (table) => [uniqueIndex("idx_items_item_number").on(table.itemNumber), uniqueIndex("idx_items_sku").on(table.sku), index("idx_items_name").on(table.name)]);

export const specificationOptions = pgTable("specification_options", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  value: text("value").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_specification_options_label_value").on(table.label, table.value)]);

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
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
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("idx_transactions_date").on(table.transactionDate), index("idx_transactions_type_status").on(table.type, table.status)]);

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
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  balance: doublePrecision("balance").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_accounts_code").on(table.code)]);

export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").references(() => transactions.id, { onDelete: "cascade" }),
  entryDate: text("entry_date").notNull(),
  reference: text("reference").notNull(),
  description: text("description").notNull().default(""),
  posted: boolean("posted").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("idx_journal_entries_date").on(table.entryDate)]);

export const journalLines = pgTable("journal_lines", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
  accountName: text("account_name").notNull(),
  debit: doublePrecision("debit").notNull().default(0),
  credit: doublePrecision("credit").notNull().default(0),
}, (table) => [index("idx_journal_lines_entry").on(table.journalEntryId), index("idx_journal_lines_account").on(table.accountName)]);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  details: text("details").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("idx_audit_entity").on(table.entityType, table.entityId)]);
