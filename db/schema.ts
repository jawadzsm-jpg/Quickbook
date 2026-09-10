import { boolean, doublePrecision, index, integer, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  baseCurrency: text("base_currency").notNull().default("AED"),
  logoData: text("logo_data").notNull().default(""),
  stampData: text("stamp_data").notNull().default(""),
  addressLine1: text("address_line_1").notNull().default(""),
  addressLine2: text("address_line_2").notNull().default(""),
  city: text("city").notNull().default(""),
  country: text("country").notNull().default("United Arab Emirates"),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  trn: text("trn").notNull().default(""),
  bankName: text("bank_name").notNull().default(""),
  bankAccountName: text("bank_account_name").notNull().default(""),
  bankAccountNumber: text("bank_account_number").notNull().default(""),
  bankIban: text("bank_iban").notNull().default(""),
  bankSwift: text("bank_swift").notNull().default(""),
  bankCurrency: text("bank_currency").notNull().default(""),
  documentTemplate: text("document_template", { enum: ["classic", "modern", "minimal"] }).notNull().default("modern"),
  documentColor: text("document_color").notNull().default("#10b981"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_companies_name").on(table.name)]);

export const companySettings = pgTable("company_settings", {
  companyId: integer("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  negativeStockPinHash: text("negative_stock_pin_hash").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const vatCodes = pgTable("vat_codes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  rate: doublePrecision("rate").notNull().default(0),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  system: boolean("system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_vat_codes_company_code").on(table.companyId, table.code), index("idx_vat_codes_company_active").on(table.companyId, table.active)]);

export const exchangeRates = pgTable("exchange_rates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  currencyCode: text("currency_code").notNull(),
  rate: doublePrecision("rate").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_exchange_rates_company_currency").on(table.companyId, table.currencyCode), index("idx_exchange_rates_company_active").on(table.companyId, table.active)]);

export const appUsers = pgTable("app_users", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull().default(""),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  whatsapp: text("whatsapp").notNull().default(""),
  avatarData: text("avatar_data").notNull().default(""),
  themeColor: text("theme_color").notNull().default("emerald"),
  appearanceMode: text("appearance_mode", { enum: ["light", "dark"] }).notNull().default("light"),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "accountant", "sales", "purchasing", "inventory", "viewer"] }).notNull().default("viewer"),
  active: boolean("active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "string" }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "string" }),
  lastLoginIp: text("last_login_ip").notNull().default(""),
  lastLoginUserAgent: text("last_login_user_agent").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_app_users_email").on(table.email)]);

export const emailSettings = pgTable("email_settings", {
  id: integer("id").primaryKey(),
  host: text("host").notNull().default("smtp.gmail.com"),
  port: integer("port").notNull().default(465),
  secure: boolean("secure").notNull().default(true),
  username: text("username").notNull().default(""),
  passwordEncrypted: text("password_encrypted").notNull().default(""),
  fromName: text("from_name").notNull().default("ComNet Accounting"),
  fromEmail: text("from_email").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const authSessions = pgTable("auth_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_auth_sessions_token_hash").on(table.tokenHash), index("idx_auth_sessions_user").on(table.userId)]);

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

export const memorisedReports = pgTable("memorised_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => inventoryLocations.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  reportKey: text("report_key").notNull(),
  category: text("category").notNull(),
  currency: text("currency").notNull().default("AED"),
  periodStart: text("period_start").notNull().default(""),
  periodEnd: text("period_end").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_memorised_reports_user_company_report").on(table.userId, table.companyId, table.reportKey),
  index("idx_memorised_reports_user_company_category").on(table.userId, table.companyId, table.category),
]);

export const vatAdjustments = pgTable("vat_adjustments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => inventoryLocations.id, { onDelete: "set null" }),
  adjustmentDate: text("adjustment_date").notNull(),
  reference: text("reference").notNull(),
  direction: text("direction", { enum: ["increase", "decrease"] }).notNull(),
  amount: doublePrecision("amount").notNull(),
  reason: text("reason").notNull(),
  createdByUserId: integer("created_by_user_id").references(() => appUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("idx_vat_adjustments_company_date").on(table.companyId, table.adjustmentDate), uniqueIndex("idx_vat_adjustments_company_reference").on(table.companyId, table.reference)]);

export const vatReturns = pgTable("vat_returns", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => inventoryLocations.id, { onDelete: "set null" }),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  reference: text("reference").notNull(),
  outputVat: doublePrecision("output_vat").notNull().default(0),
  inputVat: doublePrecision("input_vat").notNull().default(0),
  adjustments: doublePrecision("adjustments").notNull().default(0),
  netVatDue: doublePrecision("net_vat_due").notNull().default(0),
  status: text("status", { enum: ["filed"] }).notNull().default("filed"),
  filedByUserId: integer("filed_by_user_id").references(() => appUsers.id, { onDelete: "set null" }),
  filedAt: timestamp("filed_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("idx_vat_returns_company_period").on(table.companyId, table.periodStart, table.periodEnd), uniqueIndex("idx_vat_returns_company_reference").on(table.companyId, table.reference)]);

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
  ledgerAccountId: integer("ledger_account_id"),
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
  hsCode: text("hs_code").notNull().default(""),
  countryOfOrigin: text("country_of_origin").notNull().default(""),
  dimensionText: text("dimension_text").notNull().default(""),
  lengthCm: doublePrecision("length_cm").notNull().default(0),
  widthCm: doublePrecision("width_cm").notNull().default(0),
  heightCm: doublePrecision("height_cm").notNull().default(0),
  weightKg: doublePrecision("weight_kg").notNull().default(0),
  quantity: doublePrecision("quantity").notNull().default(0),
  reorderPoint: doublePrecision("reorder_point").notNull().default(0),
  salesPrice: doublePrecision("sales_price").notNull().default(0),
  cost: doublePrecision("cost").notNull().default(0),
  lastPurchasePrice: doublePrecision("last_purchase_price").notNull().default(0),
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
  salesman: text("salesman").notNull().default(""),
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
  salesman: text("salesman").notNull().default(""),
  isImport: boolean("is_import").notNull().default(false),
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
  sourceTransactionId: integer("source_transaction_id"),
  convertedInvoiceId: integer("converted_invoice_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("idx_transactions_company_date").on(table.companyId, table.transactionDate), index("idx_transactions_company_type_status").on(table.companyId, table.type, table.status), uniqueIndex("idx_transactions_source_conversion").on(table.sourceTransactionId)]);

export const transactionLines = pgTable("transaction_lines", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => items.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  quantity: doublePrecision("quantity").notNull().default(1),
  unitPrice: doublePrecision("unit_price").notNull().default(0),
  unitCost: doublePrecision("unit_cost").notNull().default(0),
  vatCode: text("vat_code").notNull().default("STANDARD"),
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

export const inventoryCheckReports = pgTable("inventory_check_reports", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  locationId: integer("location_id").notNull().references(() => inventoryLocations.id, { onDelete: "cascade" }),
  memo: text("memo").notNull().default(""),
  createdByUserId: integer("created_by_user_id").references(() => appUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("idx_inventory_check_reports_company_date").on(table.companyId, table.createdAt), index("idx_inventory_check_reports_location").on(table.locationId)]);

export const inventoryCheckLines = pgTable("inventory_check_lines", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => inventoryCheckReports.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => items.id, { onDelete: "set null" }),
  itemNumber: text("item_number").notNull().default(""),
  sku: text("sku").notNull(),
  itemName: text("item_name").notNull(),
  systemQuantity: doublePrecision("system_quantity").notNull().default(0),
  countedQuantity: doublePrecision("counted_quantity"),
}, (table) => [index("idx_inventory_check_lines_report").on(table.reportId), index("idx_inventory_check_lines_item").on(table.itemId)]);

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  systemRole: text("system_role"),
  currency: text("currency").notNull().default("AED"),
  parentAccountId: integer("parent_account_id").references((): AnyPgColumn => accounts.id, { onDelete: "set null" }),
  balance: doublePrecision("balance").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_accounts_company_code").on(table.companyId, table.code), uniqueIndex("idx_accounts_company_system_role_currency").on(table.companyId, table.systemRole, table.currency), index("idx_accounts_parent").on(table.parentAccountId)]);

export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => inventoryLocations.id, { onDelete: "set null" }),
  transactionId: integer("transaction_id").references(() => transactions.id, { onDelete: "cascade" }),
  entryDate: text("entry_date").notNull(),
  reference: text("reference").notNull(),
  description: text("description").notNull().default(""),
  posted: boolean("posted").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("idx_journal_entries_company_date").on(table.companyId, table.entryDate), index("idx_journal_entries_location_date").on(table.locationId, table.entryDate)]);

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

export const authRateLimits = pgTable("auth_rate_limits", {
  bucket: text("bucket").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [index("idx_auth_rate_limits_reset").on(table.resetAt)]);

export const idempotencyRequests = pgTable("idempotency_requests", {
  userId: integer("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  requestKey: text("request_key").notNull(),
  requestHash: text("request_hash").notNull(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  responseBody: text("response_body"),
  responseStatus: integer("response_status"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.requestKey] })]);
