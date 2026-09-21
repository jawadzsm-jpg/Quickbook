"use client";
import { FinancialReport } from "./financial-report";
import type { FinancialReportData } from "@/lib/financial-reports";
import { SharedItemCatalogue } from "@/app/shared-item-catalogue";
import { SharedOutOfStock } from "@/app/shared-out-of-stock";
import { ReportDateFilter } from "./report-date-filter";
import { reportPeriod, type ReportPeriod } from "@/lib/report-period";
import { CompanyClearButton } from "./company-clear-button";
import { CompanyTemplateDesigner } from "./company-template-designer";

import { ActiveCustomersReport } from "./active-customers-report";
import { CustomerOpenBalance } from "./customer-open-balance";
import type { OpenBalanceData } from "@/lib/customer-open-balance";
import { DocumentExtraFields } from "./document-extra-fields";
import { AccountHistory } from "./account-history";
import { useSkuLock, SkuLockNotice } from "./use-sku-lock";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { PaymentSalesRep } from "./payment-sales-rep";
import { PaidInvoiceStamp } from "./paid-invoice-stamp";
import { StatementFilters, StatementHeading, type StatementData } from "./statement-layout";
import { SalesSourceInvoicing } from "./sales-source-invoicing";
import { OpenSalesDocuments } from "./open-sales-documents";
import { OpenPurchaseOrders } from "./open-purchase-orders";
import { PurchaseOrderReceiving } from "./purchase-order-receiving";
import { UnpaidInvoices } from "./unpaid-invoices";
import { UnpaidBills } from "./unpaid-bills";
import { ProfitLossReport } from "./profit-loss-report";
import type { PnlMeta, PnlReport } from "@/lib/profit-loss";
import { LiveProfitLossSummary } from "./live-profit-loss-summary";
import { dashboardMetrics } from "@/lib/dashboard-metrics";
import { filterZeroQohRows, hasInventoryQohFilter } from "@/lib/inventory-report-filter";
import { filterRecordListByDate, recordListReport } from "@/lib/record-list-export";
import { reportCsv, reportFilename, reportPdf, reportWorkbook } from "@/lib/report-export";
import { convertInvoiceLines, invoiceCurrencyAmount, validDocumentRate, type PricedInvoiceLine } from "@/lib/invoice-pricing";
import { SalesDocumentTemplate, salesDocumentModeForTransaction } from "./sales-document-template";
import {
  AlertTriangle, ArrowRightLeft, BadgeDollarSign, Bell, BookOpen, BookOpenCheck, BookmarkPlus, Boxes, Building2, CheckCircle2, Copy,
  Check, ChevronDown, ChevronRight, CircleDollarSign, Clock3, Download, FileBarChart2, FileSpreadsheet, FileText, Landmark,
  Eye, ImageUp, KeyRound, LayoutDashboard, LogOut, PackageCheck, PackageSearch, PackageX, Palette, Pencil, Plus, ReceiptText, RefreshCw,
  Search, Settings, ShieldCheck, ShoppingCart, Stamp, Sun, Moon, Table2, Trash2, Users, WalletCards, Percent,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { specificationFields } from "@/lib/specification-presets";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { MultiLineTransferCenter } from "@/app/transfer-center";
import { StockPricing } from "@/app/stock-pricing";
import { InventoryOverview } from "@/app/inventory-overview";
import { InventoryCheckReports } from "@/app/inventory-check-reports";
import { ItemLogisticsCenter } from "@/app/item-logistics-center";
import { UserRoleCenter } from "@/app/user-role-center";
import { VatCodeCenter, type VatCodeRecord } from "@/app/vat-code-center";
import { CurrencyRateCenter, type ExchangeRateRecord } from "@/app/currency-rate-center";
import { JournalEntryCenter } from "@/app/journal-entry-center";
import { VatManagementCenter } from "@/app/vat-management-center";

import { SerialNumberSearch } from "./serial-number-search";

type View = "serial-search" | "stock-pricing" | "dashboard" | "inventory-overview" | "sales" | "receive-payment" | "purchases" | "write-cheque" | "customers" | "vendors" | "inventory" | "item-logistics" | "inventory-check-reports" | "transfers" | "banking" | "journal-entries" | "accounts" | "vat-management" | "employees" | "reports" | "companies" | "company-setup" | "inventories" | "invoice-series" | "currencies" | "vat-codes" | "admin-controls";
type AppRole = "admin" | "accountant" | "sales" | "purchasing" | "inventory" | "viewer";
type UserTheme = "emerald" | "ocean" | "indigo" | "violet" | "rose" | "amber";
type AppearanceMode = "light" | "dark";
type CurrentUser = { isAllAdmin?: boolean; id: number; fullName: string; email: string; avatarData: string; themeColor: string; appearanceMode: AppearanceMode; role: AppRole; mustChangePassword: boolean };
type Kind = "transactions" | "contacts" | "items" | "accounts";
type DataRecord = Record<string, string | number | boolean> & { id: number };
type LineForm = PricedInvoiceLine & { id?: number; comments?: string; serialNumber?: string; freightCharge?: string; itemId: string; description: string; quantity: string; unitPrice: string; unitCost: string; vatCode: string; vatRate: string };
type InventoryLocation = { id: number; companyId: number; name: string; code: string; invoicePrefix: string; nextInvoiceNumber: number; receivable?: number; payable?: number };
type CompanyWorkspace = { id: number; name: string; baseCurrency: string; locations: InventoryLocation[] };
type CompanySetup = { id: number; name: string; baseCurrency: string; logoData: string; rightLogoData: string; documentDesign: string; stampData: string; addressLine1: string; addressLine2: string; city: string; country: string; phone: string; email: string; trn: string; bankName: string; bankAccountName: string; bankAccountNumber: string; bankIban: string; bankSwift: string; bankCurrency: string; documentTemplate: "classic" | "modern" | "minimal"; documentColor: string };
type ReportData = { financial?: FinancialReportData["financial"]; period?: ReportPeriod; pnl?: PnlMeta; summary?: PnlReport["summary"]; activeCustomers?: { canViewAccounts: boolean; asOf: string; count: number }; openBalance?: OpenBalanceData; statement?: StatementData; key?: string; companyId?: number; canEditPrices?: boolean; canViewAccounts?: boolean; accountLinkIssues?: string[]; title: string; description?: string; generatedAt: string; currency: string; columns: Array<{ key: string; label: string; type?: "money" }>; rows: Array<Record<string, string | number>>; chart?: { labelKey: string; incomeKey: string; expenseKey: string; incomeLabel?: string; expenseLabel?: string } };
type MemorisedReportRecord = { customer?: string; statementDate?: string; memo?: string; id: number; companyId: number; locationId: number | null; name: string; reportKey: string; category: ReportCategory; currency: string; periodStart: string; periodEnd: string; updatedAt: string };
type ReportContext = { key: string; locationId: number; currency: string; periodStart: string; periodEnd: string };
type TransactionDetail = { record: DataRecord; lines: DataRecord[]; journal: DataRecord[]; partyContact?: DataRecord | null };

const userThemes: Array<{ value: UserTheme; label: string; color: string }> = [
  { value: "emerald", label: "Emerald", color: "#10b981" },
  { value: "ocean", label: "Ocean", color: "#0ea5e9" },
  { value: "indigo", label: "Indigo", color: "#6366f1" },
  { value: "violet", label: "Violet", color: "#8b5cf6" },
  { value: "rose", label: "Rose", color: "#f43f5e" },
  { value: "amber", label: "Amber", color: "#f59e0b" },
];
const isUserTheme = (value: string): value is UserTheme => userThemes.some((theme) => theme.value === value);

const invoiceNumberPreview = (companyId: number, location: InventoryLocation) =>
  `C${String(companyId).padStart(3, "0")}-${location.invoicePrefix}-INV-${String(location.nextInvoiceNumber).padStart(4, "0")}`;

const navGroups = [
  { label: "OVERVIEW", items: [
    { id: "dashboard", label: "Company Home", icon: LayoutDashboard },
    { id: "inventory-overview", label: "Inventory Overview", icon: Boxes },
  ] },
  { label: "CUSTOMERS", items: [
    { id: "sales", label: "Sales & Invoicing", icon: ReceiptText },
    { id: "receive-payment", label: "Receive Payment", icon: CircleDollarSign },
    { id: "customers", label: "Customer Center", icon: Users },
  ] },
  { label: "VENDORS", items: [
    { id: "purchases", label: "Purchases & Bills", icon: ShoppingCart },
    { id: "write-cheque", label: "Write Cheque", icon: WalletCards },
    { id: "vendors", label: "Vendor Center", icon: Building2 },
  ] },
  { label: "COMPANY", items: [
    { id: "inventory", label: "Inventory", icon: PackageSearch },
    { id: "serial-search", label: "Serial Number Search", icon: Search },
    { id: "stock-pricing", label: "Stock Pricing", icon: CircleDollarSign },
    { id: "item-logistics", label: "HS Code & Dimensions", icon: PackageCheck },
    { id: "inventory-check-reports", label: "Inventory Check Reports", icon: PackageCheck },
    { id: "transfers", label: "Stock Transfers", icon: ArrowRightLeft },
    { id: "banking", label: "Banking", icon: Landmark },
    { id: "journal-entries", label: "General Journal", icon: BookOpenCheck },
    { id: "accounts", label: "Chart of Accounts", icon: BookOpen },
    { id: "vat-management", label: "VAT Management", icon: Percent },
    { id: "employees", label: "Employees & HR", icon: WalletCards },
    { id: "reports", label: "Reports", icon: FileBarChart2 },
  ] },
  { label: "MANAGEMENT", items: [
    { id: "companies", label: "Companies", icon: Building2 },
    { id: "company-setup", label: "Company Setup", icon: Settings },
    { id: "inventories", label: "Inventories", icon: PackageSearch },
    { id: "invoice-series", label: "Invoice Series", icon: ReceiptText },
    { id: "currencies", label: "Currencies", icon: CircleDollarSign },
    { id: "vat-codes", label: "VAT Codes", icon: Percent },
    { id: "admin-controls", label: "Admin Controls", icon: ShieldCheck },
  ] },
] as const;

const roleLabels: Record<AppRole, string> = {
  admin: "Administrator",
  accountant: "Accountant",
  sales: "Sales",
  purchasing: "Purchasing",
  inventory: "Inventory Manager",
  viewer: "Viewer",
};

const roleViews: Record<AppRole, readonly View[]> = {
  admin: navGroups.flatMap((group) => group.items.map((item) => item.id)),
  accountant: ["serial-search", "dashboard", "inventory-overview", "inventory-check-reports", "sales", "receive-payment", "customers", "purchases", "write-cheque", "vendors", "banking", "journal-entries", "accounts", "vat-management", "reports"],
  sales: ["serial-search", "dashboard", "inventory-overview", "inventory-check-reports", "sales", "receive-payment", "customers"],
  purchasing: ["serial-search", "dashboard", "inventory-overview", "inventory-check-reports", "purchases", "write-cheque", "vendors"],
  inventory: ["serial-search", "dashboard", "inventory-overview", "inventory", "item-logistics", "inventory-check-reports", "transfers"],
  viewer: ["serial-search", "dashboard", "inventory-overview", "inventory-check-reports", "reports"],
};

const roleWriteViews: Record<AppRole, readonly View[]> = {
  admin: ["sales", "receive-payment", "customers", "purchases", "write-cheque", "vendors", "inventory", "item-logistics", "inventory-check-reports", "transfers", "banking", "journal-entries", "accounts", "employees", "companies", "inventories", "invoice-series", "currencies", "vat-codes", "admin-controls"],
  accountant: ["sales", "receive-payment", "customers", "purchases", "write-cheque", "vendors", "banking", "journal-entries", "accounts", "vat-management"],
  sales: ["sales", "receive-payment", "customers"],
  purchasing: ["purchases", "write-cheque", "vendors"],
  inventory: ["inventory", "item-logistics", "transfers"],
  viewer: [],
};

const viewTitles: Record<View, { title: string; sub: string }> = {
  dashboard: { title: "Company Home", sub: "Your financial position at a glance" },
  "serial-search": { title: "Serial Number Search", sub: "Purchase and sales history by serial number" },
  "stock-pricing": { title: "Stock Pricing", sub: "Company GRN and selling prices by inventory" },
  "inventory-overview": { title: "Inventory Overview", sub: "All company stock, specifications, quantities and prices" },
  sales: { title: "Sales & Invoicing", sub: "Estimates, proforma invoices, sales orders, invoices, receipts and credits" },
  "receive-payment": { title: "Receive Payment", sub: "Record customer payments for the selected inventory" },
  purchases: { title: "Purchases & Bills", sub: "Purchase orders, bills, expenses and vendor payments" },
  "write-cheque": { title: "Write Cheque", sub: "Pay vendors and reduce payables for the selected inventory" },
  customers: { title: "Customer Center", sub: "Customer balances, contacts and activity" },
  vendors: { title: "Vendor Center", sub: "Suppliers, payables and purchasing history" },
  inventory: { title: "Inventory Center", sub: "Stock levels, pricing, costs and reorder controls" },
  "item-logistics": { title: "HS Code, COO & Dimensions", sub: "Maintain customs classifications, country of origin, dimensions and weight" },
  "inventory-check-reports": { title: "Inventory Check Reports", sub: "Create, print and review physical stock count reports" },
  transfers: { title: "Stock Transfers", sub: "Move stock between companies and inventory locations" },
  banking: { title: "Banking", sub: "Deposits, cheques, transfers and account activity" },
  "journal-entries": { title: "General Journal Entries", sub: "Post balanced debits and credits directly to the ledger" },
  accounts: { title: "Chart of Accounts", sub: "Assets, liabilities, equity, income and expenses" },
  "vat-management": { title: "VAT Management", sub: "Review, adjust, report and file VAT" },
  employees: { title: "Employees & HR", sub: "Employee records and balances" },
  reports: { title: "Report Center", sub: "Financial, sales, purchasing and inventory analysis" },
  companies: { title: "Companies", sub: "Create and switch between separate company files" },
  "company-setup": { title: "Company Setup", sub: "Logo, address, bank details and document design" },
  inventories: { title: "Inventories", sub: "Manage warehouses, showrooms and stock locations" },
  "invoice-series": { title: "Invoice Series", sub: "Customize invoice numbering for every company inventory" },
  currencies: { title: "Currencies", sub: "Set company currency and transaction currencies" },
  "vat-codes": { title: "VAT Codes", sub: "Manage tax rates and usage details for transaction dropdowns" },
  "admin-controls": { title: "Admin Controls", sub: "Protect restricted inventory operations for this company" },
};

const transactionTypes: Record<string, string[]> = {
  sales: ["invoice", "quotation", "estimate", "proforma invoice", "sales order", "sales receipt", "statement charge", "finance charge", "credit memo", "customer payment"],
  "receive-payment": ["customer payment"],
  purchases: ["bill", "purchase order", "item receipt", "received item bill", "expense", "vendor credit", "bill payment"],
  "write-cheque": ["cheque"],
  banking: ["deposit", "cheque", "credit card charge", "transfer", "cheque order", "opening balance"],
  dashboard: ["invoice", "bill", "expense", "deposit", "cheque", "journal entry"],
};

const itemTypeValues = ["service", "stock-part", "non-stock-part", "other-charge", "subtotal", "group", "discount", "payment", "vat-item", "vat-group"] as const;
type InventoryItemType = (typeof itemTypeValues)[number];
const itemTypeDetails: Record<InventoryItemType, { label: string; description: string; linkedArea: string }> = {
  service: { label: "Service", description: "Use for services you charge for or purchase, such as labour, consulting hours, or professional fees.", linkedArea: "Sales and purchase document lines" },
  "stock-part": { label: "Stock Part", description: "Use for products you buy, keep in stock, and sell. Stock documents update quantity and inventory value.", linkedArea: "Sales, purchases, inventory and stock reports" },
  "non-stock-part": { label: "Non-stock Part", description: "Use for products you buy or sell without tracking on-hand inventory.", linkedArea: "Sales and purchase document lines" },
  "other-charge": { label: "Other Charge", description: "Use for freight, handling, setup fees, or other non-stock charges.", linkedArea: "Sales and purchase document lines" },
  subtotal: { label: "Subtotal", description: "Use to identify subtotal behaviour for sales documents.", linkedArea: "Sales & Invoicing totals" },
  group: { label: "Group", description: "Use to identify grouped or bundled products and services.", linkedArea: "Sales & Invoicing bundles" },
  discount: { label: "Discount", description: "Use to identify a sales discount item.", linkedArea: "Sales & Invoicing discount controls" },
  payment: { label: "Payment", description: "Use to identify customer payment handling.", linkedArea: "Receive Payment" },
  "vat-item": { label: "VAT Item", description: "Use to identify a single VAT/tax item.", linkedArea: "VAT selectors and VAT Codes" },
  "vat-group": { label: "VAT Group", description: "Use to identify grouped VAT/tax handling.", linkedArea: "VAT selectors and VAT Codes" },
};
const documentLineItemTypes = new Set<InventoryItemType>(["service", "stock-part", "non-stock-part", "other-charge"]);
function itemTypeOf(value: unknown): InventoryItemType {
  const candidate = String(value || "stock-part");
  return (itemTypeValues as readonly string[]).includes(candidate) ? candidate as InventoryItemType : "stock-part";
}
function itemCanBeDocumentLine(item: DataRecord) {
  return String(item.status || "active") !== "inactive" && documentLineItemTypes.has(itemTypeOf(item.itemType));
}

const allReports = [
  ["Profit & Loss Standard", "Income and expenses by period", "Profit & Loss", "profit-loss"],
  ["Profit & Loss by Item", "Sales, purchase cost, cost of sales and profit by item", "Profit & Loss", "profit-loss-item"],
  ["Profit & Loss by Sales Rep", "Sales, purchase cost, cost of sales and profit by sales rep", "Profit & Loss", "profit-loss-rep"],
  ["Profit & Loss Detail", "Every income and expense ledger posting", "Profit & Loss", "profit-loss-detail"],
  ["Profit & Loss YTD Comparison", "Current year-to-date against the same prior-year period", "Profit & Loss", "profit-loss-ytd"],
  ["Profit & Loss Prev Year Comparison", "This year against the previous calendar year", "Profit & Loss", "profit-loss-prev-year"],
  ["Profit & Loss by Job", "Net income grouped by inventory or business location", "Profit & Loss", "profit-loss-job"],
  ["Profit & Loss by Class", "Income and expense grouped by transaction type", "Profit & Loss", "profit-loss-class"],
  ["Profit & Loss Unclassified", "Income and expense postings without a Chart of Accounts match", "Profit & Loss", "profit-loss-unclassified"],
  ["Income by Customer Summary", "Sales income total for each customer", "Financial", "income-customer-summary"],
  ["Income by Customer Detail", "Invoice and receipt income by customer and document", "Financial", "income-customer-detail"],
  ["Expenses by Supplier Summary", "Purchase and expense totals for each supplier", "Financial", "expenses-supplier-summary"],
  ["Expenses by Supplier Detail", "Bills, expenses, cheques, and card charges by supplier", "Financial", "expenses-supplier-detail"],
  ["Income & Expense Graph", "Monthly income and expenses shown visually", "Financial", "income-expense-graph"],
  ["Realised Gains & Losses", "Exchange differences on settled foreign-currency transactions", "Financial", "realised-gains-losses"],
  ["Unrealised Gains & Losses", "Current exchange revaluation of open foreign balances", "Financial", "unrealised-gains-losses"],
  ["Balance Sheet Standard", "Assets, liabilities and equity", "Financial", "balance-sheet"],
  ["Balance Sheet Detail", "Detailed account balances with debits and credits", "Financial", "balance-sheet-detail"],
  ["Balance Sheet Summary", "Totals by Assets, Liabilities, and Equity", "Financial", "balance-sheet-summary"],
  ["Balance Sheet Prev Year Comparison", "Current balances compared with the previous year", "Financial", "balance-sheet-prev-year"],
  ["Net Worth Graph", "Assets less liabilities with a visual summary", "Financial", "net-worth-graph"],
  ["Statement of Cash Flows", "Operating cash movement", "Financial", "cash-flow"],
  ["Cash Flow Forecast", "Projected cash from open receivables and payables", "Financial", "cash-flow-forecast"],
  ["Budget Overview", "Income and expense budgets with current performance", "Budgets", "budget-overview"],
  ["Budget vs. Actual", "Account-level budget comparison and variance", "Budgets", "budget-actual"],
  ["Profit & Loss Budget Performance", "Budget performance for income and expenses", "Profit & Loss", "budget-profit-loss"],
  ["Budget vs. Actual Graph", "Monthly budget and actual performance", "Budgets", "budget-actual-graph"],
  ["Trial Balance", "Debit and credit balances by account", "Accountant", "trial-balance"],
  ["General Ledger", "Complete account transaction detail", "Accountant", "general-ledger"],
  ["Transaction Detail by Account", "Account activity with a running balance", "Accountant", "transaction-detail-account"],
  ["Journal", "Posted debits and credits", "Accountant", "journal"],
  ["Audit Trail", "Recorded changes across accounting and inventory", "Accountant", "audit-trail"],
  ["Customer Credit Card Audit Trail", "Customer credit-card activity and status", "Accountant", "customer-credit-card-audit"],
  ["Voided/Deleted Transactions Summary", "Deleted transaction totals grouped by action", "Accountant", "deleted-transactions-summary"],
  ["Voided/Deleted Transactions Detail", "Detailed history of voided and deleted transactions", "Accountant", "deleted-transactions-detail"],
  ["Transaction List by Date", "All activity in chronological order", "Accountant", "transactions"],
  ["Transaction History", "Chronological document and audit activity", "Accountant", "transaction-history"],
  ["Transaction Journal", "Debit and credit postings generated by transactions", "Accountant", "transaction-journal"],
  ["Account Listing", "Chart of Accounts with type, currency, and hierarchy", "Lists", "account-listing"],
  ["Item Price List", "Current selling prices by item", "Lists", "item-price-list"],
  ["Item Price List for Price Level", "Selling prices, costs, and margins by price level", "Lists", "item-price-level-list"],
  ["Item Listing", "Complete inventory item directory", "Lists", "item-listing"],
  ["Fixed Asset Listing", "Fixed-asset accounts and their current balances", "Lists", "fixed-asset-listing"],
  ["Customer Phone List", "Customer telephone and WhatsApp directory", "Lists", "customer-phone-list"],
  ["Customer Contact List", "Complete customer contact directory", "Lists", "customer-contact-list"],
  ["Supplier Phone List", "Supplier telephone and WhatsApp directory", "Lists", "supplier-phone-list"],
  ["Supplier Contact List", "Complete supplier contact directory", "Lists", "supplier-contact-list"],
  ["Employee Contact List", "Employee telephone and email directory", "Lists", "employee-contact-list"],
  ["Other Names Phone List", "Telephone directory for transaction names not saved as contacts", "Lists", "other-names-phone-list"],
  ["Other Names Contact List", "Transaction names not saved as customers, suppliers, or employees", "Lists", "other-names-contact-list"],
  ["Terms Listing", "Payment terms found across sales and purchase documents", "Lists", "terms-listing"],
  ["To Do Notes", "Open transaction notes and due dates", "Lists", "to-do-notes"],
  ["Memorised Transaction Listing", "Transactions marked as memorised, recurring, or templates", "Lists", "memorised-transactions"],
  ["Bank Register", "Bank account debits, credits and running balances", "Banking", "bank-register"],
  ["Bank Reconciliation", "Cleared and uncleared banking activity", "Banking", "bank-reconciliation"],
  ["VAT Summary Report", "VAT collected, recoverable, and net VAT due", "VAT", "vat-summary"],
  ["VAT Detail Report", "Transaction-level VAT amounts by code", "VAT", "vat-detail"],
  ["Unassigned VAT Amounts Detail Report", "Taxable postings without a VAT code", "VAT", "vat-unassigned"],
  ["VAT Exception Report", "Transactions that need VAT review", "VAT", "vat-exceptions"],
  ["VAT Item Summary", "VAT totals grouped by item", "VAT", "vat-item-summary"],
  ["EC Sales List", "Cross-border customer sales", "VAT", "ec-sales"],
  ["Reverse Charge List", "Purchases subject to reverse charge", "VAT", "reverse-charge"],
  ["VAT Code List", "Available VAT codes, rates, and descriptions", "VAT", "vat-code-list"],
  ["A/R Aging Summary", "Outstanding customer balances by age", "Customers", "ar-aging-summary"],
  ["A/R Aging Detail", "Open invoices and credit detail", "Customers", "ar-aging-detail"],
  ["Customer Balance Summary", "Balance totals by customer", "Customers", "customer-balances"],
  ["Customers with Overdue Invoices", "Past-due unpaid invoices linked to customer receivable accounts", "Customers", "customers-overdue-invoices"],
  ["Active Customers", "Active customer contacts, balances and linked receivable accounts", "Customers", "active-customers"],
  ["Customer Open Balance", "Unpaid invoices, unused payments and credits linked to receivable accounts", "Customers", "customer-open-balance"],
  ["Customer Balance Detail", "Customer charges, payments, credits, and running balances", "Customers", "customer-balance-detail"],
  ["Open Invoices", "Unpaid and partially paid invoices", "Customers", "open-invoices"],
  ["Collections Report", "Customer balances, overdue documents, and contact details", "Customers", "collections-report"],
  ["Average Days to Pay Summary", "Average customer payment time", "Customers", "average-days-to-pay-summary"],
  ["Average Days to Pay", "Invoice settlement timing by customer", "Customers", "average-days-to-pay-detail"],
  ["Accounts Receivable Graph", "Monthly receivable charges and collections", "Customers", "accounts-receivable-graph"],
  ["Unbilled Costs by Job", "Open purchase commitments grouped by inventory or job", "Customers", "unbilled-costs-job"],
  ["Transaction List by Customer", "Customer activity in chronological order", "Customers", "customer-transactions"],
  ["Online Received Payments", "Customer payments received and posted", "Customers", "online-received-payments"],
  ["Customer Statements", "Charges, payments, credits and running balances", "Customers", "customer-statements"],
  ["Daily Sales Summary", "Daily document count, quantity, and sales totals", "Sales", "daily-sales-summary"],
  ["Daily Sales Detail", "Every invoice and sales receipt by date", "Sales", "daily-sales-detail"],
  ["Sales by Customer Summary", "Revenue grouped by customer", "Sales", "sales-by-customer"],
  ["Sales by Customer Detail", "Customer sales by document and date", "Sales", "sales-by-customer-detail"],
  ["Sales by Item Summary", "Quantity and revenue grouped by product", "Sales", "sales-by-item"],
  ["Sales by Item Detail", "Every sold item line with customer and document", "Sales", "sales-by-item-detail"],
  ["Sales by Rep Summary", "Revenue grouped by salesman", "Sales", "sales-by-rep-summary"],
  ["Sales by Rep Detail", "Sales documents for every salesman", "Sales", "sales-by-rep-detail"],
  ["Sales by Ship To Address", "Customer sales grouped by delivery country or address", "Sales", "sales-by-ship-to"],
  ["Sales Graph", "Monthly sales and refunds shown visually", "Sales", "sales-graph"],
  ["Pending Sales", "Open estimates, proforma invoices, sales orders, and invoices", "Sales", "pending-sales"],
  ["Sales Order Fulfilment", "Open and fulfilled orders", "Sales", "sales-orders"],
  ["Vendor Statements", "Vendor bills, payments, credits and running balances", "Vendors", "vendor-statements"],
  ["A/P Aging Summary", "Outstanding vendor balances by age", "Vendors", "ap-aging-summary"],
  ["A/P Aging Detail", "Open bills and credits", "Vendors", "ap-aging-detail"],
  ["Supplier Balance Summary", "Accounts Payable totals by supplier", "Vendors", "vendor-balances"],
  ["Supplier Balance Detail", "Supplier bills, payments, credits, and running balances", "Vendors", "supplier-balance-detail"],
  ["Unpaid Bills Detail", "Open and overdue supplier bills", "Vendors", "unpaid-bills-detail"],
  ["Accounts Payable Graph", "Monthly payable charges and supplier payments", "Vendors", "accounts-payable-graph"],
  ["Transaction List by Supplier", "Supplier activity in chronological order", "Vendors", "supplier-transactions"],
  ["Purchases by Supplier Summary", "Purchase totals grouped by supplier", "Purchases", "purchases-by-vendor"],
  ["Purchases by Supplier Detail", "Supplier purchase documents by date", "Purchases", "purchases-by-supplier-detail"],
  ["Purchases by Item Summary", "Purchased quantity and cost grouped by item", "Purchases", "purchases-by-item"],
  ["Purchases by Item Detail", "Every purchased item line with supplier and document", "Purchases", "purchases-by-item-detail"],
  ["Open Purchase Orders", "Committed purchases not yet closed", "Purchases", "open-purchase-orders"],
  ["Open Purchase Orders Detail", "Open purchase-order line items", "Purchases", "open-purchase-orders-detail"],
  ["Open Purchase Orders by Job", "Open purchase commitments by inventory or job", "Purchases", "open-purchase-orders-job"],
  ["Stock Pricing & Profit/Loss", "Purchase, freight, GRN and selling prices with estimated margins", "Profit & Loss", "stock-pricing-profit"],
  ["Stock Valuation Summary", "Stock quantity and value grouped by category", "Inventory", "inventory-valuation"],
  ["Stock Valuation Detail", "Quantity, average cost, and value for every item", "Inventory", "inventory-valuation-detail"],
  ["Stock Status by Item", "Available quantity and reorder position by item", "Inventory", "inventory-status"],
  ["Stock Status by Supplier", "Stock quantity and value grouped by latest supplier", "Inventory", "inventory-status-supplier"],
  ["Physical Stock Worksheet", "Printable count sheet for stock verification", "Inventory", "physical-inventory"],
  ["Pending Builds", "Items below their reorder or build level", "Inventory", "pending-builds"],
  ["Item Profitability", "Gross profit by inventory item", "Profit & Loss", "item-profitability"],
] as const;

const reportCategoryOrder = ["Profit & Loss", "Financial", "Budgets", "Sales", "Customers", "Vendors", "Purchases", "Inventory", "Banking", "VAT", "Accountant", "Lists", "Company"] as const;
type ReportCategory = (typeof reportCategoryOrder)[number];

const currencies = ["AED", "USD", "EUR", "GBP", "SAR", "OMR", "QAR", "BHD", "KWD", "INR", "CNY", "HKD", "JPY", "CAD", "AUD", "CHF", "SGD", "NZD", "PKR", "BDT", "LKR", "MYR", "THB", "IDR", "KRW", "TRY", "ZAR"];
const formatMoney = (value: unknown, currency = "AED") => new Intl.NumberFormat("en-AE", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value ?? 0));
const today = () => new Date().toISOString().slice(0, 10);
const emptyCompanySetup = (id = 0, name = "Company", baseCurrency = "AED"): CompanySetup => ({ id, name, baseCurrency, logoData: "", rightLogoData: "", documentDesign: "", stampData: "", addressLine1: "", addressLine2: "", city: "", country: "United Arab Emirates", phone: "", email: "", trn: "", bankName: "", bankAccountName: "", bankAccountNumber: "", bankIban: "", bankSwift: "", bankCurrency: baseCurrency, documentTemplate: "modern", documentColor: "#10b981" });
type VatCodeOption = VatCodeRecord & { label: string };
const defaultVatCodeOptions: VatCodeOption[] = [
  { id: -1, companyId: 0, code: "STANDARD", name: "Standard rated", label: "STANDARD · Standard rated · 5%", rate: 5, description: "Standard UAE VAT rate", active: true, system: true },
  { id: -2, companyId: 0, code: "ZERO", name: "Zero rated", label: "ZERO · Zero rated · 0%", rate: 0, description: "Taxable supply charged at 0%", active: true, system: true },
  { id: -3, companyId: 0, code: "EXEMPT", name: "Exempt", label: "EXEMPT · Exempt · 0%", rate: 0, description: "Supply exempt from VAT", active: true, system: true },
  { id: -4, companyId: 0, code: "OUT_OF_SCOPE", name: "Out of scope", label: "OUT OF SCOPE · Out of scope · 0%", rate: 0, description: "Transaction outside the scope of VAT", active: true, system: true },
];
const vatRateForCode = (code: string, options: VatCodeOption[]) => String(options.find((option) => option.code === code)?.rate ?? 0);
const accountTypeValues = ["Income", "Expense", "Cost of Goods Sold", "Other Income", "Other Expense", "Fixed Asset", "Bank", "Loan", "Credit Card", "Equity", "Accounts Receivable", "Other Current Asset", "Other Asset", "Accounts Payable", "Other Current Liability", "Long Term Liability"];
const accountTypesForRole = (role: string) => {
  const allowed: Record<string, string[]> = {
    BANK: ["Bank"], AR: ["Accounts Receivable"], AP: ["Accounts Payable"],
    INVENTORY: ["Other Current Asset", "Other Asset"], INPUT_VAT: ["Other Current Asset"],
    OUTPUT_VAT: ["Other Current Liability"], EQUITY: ["Equity"], SALES: ["Income"],
    OTHER_INCOME: ["Other Income", "Income"], COGS: ["Cost of Goods Sold"],
    PURCHASES: ["Expense", "Cost of Goods Sold"], EXPENSE: ["Expense", "Other Expense"],
    PAYROLL: ["Expense"], SUSPENSE: ["Other Current Asset", "Other Asset", "Expense"],
  };
  return allowed[role] ?? accountTypeValues;
};
const accountRoleOptions = [
  ["BANK", "Bank / cash"], ["AR", "Accounts Receivable (A/R)"], ["AP", "Accounts Payable (A/P)"],
  ["INVENTORY", "Inventory asset"], ["INPUT_VAT", "Recoverable VAT"], ["OUTPUT_VAT", "VAT payable"],
  ["EQUITY", "Opening balance equity"], ["SALES", "Sales income"], ["OTHER_INCOME", "Other income"],
  ["COGS", "Cost of Goods Sold"], ["PURCHASES", "Purchases"], ["EXPENSE", "Operating expense"],
  ["PAYROLL", "Payroll expense"], ["SUSPENSE", "Suspense"],
] as const;
const controlAccountFor = (accounts: DataRecord[], role: "AR" | "AP", currency: string) => accounts.find((account) => account.active && account.systemRole === role && String(account.currency) === currency);
const linkedAccountName = (accounts: DataRecord[], role: string, fallback: string, currency?: string) => String(accounts.find((account) => account.active && account.systemRole === role && (!currency || String(account.currency) === currency))?.name ?? accounts.find((account) => account.active && account.systemRole === role)?.name ?? fallback);
const defaultBillPurchaseAccount = (accounts: DataRecord[]) => {
  const eligible = accounts.filter((account) => account.active && (
    ["PURCHASES", "EXPENSE", "COGS"].includes(String(account.systemRole))
    || ["Expense", "Other Expense", "Cost of Goods Sold"].includes(String(account.type))
  ));
  return String(
    eligible.find((account) => String(account.code) === "4000" && (account.systemRole === "COGS" || account.type === "Cost of Goods Sold" || /cost of goods/i.test(String(account.name))))?.name
    ?? eligible.find((account) => account.systemRole === "COGS")?.name
    ?? eligible.find((account) => account.type === "Cost of Goods Sold")?.name
    ?? eligible.find((account) => account.systemRole === "PURCHASES")?.name
    ?? eligible.find((account) => account.type === "Expense")?.name
    ?? eligible[0]?.name
    ?? "Cost of Goods Sold"
  );
};
const defaultPostingAccount = (type: string, accounts: DataRecord[]) => {
  if (type === "bill") return defaultBillPurchaseAccount(accounts);
  if (type === "bill payment") return linkedAccountName(accounts, "BANK", "Business Bank");
  if (["item receipt", "received item bill"].includes(type)) return linkedAccountName(accounts, "SUSPENSE", "Suspense");
  if (type === "cheque") return linkedAccountName(accounts, "AP", "Accounts Payable");
  if (type === "customer payment") return String(accounts.find((account) => account.active && (account.type === "Bank" || account.systemRole === "BANK"))?.name ?? "");
  if (["invoice", "quotation", "estimate", "proforma invoice", "sales order", "sales receipt", "statement charge", "credit memo"].includes(type)) return linkedAccountName(accounts, "SALES", "Sales Revenue");
  if (type === "finance charge") return linkedAccountName(accounts, "OTHER_INCOME", "Other Income");
  if (type === "expense") return linkedAccountName(accounts, "EXPENSE", "Operating Expenses");
  if (type === "deposit") return linkedAccountName(accounts, "OTHER_INCOME", "Other Income");
  if (type === "transfer") return String(accounts.find((account) => account.active && account.type === "Bank")?.name ?? linkedAccountName(accounts, "BANK", "Business Bank"));
  if (type === "credit card charge") return linkedAccountName(accounts, "EXPENSE", "Operating Expenses");
  if (type === "cheque order") return linkedAccountName(accounts, "BANK", "Business Bank");
  return linkedAccountName(accounts, "SUSPENSE", "Suspense");
};
const itemDisplayDescription = (item: DataRecord) => {
  try {
    const specifications = JSON.parse(String(item.specifications ?? "[]")) as Array<{ value?: string }>;
    const values = specifications.map((specification) => specification.value?.trim()).filter((value) => value && value.toLowerCase() !== "no").join(" | ");
    if (specifications.length) return values;
  } catch { /* Fall back to the saved description for older records. */ }
  return String(item.description ?? "").split(" | ").filter((value) => value.trim().toLowerCase() !== "no").join(" | ");
};

export default function EnterpriseApp({ currentUser }: { currentUser: CurrentUser }) {
  const [view, setView] = useState<View>("dashboard");
  const [records, setRecords] = useState<Record<Kind, DataRecord[]>>({ transactions: [], contacts: [], items: [], accounts: [] });
  const [loading, setLoading] = useState(true);
  const [documentInventory, setDocumentInventory] = useState<{ key: string; items: DataRecord[]; error?: string }>({ key: "", items: [] });
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editorKind, setEditorKind] = useState<Kind | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<LineForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportContext, setReportContext] = useState<ReportContext | null>(null);
  const [memorisedReports, setMemorisedReports] = useState<MemorisedReportRecord[]>([]);
  const [memoriseSaving, setMemoriseSaving] = useState(false);
  const [companies, setCompanies] = useState<CompanyWorkspace[]>([]);
  const [companySetup, setCompanySetup] = useState<CompanySetup>(emptyCompanySetup());
  const [activeCompanyId, setActiveCompanyId] = useState(0);
  const [activeLocationId, setActiveLocationId] = useState(0);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [invoiceInventoryOpen, setInvoiceInventoryOpen] = useState(false);
  const [vatCodeOptions, setVatCodeOptions] = useState<VatCodeOption[]>(defaultVatCodeOptions);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateRecord[]>([]);
  const [themeColor, setThemeColor] = useState<UserTheme>(isUserTheme(currentUser.themeColor) ? currentUser.themeColor : "emerald");
  const [themeSaving, setThemeSaving] = useState(false);
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(currentUser.appearanceMode === "dark" ? "dark" : "light");
  const [appearanceSaving, setAppearanceSaving] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.appearance = appearanceMode;
    return () => { delete document.documentElement.dataset.appearance; };
  }, [appearanceMode]);

  useEffect(() => {
    document.documentElement.dataset.userTheme = themeColor;
    return () => { delete document.documentElement.dataset.userTheme; };
  }, [themeColor]);

  const activeCompany = companies.find((company) => company.id === activeCompanyId);
  const activeLocations = useMemo(() => activeCompany?.locations ?? [], [activeCompany]);
  const baseCurrency = activeCompany?.baseCurrency ?? "AED";

  async function signOut() {
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.reload();
  }

  async function changeTheme(nextTheme: UserTheme) {
    if (nextTheme === themeColor || themeSaving) return;
    const previousTheme = themeColor;
    setThemeColor(nextTheme);
    setThemeSaving(true);
    try {
      const response = await fetch("/api/user-preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ themeColor: nextTheme }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save interface color");
      toast.success(`${userThemes.find((theme) => theme.value === nextTheme)?.label} theme saved`);
    } catch (error) {
      setThemeColor(previousTheme);
      toast.error(error instanceof Error ? error.message : "Could not save interface color");
    } finally { setThemeSaving(false); }
  }

  async function changeAppearance(nextMode: AppearanceMode) {
    if (nextMode === appearanceMode || appearanceSaving) return;
    const previousMode = appearanceMode;
    setAppearanceMode(nextMode);
    setAppearanceSaving(true);
    try {
      const response = await fetch("/api/user-preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appearanceMode: nextMode }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save appearance mode");
      toast.success(`${nextMode === "dark" ? "Dark" : "Light"} mode saved`);
    } catch (error) {
      setAppearanceMode(previousMode);
      toast.error(error instanceof Error ? error.message : "Could not save appearance mode");
    } finally { setAppearanceSaving(false); }
  }

  const loadWorkspaces = useCallback(async () => {
    try {
      const response = await fetch("/api/workspaces");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load companies");
      const nextCompanies = data.companies as CompanyWorkspace[];
      setCompanies(nextCompanies);
      setActiveCompanyId((current) => current && nextCompanies.some((company) => company.id === current) ? current : nextCompanies[0]?.id ?? 0);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load companies"); }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const kinds: Kind[] = ["transactions", "contacts", "items", "accounts"];
      const results = await Promise.all(kinds.map(async (kind) => {
        const response = await fetch(`/api/records?kind=${kind}&companyId=${activeCompanyId}&locationId=${activeLocationId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load records");
        return [kind, data.records] as const;
      }));
      setRecords(Object.fromEntries(results) as Record<Kind, DataRecord[]>);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load company data");
    } finally { setLoading(false); }
  }, [activeCompanyId, activeLocationId]);

  const loadVatCodes = useCallback(async () => {
    if (!activeCompanyId) return;
    try {
      const response = await fetch(`/api/vat-codes?companyId=${activeCompanyId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load VAT codes");
      const activeCodes = (data.codes as VatCodeRecord[]).filter((code) => code.active).map((code) => ({ ...code, label: `${code.code} · ${code.name} · ${Number(code.rate).toLocaleString()}%` }));
      setVatCodeOptions(activeCodes.length ? activeCodes : defaultVatCodeOptions);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load VAT codes"); }
  }, [activeCompanyId]);

  const loadExchangeRates = useCallback(async () => {
    if (!activeCompanyId) return;
    try {
      const response = await fetch(`/api/exchange-rates?companyId=${activeCompanyId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load exchange rates");
      setExchangeRates((data.rates as ExchangeRateRecord[]).filter((rate) => rate.active));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load exchange rates"); }
  }, [activeCompanyId]);

  const loadCompanySetup = useCallback(async () => {
    if (!activeCompanyId) return;
    try {
      const response = await fetch(`/api/company-setup?companyId=${activeCompanyId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load company setup");
      const record = data.record as CompanySetup;
      setCompanySetup({ ...record, stampData: record.stampData || "", bankCurrency: record.bankCurrency || record.baseCurrency });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load company setup"); }
  }, [activeCompanyId]);

  const loadMemorisedReports = useCallback(async () => {
    if (!activeCompanyId || !roleViews[currentUser.role].includes("reports")) return;
    try {
      const response = await fetch(`/api/memorised-reports?companyId=${activeCompanyId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load memorised reports");
      setMemorisedReports(data.records as MemorisedReportRecord[]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load memorised reports"); }
  }, [activeCompanyId, currentUser.role]);

  // Initial load synchronizes the client workspace with the persisted company file.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadWorkspaces(); }, [loadWorkspaces]);
  useEffect(() => {
    if (!activeCompany) return;
    // Keep the selected warehouse valid after changing or adding companies.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!activeLocations.some((location) => location.id === activeLocationId)) setActiveLocationId(activeLocations[0]?.id ?? 0);
  }, [activeCompany, activeLocationId, activeLocations]);
  // Refresh the selected company file whenever its company or warehouse changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (activeCompanyId && activeLocationId) loadData(); }, [activeCompanyId, activeLocationId, loadData]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (activeCompanyId) loadVatCodes(); }, [activeCompanyId, loadVatCodes]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (activeCompanyId) loadExchangeRates(); }, [activeCompanyId, loadExchangeRates]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (activeCompanyId) loadCompanySetup(); }, [activeCompanyId, loadCompanySetup]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (activeCompanyId) loadMemorisedReports(); }, [activeCompanyId, loadMemorisedReports]);

  const metrics = useMemo(() => {
    return dashboardMetrics(records.accounts);
  }, [records.accounts]);

  const currentKind: Kind = view === "customers" || view === "vendors" || view === "employees" ? "contacts" : view === "inventory" ? "items" : view === "accounts" ? "accounts" : "transactions";
  const managementView = view === "serial-search" || view === "inventory-overview" || view === "item-logistics" || view === "inventory-check-reports" || view === "transfers" || view === "journal-entries" || view === "vat-management" || view === "companies" || view === "company-setup" || view === "inventories" || view === "invoice-series" || view === "currencies" || view === "vat-codes" || view === "admin-controls";
  const visibleNavGroups = navGroups.map((group) => ({ ...group, items: group.items.filter((item) => roleViews[currentUser.role].includes(item.id)) })).filter((group) => group.items.length > 0);
  const canWriteCurrentView = roleWriteViews[currentUser.role].includes(view);
  const activeEditorKind = editorKind ?? currentKind;
  const salesDetailsOnly = activeEditorKind === "transactions" && editingRecordId !== null && ["invoice", "customer payment"].includes(form.type);
  const linkedInventoryDocument = activeEditorKind === "transactions" && ["bill", "invoice", "estimate", "proforma invoice", "sales order", "quotation"].includes(form.type);
  const documentLocationId = Number((form.type === "bill" ? form.billLocationId : form.transactionLocationId) || activeLocationId);
  const skuLock = useSkuLock(dialogOpen && !(form.type === "bill" && form.purchaseOrderId) && !(editingRecordId === null && form.type === "invoice" && form.salesSourceId) && ["items", "transactions"].includes(activeEditorKind) ? { resource: "records", kind: activeEditorKind, companyId: activeCompanyId, locationId: activeEditorKind === "items" ? activeLocationId : documentLocationId, id: activeEditorKind === "items" ? editingItemId : editingRecordId, ...(activeEditorKind === "items" ? { sku: form.sku || "" } : { lines: lines.map((line) => ({ itemId: line.itemId })) }) } : null);
  const documentInventoryKey = `${activeCompanyId}:${documentLocationId}`;
  const documentInventoryReady = documentInventory.key === documentInventoryKey && !documentInventory.error;
  const documentItems = linkedInventoryDocument ? documentInventoryReady ? documentInventory.items : [] : records.items;
  useEffect(() => {
    if (!dialogOpen || !linkedInventoryDocument || !activeCompanyId || !documentLocationId) return;
    const controller = new AbortController();
    fetch(`/api/records?kind=items&companyId=${activeCompanyId}&locationId=${documentLocationId}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load inventory items");
        if (!controller.signal.aborted) setDocumentInventory({ key: documentInventoryKey, items: data.records });
      }).catch((error) => {
        if (!controller.signal.aborted) setDocumentInventory({ key: documentInventoryKey, items: [], error: error instanceof Error ? error.message : "Could not load inventory items" });
      });
    return () => controller.abort();
  }, [dialogOpen, linkedInventoryDocument, activeCompanyId, documentLocationId, documentInventoryKey]);
  function updateDocumentForm(next: Record<string, string>) {
    if (["bill payment", "customer payment", "cheque"].includes(next.type) && ["party", "currency", "transactionLocationId"].some((key) => next[key] !== form[key])) {
      next = { ...next, billId: "", billIds: "[]", billReferences: "", billRemaining: "", invoiceId: "", invoiceIds: "[]", invoiceRemaining: "" };
      setLines(lines.map((line) => ({ ...line, unitPrice: "0", unitCost: "0" })));
    }
    const nextLocation = Number((next.type === "bill" ? next.billLocationId : next.transactionLocationId) || activeLocationId);
    if (linkedInventoryDocument && nextLocation !== documentLocationId) {
      setDocumentInventory({ key: "", items: [] });
      if (lines.some((line) => line.itemId)) {
        setLines(lines.map((line) => line.itemId ? { ...line, itemId: "", description: "", unitPrice: "0", unitCost: "0", homeUnitPrice: undefined, homeUnitCost: undefined } : line));
        toast.info("Inventory changed. Select items from the new inventory for your stock lines.");
      }
    }
    setForm(next);
  }


  const filteredRecords = useMemo(() => {
    let list = records[currentKind];
    if (currentKind === "contacts") {
      const type = view === "customers" ? "customer" : view === "vendors" ? "vendor" : "employee";
      list = list.filter((r) => r.type === type);
    }
    if (currentKind === "transactions" && view !== "dashboard") list = list.filter((r) => transactionTypes[view]?.includes(String(r.type)));
    const term = search.toLowerCase().trim();
    return term ? list.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(term))) : list;
  }, [currentKind, records, search, view]);

  function openTransaction(type: string) {
    setEditingItemId(null);
    setEditingRecordId(null);
    setEditorKind("transactions");
    if (type === "invoice") {
      setInvoiceInventoryOpen(true);
      return;
    }
    const prefix = type === "customer payment" ? "PAY" : type === "bill payment" ? "BPY" : type === "cheque" ? "CHQ" : type === "credit card charge" ? "CCC" : type === "cheque order" ? "CKO" : type === "transfer" ? "TRF" : type === "deposit" ? "DEP" : type === "statement charge" ? "STC" : type === "finance charge" ? "FIN" : type === "item receipt" ? "REC" : type === "received item bill" ? "RIB" : type === "proforma invoice" ? "PRO" : type === "sales order" ? "SO" : type === "quotation" ? "QUO" : type.slice(0, 3).toUpperCase();
    const taxFree = ["bill", "customer payment", "bill payment", "finance charge", "item receipt", "deposit", "transfer", "cheque order"].includes(type);
    const descriptions: Record<string, string> = { "customer payment": "Payment received", "bill payment": "Bill payment", cheque: "Cheque payment", "credit card charge": "Credit card charge", "cheque order": "Cheque books and envelopes", transfer: "Bank transfer", deposit: "Bank deposit", "statement charge": "Statement charge", "finance charge": "Finance charge", "credit memo": "Credit note / refund", "item receipt": "Items received", "received item bill": "Bill for received items" };
    setForm({ type, number: `${prefix}-${String(records.transactions.length + 1).padStart(4, "0")}`, transactionDate: today(), dueDate: today(), status: "open", account: defaultPostingAccount(type, records.accounts), vatRate: taxFree ? "0" : "5", currency: baseCurrency, exchangeRate: "1", billLocationId: String(activeLocationId), transactionLocationId: String(activeLocationId), salesman: "", isImport: "false", freightCharges: "0" });
    setLines([{ itemId: "", description: descriptions[type] ?? "", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: taxFree ? "ZERO" : "STANDARD", vatRate: taxFree ? "0" : "5" }]);
    setDialogOpen(true);
  }

  function openListEdit(record: DataRecord) {
    setEditingItemId(null); setEditingRecordId(record.id); setEditorKind(currentKind);
    setForm(Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value == null ? "" : String(value)])));
    setDialogOpen(true);
  }

  function openCreate() {
    setEditingRecordId(null);
    setEditingItemId(null);
    setEditorKind(currentKind);
    if (currentKind === "transactions") {
      const type = transactionTypes[view]?.[0] ?? "invoice";
      openTransaction(type);
      return;
    } else if (currentKind === "contacts") {
      const type = view === "customers" ? "customer" : view === "vendors" ? "vendor" : "employee";
      const controlAccount = type === "customer" ? controlAccountFor(records.accounts, "AR", baseCurrency) : type === "vendor" ? controlAccountFor(records.accounts, "AP", baseCurrency) : undefined;
      setForm(type === "customer" ? { type, currency: baseCurrency, ledgerAccountId: controlAccount ? String(controlAccount.id) : "", reseller: "Reseller", planet: "No", balance: "0" } : { type, currency: baseCurrency, ledgerAccountId: controlAccount ? String(controlAccount.id) : "", balance: "0" });
    }
    else if (currentKind === "items") {
      const initialFields = specificationFields.filter((label) => label !== "Product Category").slice(0, 8);
      const defaultCogs = records.accounts.find((account) => account.active && (account.systemRole === "COGS" || account.type === "Cost of Goods Sold" || /cost of goods/i.test(String(account.name || ""))));
      const defaultIncome = records.accounts.find((account) => account.active && (account.systemRole === "SALES" || account.type === "Income" || /^income$/i.test(String(account.name || ""))));
      const defaultAsset = records.accounts.find((account) => account.active && account.systemRole === "INVENTORY")
        ?? records.accounts.find((account) => account.active && /inventory asset/i.test(String(account.name || "")));
      const defaultVat = vatCodeOptions.find((code) => code.code === "STANDARD")?.code ?? vatCodeOptions[0]?.code ?? "ZERO";
      const itemForm: Record<string, string> = {
        itemType: "stock-part", category: "Laptop", quantity: "0", reorderPoint: "0", salesPrice: "0", cost: "0",
        purchaseVatCode: defaultVat, salesVatCode: defaultVat, cogsAccountId: defaultCogs ? String(defaultCogs.id) : "",
        incomeAccountId: defaultIncome ? String(defaultIncome.id) : "", assetAccountId: defaultAsset ? String(defaultAsset.id) : "",
        preferredSupplierId: "", status: "active", amountsIncludeVat: "false", specCount: String(initialFields.length),
      };
      initialFields.forEach((label, index) => { itemForm[`specLabel${index}`] = label; itemForm[`specValue${index}`] = ""; });
      setForm(itemForm);
    }
    else setForm({ type: "Expense", balance: "0", parentAccountId: "", currency: baseCurrency });
    setDialogOpen(true);
  }

  function startInvoice(location: InventoryLocation) {
    setEditingRecordId(null);
    setEditorKind("transactions");
    setActiveLocationId(location.id);
    setRecords((current) => ({ ...current, items: [] }));
    setForm({ type: "invoice", number: invoiceNumberPreview(activeCompanyId, location), transactionDate: today(), dueDate: today(), status: "open", account: linkedAccountName(records.accounts, "SALES", "Sales Revenue"), vatRate: "5", currency: baseCurrency, exchangeRate: "1", allowNegativeStock: "false", adminOverridePin: "" });
    setLines([{ itemId: "", description: "", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: "STANDARD", vatRate: "5" }]);
    setInvoiceInventoryOpen(false);
    setDialogOpen(true);
  }

  function openItemEdit(item: DataRecord) {
    const defaultCogs = records.accounts.find((account) => account.active && (account.systemRole === "COGS" || account.type === "Cost of Goods Sold" || /cost of goods/i.test(String(account.name || ""))));
    const defaultIncome = records.accounts.find((account) => account.active && (account.systemRole === "SALES" || account.type === "Income" || /^income$/i.test(String(account.name || ""))));
    const defaultAsset = records.accounts.find((account) => account.active && account.systemRole === "INVENTORY")
        ?? records.accounts.find((account) => account.active && /inventory asset/i.test(String(account.name || "")));
    let specifications: Array<{ label: string; value: string }> = [];
    try { specifications = JSON.parse(String(item.specifications ?? "[]")); } catch { specifications = []; }
    if (!specifications.length) specifications = specificationFields.filter((label) => label !== "Product Category").slice(0, 8).map((label) => ({ label, value: "" }));
    const itemForm: Record<string, string> = {
      itemType: itemTypeOf(item.itemType), category: String(item.category ?? "Laptop"),
      itemNumber: String(item.itemNumber ?? ""), sku: String(item.sku ?? ""), quantity: String(item.quantity ?? 0),
      reorderPoint: String(item.reorderPoint ?? 0), salesPrice: String(item.salesPrice ?? 0), cost: String(item.averageCost ?? item.cost ?? 0),
      lastPurchasePrice: String(item.lastPurchasePrice ?? item.cost ?? 0), onPo: String(item.onPo ?? 0),
      purchaseVatCode: String(item.purchaseVatCode ?? "STANDARD"), salesVatCode: String(item.salesVatCode ?? "STANDARD"),
      cogsAccountId: item.cogsAccountId ? String(item.cogsAccountId) : (defaultCogs ? String(defaultCogs.id) : ""), incomeAccountId: item.incomeAccountId ? String(item.incomeAccountId) : (defaultIncome ? String(defaultIncome.id) : ""),
      assetAccountId: item.assetAccountId ? String(item.assetAccountId) : (defaultAsset ? String(defaultAsset.id) : ""), preferredSupplierId: item.preferredSupplierId ? String(item.preferredSupplierId) : "",
      status: String(item.status ?? "active"), amountsIncludeVat: item.amountsIncludeVat === true || String(item.amountsIncludeVat) === "true" ? "true" : "false",
      specCount: String(Math.min(30, specifications.length)),
    };
    specifications.slice(0, 30).forEach((specification, index) => {
      itemForm[`specLabel${index}`] = specification.label;
      itemForm[`specValue${index}`] = specification.value;
    });
    setEditingItemId(item.id);
    setEditorKind("items");
    setForm(itemForm);
    setDialogOpen(true);
  }

  async function saveRecord(event: FormEvent) {
    event.preventDefault();
    if (!skuLock.ready) return;
    const saveKind = activeEditorKind;
    if (saveKind === "items" && !activeLocations.some(location => location.id === activeLocationId)) return toast.error("Select a company with an active inventory before saving the item.");
    if (!salesDetailsOnly && linkedInventoryDocument && !documentInventoryReady) return toast.error("Wait for the selected inventory to load before saving.");
    if (saveKind === "contacts" && form.type === "customer") {
      const required = [form.company, form.name, form.phone, form.whatsapp, form.country, form.reseller, form.planet, form.currency];
      if (required.some((value) => !value?.trim())) return toast.error("Complete all required customer fields.");
    }
    if (saveKind === "contacts" && form.type === "vendor" && editingRecordId === null) {
      const required = [form.company, form.name, form.phone, form.country, form.currency];
      if (required.some((value) => !value?.trim())) return toast.error("Complete all required vendor fields.");
    }
    if (saveKind === "transactions" && form.type === "bill") {
      const required = [form.party, form.number, form.transactionDate, form.currency, form.exchangeRate, form.billLocationId];
      if (required.some((value) => !value?.trim()) || Number(form.exchangeRate) <= 0) return toast.error("Complete the vendor, reference, date, inventory, currency and exchange rate.");
      if (lines.some(line => !Number.isFinite(Number(line.freightCharge || 0)) || Number(line.freightCharge || 0) < 0)) return toast.error("Freight charges must be valid non-negative amounts.");
      if (lines.some((line) => !line.description.trim() || Number(line.quantity) <= 0 || Number(line.unitPrice) < 0)) return toast.error("Complete every bill line with a description, positive quantity and valid rate.");
    }
    if (saveKind === "transactions" && form.type === "bill payment" && !records.accounts.some((bank) => bank.active && (bank.type === "Bank" || bank.systemRole === "BANK") && bank.name === form.account && bank.currency === form.currency)) return toast.error("Select an active Pay From bank matching the payment currency.");
    if (saveKind === "transactions" && form.type === "cheque" && !records.accounts.some((bank) => bank.active && (bank.type === "Bank" || bank.systemRole === "BANK") && String(bank.id) === form.bankAccountId && String(bank.currency) === form.currency)) return toast.error("Select an active bank in the cheque currency for Pay From.");
    if (!salesDetailsOnly && saveKind === "transactions" && form.type === "customer payment" && !records.accounts.some((account) => account.active && (account.type === "Bank" || account.systemRole === "BANK") && account.name === form.account && account.currency === form.currency)) return toast.error("Select an active bank matching the payment currency for Deposit To.");
    if (!salesDetailsOnly && saveKind === "transactions" && ["customer payment", "bill payment", "cheque"].includes(form.type)) {
      const chequePartyOptional = form.type === "cheque" && ["expense", "salary"].includes(form.chequeType);
      const required = [chequePartyOptional ? "General expense" : form.party, form.number, form.transactionDate, form.currency, form.exchangeRate, form.transactionLocationId];
      if (required.some((value) => !value?.trim()) || Number(form.exchangeRate) <= 0) return toast.error("Complete the party, reference, date, inventory, currency and exchange rate.");
      if (Number(lines[0]?.unitPrice ?? 0) <= 0) return toast.error("Enter an amount greater than zero.");
    }
    if (saveKind === "transactions" && ["deposit", "transfer", "credit card charge", "cheque order"].includes(form.type)) {
      const required = [form.party, form.number, form.transactionDate, form.currency, form.exchangeRate, form.transactionLocationId, form.account];
      if (required.some((value) => !value?.trim()) || Number(form.exchangeRate) <= 0) return toast.error("Complete all required banking details and the exchange rate.");
      if (form.type !== "cheque order" && Number(lines[0]?.unitPrice ?? 0) <= 0) return toast.error("Enter an amount greater than zero.");
      if (form.type === "transfer" && form.party === form.account) return toast.error("Choose different source and destination bank accounts.");
    }
    setSaving(true);
    try {
      const editingItem = saveKind === "items" && editingItemId !== null;
      const editing = editingItem || (["contacts", "accounts", "transactions"].includes(saveKind) && editingRecordId !== null);
      let submittedLines = lines;
      const zeroVatPayment = saveKind === "transactions" && (["customer payment", "bill payment"].includes(form.type) || (form.type === "cheque" && (form.account || linkedAccountName(records.accounts, "AP", "Accounts Payable", form.currency)) === linkedAccountName(records.accounts, "AP", "Accounts Payable", form.currency)));
      if (zeroVatPayment) {
        submittedLines = submittedLines.map((line) => ({ ...line, vatCode: "ZERO", vatRate: "0" }));
      }
      const selectedLocationId = saveKind === "transactions" && form.type === "bill" ? Number(form.billLocationId || activeLocationId) : saveKind === "transactions" ? Number(form.transactionLocationId || activeLocationId) : activeLocationId;
      const response = await fetch("/api/records", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json", ...skuLock.headers }, body: JSON.stringify(salesDetailsOnly ? { kind: "transactions", id: editingRecordId, companyId: activeCompanyId, editMode: "details", revision: form.revision, number: form.number, transactionDate: form.transactionDate, dueDate: form.dueDate, salesman: form.salesman, memo: form.memo, ...(form.type === "invoice" ? { comments: form.comments, serialNumber: form.serialNumber, lineDetails: lines.map(line => ({ id: line.id, comments: line.comments || "", serialNumber: line.serialNumber || "" })) } : {}) } : { kind: saveKind, companyId: activeCompanyId, locationId: selectedLocationId, ...(editing ? { id: editingItem ? editingItemId : editingRecordId } : {}), ...form, ...(zeroVatPayment ? { vatRate: "0" } : {}), ...(saveKind === "transactions" ? { lines: submittedLines } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save record");
      setRecords((old) => ({ ...old, [saveKind]: editing ? old[saveKind].map((record) => record.id === data.record.id ? data.record : record) : [data.record, ...old[saveKind]] }));
      setDialogOpen(false); setEditorKind(null); setEditingItemId(null); setEditingRecordId(null); toast.success(data.generatedAccount ? `${data.generatedAccount.name} created and linked automatically` : editing ? "Changes saved" : "Record saved and posted");
      if (saveKind === "transactions" && selectedLocationId !== activeLocationId) setActiveLocationId(selectedLocationId);
      else await loadData();
      if (saveKind === "transactions" && form.type === "invoice") await loadWorkspaces();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save record"); }
    finally { setSaving(false); }
  }

  async function removeRecord(id: number) {
    try {
      const response = await fetch("/api/records", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: currentKind, id, companyId: activeCompanyId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Delete failed");
      setRecords((old) => ({ ...old, [currentKind]: old[currentKind].filter((r) => r.id !== id) }));
      if (currentKind === "transactions" && view === "purchases") await loadData();
      toast.success("Record deleted");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete record"); }
  }

  async function duplicateItem(id: number) {
    try {
      const response = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "items", companyId: activeCompanyId, locationId: activeLocationId, duplicateItemId: id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not duplicate item");
      await loadData();
      openItemEdit(data.record as DataRecord);
      toast.success(`Duplicate ${data.record.sku} is ready to edit and save`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not duplicate item"); }
  }

  async function openDetail(id: number) {
    try {
      const response = await fetch(`/api/records?kind=transactions&id=${id}&companyId=${activeCompanyId}&locationId=${activeLocationId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not open document");
      setDetail(data);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not open document"); }
  }

  async function openPurchaseEdit(record: DataRecord) {
    if (currentUser.role !== "admin") return;
    try {
      const response = await fetch(`/api/records?kind=transactions&id=${record.id}&companyId=${activeCompanyId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load purchase");
      const purchase = data.record as DataRecord;
      if (!["invoice", "customer payment"].includes(String(purchase.type)) && (purchase.convertedInvoiceId || !["open", "draft", "pending", "overdue"].includes(String(purchase.status)))) throw new Error("Only open, overdue, draft or pending purchases can be edited. Converted or settled documents are locked.");
      const locationId = Number(purchase.locationId);
      if (!activeLocations.some((location) => location.id === locationId)) throw new Error("The purchase inventory is not available.");
      setEditingRecordId(purchase.id);
      setEditingItemId(null);
      setEditorKind("transactions");
      setActiveLocationId(locationId);
      setForm({ ...Object.fromEntries(Object.entries(purchase).map(([key, value]) => [key, String(value ?? "")])), revision: data.revision, billLocationId: String(locationId), transactionLocationId: String(locationId), freightCharges: "0" });
      setLines(data.lines.filter((line: DataRecord) => !line.isFreightCharge).map((line: DataRecord) => ({ id: line.id, comments: String(line.comments ?? ""), serialNumber: String(line.serialNumber ?? ""), freightCharge: String(line.freightCharge || 0), itemId: line.itemId ? String(line.itemId) : "", description: String(line.description ?? ""), quantity: String(line.quantity), unitPrice: String(line.unitPrice), unitCost: String(Math.round((Number(line.unitPrice || 0) + Number(line.freightCharge || 0) / Math.max(Number(line.quantity || 0), Number.EPSILON)) * 100) / 100), vatCode: String(line.vatCode), vatRate: String(line.vatRate) })));
      setDetail(null);
      setDialogOpen(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load purchase"); }
  }

  function convertSourceDocument(source: TransactionDetail) {
    const record = source.record;
    const purchaseOrder = record.type === "purchase order";
    if ((!purchaseOrder && !["quotation", "estimate", "proforma invoice", "sales order"].includes(String(record.type))) || record.convertedInvoiceId || record.status === "converted") return toast.error("This document cannot be converted again.");
    const locationId = Number(record.locationId);
    const location = activeLocations.find((candidate) => candidate.id === locationId);
    if (!location) return toast.error("The source inventory is not available.");
    setEditingRecordId(null);
    setEditorKind("transactions");
    setActiveLocationId(locationId);
    setForm(purchaseOrder ? {
      type: "bill", purchaseOrderId: String(record.id), sourceDocumentLabel: `${String(record.type)} ${String(record.number)}`,
      number: `BILL-${String(records.transactions.length + 1).padStart(4, "0")}`, party: String(record.party), salesman: String(record.salesman ?? ""),
      transactionDate: today(), dueDate: String(record.dueDate || today()), status: "open", account: defaultPostingAccount("bill", records.accounts),
      vatRate: String(record.vatRate ?? "5"), currency: String(record.currency || baseCurrency), exchangeRate: String(record.exchangeRate || "1"),
      billLocationId: String(locationId), transactionLocationId: String(locationId), isImport: Number(record.vatAmount) > 0 || record.isImport ? "true" : "false", freightCharges: "0", memo: String(record.memo ?? ""),
    } : {
      type: "invoice", sourceTransactionId: String(record.id), sourceDocumentLabel: `${String(record.type)} ${String(record.number)}`,
      number: invoiceNumberPreview(activeCompanyId, location), party: String(record.party), salesman: String(record.salesman ?? ""),
      transactionDate: today(), dueDate: String(record.dueDate || today()), status: "open", account: String(record.account),
      vatRate: String(record.vatRate ?? "5"), currency: String(record.currency || baseCurrency), exchangeRate: String(record.exchangeRate || "1"),
      transactionLocationId: String(locationId), allowNegativeStock: "false", adminOverridePin: "", memo: String(record.memo ?? ""),
    });
    setLines(source.lines.map((line) => ({ itemId: line.itemId ? String(line.itemId) : "", description: String(line.description ?? ""), quantity: String(line.quantity ?? "1"), unitPrice: String(line.unitPrice ?? "0"), unitCost: String(line.unitCost ?? "0"), vatCode: String(line.vatCode ?? "STANDARD"), vatRate: String(line.vatRate ?? "5") })));
    setDetail(null);
    setDialogOpen(true);
  }

  async function openReport(key: string, period?: { start: string; end: string }, saved?: { locationId: number | null; currency: string; customer?: string; statementDate?: string; memo?: string }) {
    setReportLoading(true);
    try {
      const periodQuery = (period ? `&periodStart=${period.start}&periodEnd=${period.end}` : "") + `&customer=${encodeURIComponent(saved?.customer || "")}&statementDate=${encodeURIComponent(saved?.statementDate || "")}&memo=${encodeURIComponent(saved?.memo || "")}`;
      const reportLocationId = saved?.locationId ?? activeLocationId;
      const reportCurrency = saved?.currency || baseCurrency;
      const response = await fetch(`/api/reports?type=${key}&companyId=${activeCompanyId}&locationId=${reportLocationId}&currency=${reportCurrency}${periodQuery}`, { signal: AbortSignal.timeout(30000), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate report");
      setReport(data.report);
      setReportContext({ key, locationId: reportLocationId, currency: reportCurrency, periodStart: period?.start ?? "", periodEnd: period?.end ?? "" });
    } catch (error) { toast.error(error instanceof Error && error.name === "TimeoutError" ? "The report took too long to load. Please try again." : error instanceof Error ? error.message : "Could not generate report"); }
    finally { setReportLoading(false); }
  }

  async function saveMemorisedReport() {
    if (!report || !reportContext) return;
    const definition = allReports.find((candidate) => candidate[3] === reportContext.key);
    if (!definition) return toast.error("This report cannot be memorised.");
    setMemoriseSaving(true);
    try {
      const response = await fetch("/api/memorised-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: activeCompanyId, locationId: reportContext.locationId, name: definition[0], reportKey: reportContext.key, category: definition[2], currency: reportContext.currency, periodStart: reportContext.periodStart, periodEnd: report?.statement?.to || reportContext.periodEnd, customer: report.openBalance?.customer || report.statement?.customer || "", memo: report.statement?.memo || "", statementDate: report.openBalance?.asOf || report.statement?.statementDate || "" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not memorise report");
      await loadMemorisedReports();
      toast.success(`${definition[0]} saved to Memorised Report List`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not memorise report"); }
    finally { setMemoriseSaving(false); }
  }

  async function removeMemorisedReport(record: MemorisedReportRecord) {
    try {
      const response = await fetch("/api/memorised-reports", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: record.id, companyId: activeCompanyId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove memorised report");
      setMemorisedReports((current) => current.filter((savedReport) => savedReport.id !== record.id));
      toast.success("Memorised report removed");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not remove memorised report"); }
  }

  function openMemorisedReport(record: MemorisedReportRecord) {
    const period = record.periodStart || record.periodEnd ? { start: record.periodStart, end: record.periodEnd } : undefined;
    void openReport(record.reportKey, period, { locationId: record.locationId, currency: record.currency, customer: record.customer, statementDate: record.statementDate, memo: record.memo });
  }

  const heading = viewTitles[view];
  const createLabel = currentKind === "contacts" ? `New ${view === "employees" ? "Employee" : view === "vendors" ? "Vendor" : "Customer"}` : currentKind === "items" ? "New Item" : currentKind === "accounts" ? "New Account" : view === "purchases" ? "Enter Bill" : view === "receive-payment" ? "Receive Payment" : view === "write-cheque" ? "Write Cheque" : `New ${transactionTypes[view]?.[0] ?? "Transaction"}`;
  const editorLabel = activeEditorKind === "transactions" && editorKind === "transactions" ? form.type?.split(" ").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ") : createLabel;

  return (
    <SidebarProvider data-user-theme={themeColor} data-appearance={appearanceMode}>
      <Sidebar collapsible="icon" className="brand-sidebar border-r border-slate-800 bg-[#0d1726] text-slate-100">
        <SidebarHeader className="border-b border-white/10 p-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="brand-logo grid size-9 shrink-0 place-items-center rounded-xl text-sm font-black">CN</div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-bold tracking-wide text-white">COMNET ENTERPRISE</p>
              <p className="truncate text-xs text-slate-400">Accounting Suite</p>
            </div>
          </div>
          <div className="mt-3 group-data-[collapsible=icon]:hidden"><Select value={String(activeCompanyId || "")} onValueChange={(value) => { const company = companies.find((entry) => entry.id === Number(value)); setActiveCompanyId(Number(value)); setActiveLocationId(company?.locations[0]?.id ?? 0); setSearch(""); }}><SelectTrigger className="w-full border-white/10 bg-white/5 text-white"><SelectValue placeholder="Select company" /></SelectTrigger><SelectContent>{companies.map((company) => <SelectItem key={company.id} value={String(company.id)}>{company.name}</SelectItem>)}</SelectContent></Select></div>
        </SidebarHeader>
        <SidebarContent className="px-2 py-3">
          {visibleNavGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-[11px] tracking-[.16em] text-slate-500">{group.label}</SidebarGroupLabel>
              <SidebarGroupContent><SidebarMenu>
                {group.items.map((item) => <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton tooltip={item.label} isActive={view === item.id} onClick={() => { setView(item.id as View); setSearch(""); }} className="brand-nav-item h-10 text-slate-300 hover:bg-white/8 hover:text-white">
                    <item.icon /><span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>)}
              </SidebarMenu></SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="border-t border-white/10 p-3">
          {currentUser.role === "admin" && <SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip="Companies & inventory" onClick={() => setWorkspaceOpen(true)} className="text-slate-400"><Settings /><span>Companies & inventory</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>}
          <div className="mt-1 flex items-center gap-3 rounded-lg bg-white/5 p-2 group-data-[collapsible=icon]:hidden">
            {currentUser.avatarData ? <Image src={currentUser.avatarData} alt={`${currentUser.fullName || currentUser.email} profile`} width={32} height={32} unoptimized className="size-8 rounded-full border border-white/15 object-cover" /> : <div className="grid size-8 place-items-center rounded-full bg-slate-700 text-xs font-bold">{(currentUser.fullName || currentUser.email).slice(0, 2).toUpperCase()}</div>}
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{currentUser.fullName || roleLabels[currentUser.role]}</p><p className="truncate text-[11px] text-slate-500">{roleLabels[currentUser.role]} · {currentUser.email}</p></div>
            <Button type="button" variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={signOut} className="size-8 shrink-0 text-slate-400 hover:bg-white/10 hover:text-white"><LogOut className="size-4" /></Button>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="brand-workspace min-w-0">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-7">
          <div className="flex min-w-0 items-center gap-3"><SidebarTrigger className="text-slate-600" /><div className="hidden h-5 w-px bg-slate-200 sm:block" /><div className="min-w-0"><h1 className="truncate text-lg font-bold text-slate-900">{heading.title}</h1><p className="hidden truncate text-xs text-slate-500 sm:block">{heading.sub}</p></div></div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Appearance" title="Appearance"><Palette className="size-4" /></Button>
              </PopoverTrigger>
      …41971 tokens truncated…haseAccounts.map((account) => <SelectItem key={account.id} value={String(account.name)}>{String(account.code || "")} · {String(account.name)} · {String(account.type)}</SelectItem>) : <SelectItem value="no-purchase-accounts" disabled>No purchase / expense accounts available</SelectItem>}</SelectContent></Select><p className="text-xs text-slate-500">Used for non-stock purchases and fallback posting. Stock items use their linked Inventory Asset account.</p></div>
    </div>
    <div className="bill-item-table overflow-hidden rounded-lg border bg-white">
      <div className="flex items-center justify-between border-b p-3 bill-mobile-heading"><strong>Bill items</strong><Button type="button" className="bg-green-600 text-white hover:bg-green-700" size="icon" aria-label="Add bill item" onClick={addLine}><Plus className="size-4" /></Button></div>
      <div className="bill-item-heading bg-slate-50 text-sm font-bold"><div>#</div><div>Desc</div><div>QTY (pcs)</div><div>Rate</div><div>Subtotal</div><div>VAT</div><div><Button type="button" className="bg-green-600 text-white hover:bg-green-700" size="icon" aria-label="Add bill item" onClick={addLine}><Plus className="size-4" /></Button></div></div>
      {lines.map((line, index) => {
        const lineSubtotal = Math.round(Number(line.quantity || 0) * Number(line.unitPrice || 0) * 100) / 100;
        const selectedItem = purchaseItems.find((entry) => String(entry.id) === line.itemId);
        return <div key={index} className="bill-item-row">
          <div className="bill-item-number text-sm text-slate-500">{index + 1}</div>
          <div className="bill-item-product space-y-2 min-w-0"><Select value={line.itemId || "custom"} onValueChange={(value) => { const item = purchaseItems.find((entry) => String(entry.id) === value); const purchaseVatCode = form.isImport === "true" ? String(item?.purchaseVatCode || "STANDARD") : "ZERO"; const purchaseVatRate = Number(vatRateForCode(purchaseVatCode, vatCodeOptions)); const storedHomePrice = Number(item?.lastPurchasePrice ?? item?.cost ?? 0); const lastHomePrice = item?.amountsIncludeVat === true && purchaseVatRate > 0 ? storedHomePrice / (1 + purchaseVatRate / 100) : storedHomePrice; const documentPrice = Number((lastHomePrice / documentRate).toFixed(2)); update(index, value === "custom" ? { itemId: "", description: "" } : { itemId: value, description: item ? itemDisplayDescription(item) || String(item.name) : "", unitPrice: String(documentPrice), unitCost: String(documentPrice), freightCharge: "0", vatCode: purchaseVatCode, vatRate: String(purchaseVatRate) }); }}><SelectTrigger className="w-full"><SelectValue placeholder="Select Product" /></SelectTrigger><SelectContent><SelectItem value="custom">Custom description</SelectItem>{purchaseItems.map((item) => <SelectItem key={item.id} value={String(item.id)}>{String(item.sku)} · {String(item.name)} · {itemTypeDetails[itemTypeOf(item.itemType)].label} · Last {baseCurrency} {Number(item.lastPurchasePrice ?? item.cost ?? 0).toFixed(2)}</SelectItem>)}</SelectContent></Select>{selectedItem && <p className="text-xs font-medium text-sky-700">Last purchase price at bill entry: {formatMoney(selectedItem.lastPurchasePrice ?? selectedItem.cost, baseCurrency)}</p>}{!line.itemId && <Input placeholder="Enter description" required value={line.description} onChange={(event) => update(index, { description: event.target.value })} />}<DocumentExtraFields value={{ comments: line.comments || "", serialNumber: line.serialNumber || "" }} onChange={value => update(index, value)} /></div>
          <div><Label className="bill-mobile-label">QTY (pcs)</Label><Input aria-label={`Quantity for line ${index + 1}`} type="number" min="0.01" step="0.01" value={line.quantity} onChange={event => update(index, { quantity: event.target.value })} /></div>
          <div><Label className="bill-mobile-label">Rate</Label><Input aria-label={`Rate for line ${index + 1}`} type="number" min="0" step="0.01" value={line.unitPrice} onChange={event => update(index, { unitPrice: event.target.value, unitCost: event.target.value })} /></div>
          <div><Label className="bill-mobile-label">Subtotal</Label><Input aria-label={`Subtotal for line ${index + 1}`} readOnly value={lineSubtotal.toFixed(2)} className="bg-slate-100" /></div>
          <div className="space-y-2"><Label className="bill-mobile-label">VAT</Label><Input aria-label={`VAT amount for line ${index + 1}`} readOnly value={(Math.round((lineSubtotal + lineFreight(line)) * Number(line.vatRate || 0)) / 100).toFixed(2)} className="bg-slate-100" /><Select value={line.vatCode} onValueChange={(vatCode) => update(index, { vatCode, vatRate: vatRateForCode(vatCode, vatCodeOptions) })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{vatCodeOptions.map((option) => <SelectItem key={option.code} value={option.code}><span className="flex flex-col"><span>{option.label}</span>{option.description ? <span className="text-xs text-slate-500">{option.description}</span> : null}</span></SelectItem>)}</SelectContent></Select></div>
          <div className="bill-item-delete"><Button type="button" size="icon" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, position) => position !== index))} className="bg-red-600 text-white hover:bg-red-700" aria-label={`Delete bill item ${index + 1}`}><Trash2 className="size-4" /></Button></div>
        </div>;
      })}
    </div>
    <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
      <div />
      <div className="space-y-4 rounded-xl border bg-slate-50 p-4">
        <div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Total quantity</span><strong>{totalQuantity.toLocaleString()}</strong></div><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><strong>{formatMoney(subtotal + freightCharges, form.currency)}</strong></div><div className="flex justify-between"><span className="text-slate-500">VAT</span><strong>{formatMoney(totalVat, form.currency)}</strong></div><div className="flex justify-between border-t pt-3 text-lg"><span className="font-bold">Total</span><strong>{formatMoney(total, form.currency)}</strong></div></div>
      </div>
    </div>
  </div>;
}
function CashTransactionFields({ form, setForm, contacts, accounts, locations, lines, setLines, vatCodeOptions, exchangeRates, baseCurrency }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void; contacts: DataRecord[]; accounts: DataRecord[]; locations: InventoryLocation[]; lines: LineForm[]; setLines: (lines: LineForm[]) => void; vatCodeOptions: VatCodeOption[]; exchangeRates: ExchangeRateRecord[]; baseCurrency: string }) {
  const receivePayment = form.type === "customer payment";
  const payBill = form.type === "bill payment";
  const line = lines[0] ?? { itemId: "", description: receivePayment ? "Payment received" : "Cheque payment", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: "ZERO", vatRate: "0" };
  const updateLine = (changes: Partial<LineForm>) => setLines([{ ...line, ...changes }]);
  const amount = Number(line.unitPrice || 0);

  const bankAccounts = accounts.filter((account) => account.active && (account.type === "Bank" || account.systemRole === "BANK"));
  const apName = linkedAccountName(accounts, "AP", "Accounts Payable", form.currency);
  const chequeAccounts = accounts.filter((account) => account.active && (
    ["EXPENSE", "PURCHASES", "COGS", "PAYROLL"].includes(String(account.systemRole))
    || ["Expense", "Other Expense", "Cost of Goods Sold"].includes(String(account.type))
    || (account.systemRole === "AP" && String(account.currency) === form.currency)
  ));
  const isAccountsPayable = (form.account || apName) === apName;
  const inferredChequeType = contacts.some((contact) => contact.type === "employee" && contact.name === form.party) ? "salary" : isAccountsPayable ? "supplier" : "expense";
  const chequeType = form.chequeType || inferredChequeType;
  const chequePartyOptional = form.type === "cheque" && chequeType !== "supplier";
  const parties = contacts.filter((contact) => contact.type === (receivePayment ? "customer" : chequeType === "salary" ? "employee" : "vendor") && contact.status !== "inactive");
  const expenseAccounts = chequeAccounts.filter((account) => account.systemRole !== "AP");
  const salaryAccount = expenseAccounts.find((account) => account.systemRole === "PAYROLL") ?? expenseAccounts.find((account) => /salary|payroll/i.test(String(account.name))) ?? expenseAccounts[0];
  const directExpenseAccount = expenseAccounts.find((account) => account.systemRole !== "PAYROLL") ?? expenseAccounts[0];
  const zeroVatOnly = receivePayment || payBill;
  const effectiveVatCode = zeroVatOnly ? "ZERO" : line.vatCode;
  const vat = zeroVatOnly ? 0 : amount * Number(vatRateForCode(effectiveVatCode, vatCodeOptions)) / 100;
  const bankLabel = (bank: DataRecord) => {
    const parent = accounts.find((account) => account.id === Number(bank.parentAccountId));
    return `${parent ? `${String(parent.name)} / ` : ""}${String(bank.name)} · ${String(bank.currency)}`;
  };
  const selectedSupplier = !receivePayment ? parties.find((party) => party.name === form.party) : undefined;
  const selectedBank = bankAccounts.find((bank) => String(bank.id) === form.bankAccountId && String(bank.currency) === form.currency);
  const selectParty = (value: string) => {
    const party = parties.find((entry) => String(entry.name) === value);
    const currency = String(party?.currency || form.currency);
    const savedRate = exchangeRates.find((entry) => entry.currencyCode === currency)?.rate;
    const account = receivePayment || payBill
      ? bankAccounts.some((bank) => bank.name === form.account && bank.currency === currency) ? form.account : ""
      : chequeType === "supplier" ? linkedAccountName(accounts, "AP", "Accounts Payable", currency) : form.account;
    setForm({ ...form, party: value, currency, exchangeRate: currency === baseCurrency ? "1" : savedRate ? String(savedRate) : "", account });
  };
  const selectChequeType = (value: string) => {
    const supplier = value === "supplier";
    const salary = value === "salary";
    const account = supplier ? apName : String((salary ? salaryAccount : directExpenseAccount)?.name ?? "");
    const vatCode = salary || supplier ? "ZERO" : vatCodeOptions.find((option) => option.code === "STANDARD")?.code ?? vatCodeOptions[0]?.code ?? "ZERO";
    const vatRate = vatRateForCode(vatCode, vatCodeOptions);
    setForm({ ...form, chequeType: value, party: "", account, billId: "", billIds: "[]", billReferences: "", billRemaining: "", vatRate });
    updateLine({ description: salary ? "Salary payment" : supplier ? "Cheque payment" : "Expense payment", vatCode, vatRate });
  };
  return <div className="space-y-4">
    <section className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Payment setup">
      {form.type === "cheque" ? <div className="space-y-2"><Label>Cheque type *</Label><Select value={chequeType} onValueChange={selectChequeType}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="supplier">Supplier payment</SelectItem><SelectItem value="expense">Direct expense</SelectItem><SelectItem value="salary">Salary</SelectItem></SelectContent></Select></div> : <div className="space-y-2"><Label>{receivePayment ? "Customer" : "Vendor / Payee"} *</Label><Select value={form.party || undefined} onValueChange={selectParty}><SelectTrigger className="w-full"><SelectValue placeholder={receivePayment ? "Select customer" : "Select vendor"} /></SelectTrigger><SelectContent>{parties.length ? parties.map((party) => <SelectItem key={party.id} value={String(party.name)}>{String(party.company || party.name)} · {String(party.currency)}</SelectItem>) : <SelectItem value="no-parties" disabled>No {receivePayment ? "customers" : "vendors"} available</SelectItem>}</SelectContent></Select></div>}
      <Field label={receivePayment ? "Payment Reference" : payBill ? "Bill Payment Reference" : "Cheque Number"} name="number" form={form} setForm={setForm} required placeholder={receivePayment ? "Enter payment reference" : payBill ? "Enter bill payment reference" : "Enter cheque number"} />
      <Field label={payBill ? "Payment Date" : receivePayment ? "Payment Date" : "Cheque Date"} name="transactionDate" type="date" form={form} setForm={setForm} required />
      {payBill && <PaymentSalesRep companyId={locations[0]?.companyId ?? 0} currency={baseCurrency} employees={contacts.filter((contact) => contact.type === "employee" && contact.status !== "inactive").map((contact) => ({ id: contact.id, name: String(contact.name) }))} value={form.salesman || ""} onChange={(salesman) => setForm({ ...form, salesman })} />}
      <div className="space-y-2"><Label>Inventory *</Label><Select disabled={Boolean(form.revision)} value={form.transactionLocationId || String(locations[0]?.id ?? "")} onValueChange={(value) => setForm({ ...form, transactionLocationId: value })}><SelectTrigger className="w-full"><SelectValue placeholder="Select inventory" /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}</SelectContent></Select></div>
      <CurrencyExchangeChoice form={form} setForm={setForm} exchangeRates={exchangeRates} baseCurrency={baseCurrency} />
      <Field label={`Exchange rate to ${baseCurrency}`} name="exchangeRate" type="number" form={form} setForm={setForm} required />
      {form.type === "cheque" && <div className="space-y-2"><Label htmlFor="cheque-bank">Pay From *</Label><Select value={bankAccounts.some((bank) => String(bank.id) === form.bankAccountId && String(bank.currency) === form.currency) ? form.bankAccountId : ""} onValueChange={(bankAccountId) => {
        const bank = bankAccounts.find((entry) => String(entry.id) === bankAccountId);
        if (!bank) return;
        const currency = String(bank.currency);
        const rate = currency === baseCurrency ? "1" : String(exchangeRates.find((entry) => entry.currencyCode === currency)?.rate ?? "");
        setForm({ ...form, bankAccountId, currency, exchangeRate: rate, ...(isAccountsPayable ? { account: linkedAccountName(accounts, "AP", "Accounts Payable", currency) } : {}) });
      }}><SelectTrigger id="cheque-bank" className="w-full"><SelectValue placeholder="Select bank account" /></SelectTrigger><SelectContent>{bankAccounts.length ? bankAccounts.map((bank) => <SelectItem key={bank.id} value={String(bank.id)}>{bankLabel(bank)} · Balance {formatMoney(Number(bank.balance || 0), baseCurrency)}</SelectItem>) : <SelectItem value="no-banks" disabled>No active bank accounts</SelectItem>}</SelectContent></Select><p className="text-sm font-medium">{selectedBank ? `${bankLabel(selectedBank)} — Balance ${formatMoney(Number(selectedBank.balance || 0), baseCurrency)} (${baseCurrency} ledger balance)` : "Select a bank to see its balance."}</p><p className="text-xs text-slate-500">The cheque uses the selected bank’s currency. Amounts post to the ledger in {baseCurrency}.</p></div>}
      {receivePayment ? <div className="space-y-2"><Label htmlFor="payment-deposit-bank">Deposit To *</Label><Select value={bankAccounts.some((account) => account.name === form.account && account.currency === form.currency) ? form.account : ""} onValueChange={(account) => setForm({ ...form, account })}><SelectTrigger id="payment-deposit-bank" className="w-full"><SelectValue placeholder="Select bank account" /></SelectTrigger><SelectContent>{bankAccounts.some((bank) => bank.currency === form.currency) ? bankAccounts.filter((bank) => bank.currency === form.currency).map((account) => <SelectItem key={account.id} value={String(account.name)}>{bankLabel(account)} · Balance {formatMoney(Number(account.balance || 0), baseCurrency)}</SelectItem>) : <SelectItem value="no-bank-accounts" disabled>No active bank in {form.currency}</SelectItem>}</SelectContent></Select>{!bankAccounts.some((bank) => bank.currency === form.currency) && <p className="text-xs text-slate-500">Add a bank in this currency in Chart of Accounts first.</p>}</div> : payBill ? <div className="space-y-2"><Label htmlFor="bill-payment-bank">Pay From *</Label><Select value={bankAccounts.some((bank) => bank.name === form.account && bank.currency === form.currency) ? form.account : ""} onValueChange={(account) => setForm({ ...form, account })}><SelectTrigger id="bill-payment-bank" className="w-full"><SelectValue placeholder="Select bank account" /></SelectTrigger><SelectContent>{bankAccounts.filter((bank) => bank.currency === form.currency).map((bank) => <SelectItem key={bank.id} value={String(bank.name)}>{bankLabel(bank)} · Balance {formatMoney(Number(bank.balance || 0), baseCurrency)}</SelectItem>)}{!bankAccounts.some((bank) => bank.currency === form.currency) && <SelectItem value="no-banks" disabled>No active bank in {form.currency}</SelectItem>}</SelectContent></Select><p className="text-xs text-slate-500">Balances shown in {baseCurrency}. Add banks in Chart of Accounts.</p></div> : <div className="space-y-2"><Label>Posting account</Label><Select value={form.account || apName} onValueChange={(value) => { const isPayable = value === apName; setForm({ ...form, account: value, ...(!isPayable ? { billId: "", billIds: "[]", billReferences: "", billRemaining: "" } : {}), ...(isPayable ? { vatRate: "0" } : {}) }); if (isPayable) updateLine({ vatCode: "ZERO", vatRate: "0" }); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{chequeAccounts.map((account) => <SelectItem key={account.id} value={String(account.name)}>{String(account.code)} · {String(account.name)}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">Select Accounts Payable for bill settlement, or any active expense account for direct cheque expenses.</p></div>}
    </section>
    {form.type === "cheque" && chequeType === "supplier" && selectedSupplier && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-4 py-3"><p className="text-sm text-muted-foreground">Supplier balance · All inventories · {String(selectedSupplier.currency)}</p><strong className="text-base">{formatMoney(Number(selectedSupplier.balance || 0), String(selectedSupplier.currency))}</strong></div>}
    {(payBill || (form.type === "cheque" && isAccountsPayable)) && <UnpaidBills key={`${locations[0]?.companyId}:${form.transactionLocationId}:${form.party}:${form.currency}`} companyId={locations[0]?.companyId ?? 0} locationId={Number(form.transactionLocationId || locations[0]?.id || 0)} party={form.party || ""} currency={form.currency || baseCurrency} paymentId={form.revision ? form.id : undefined} selectedBillId={form.billId || ""} selectedBillIds={form.type === "cheque" ? JSON.parse(form.billIds || (form.billId ? `[${form.billId}]` : "[]")) : undefined} onSelectMany={form.type === "cheque" ? (bills) => { const amount = String(Math.round(bills.reduce((sum,bill) => sum + bill.remaining,0)*100)/100); const references = bills.map((bill) => bill.number).join(", "); setForm({...form, billId: "", billIds: JSON.stringify(bills.map((bill) => bill.id)), billReferences: references, billRemaining: amount}); updateLine({unitPrice:amount,unitCost:amount,description:references ? `Payment for bills ${references}` : "Cheque payment",quantity:"1",vatCode:"ZERO",vatRate:"0"}); } : undefined} onSelect={(bill) => { setForm({ ...form, billId: bill ? String(bill.id) : "", billRemaining: bill ? String(bill.remaining) : "" }); updateLine({ unitPrice: bill ? String(bill.remaining) : "0", unitCost: bill ? String(bill.remaining) : "0", description: bill ? `Payment for bill ${bill.number}` : "Bill payment", quantity: "1", vatCode: "ZERO", vatRate: "0" }); }} />}
    {receivePayment && <UnpaidInvoices key={`${locations[0]?.companyId}:${form.transactionLocationId}:${form.party}:${form.currency}`} companyId={locations[0]?.companyId ?? 0} locationId={Number(form.transactionLocationId || locations[0]?.id || 0)} party={form.party || ""} currency={form.currency || baseCurrency} paymentId={form.revision ? form.id : undefined} selectedInvoiceIds={JSON.parse(form.invoiceIds || "[]")} onSelect={(invoices) => { const amount = String(Math.round(invoices.reduce((sum, invoice) => sum + invoice.remaining, 0) * 100) / 100); setForm({ ...form, invoiceId: "", invoiceIds: JSON.stringify(invoices.map((invoice) => invoice.id)), invoiceRemaining: amount }); updateLine({ unitPrice: amount, unitCost: amount, description: invoices.length ? `Payment for invoices ${invoices.map((invoice) => invoice.number).join(", ")}` : "Invoice payment", quantity: "1", vatCode: "ZERO", vatRate: "0" }); }} />}
    <section className="space-y-3 border-t pt-4" aria-labelledby="payment-details-heading">
      <h3 id="payment-details-heading" className="text-sm font-semibold">Payment details</h3>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {form.type === "cheque" && <><div className="space-y-2"><Label>{chequeType === "salary" ? "Employee name" : "Payee name"}{chequePartyOptional ? " (optional)" : " *"}</Label><Select value={form.party || undefined} onValueChange={selectParty}><SelectTrigger className="w-full"><SelectValue placeholder={chequeType === "salary" ? "Select employee or leave blank" : chequePartyOptional ? "Select payee or leave blank" : "Select vendor / payee"} /></SelectTrigger><SelectContent>{chequePartyOptional && <SelectItem value="General expense">{chequeType === "salary" ? "No employee · General expense" : "No payee · General expense"}</SelectItem>}{parties.map((party) => <SelectItem key={party.id} value={String(party.name)}>{String(party.company || party.name)}{party.currency ? ` · ${String(party.currency)}` : ""}</SelectItem>)}{!parties.length && !chequePartyOptional && <SelectItem value="no-payees" disabled>No vendors available</SelectItem>}</SelectContent></Select>{chequePartyOptional && <p className="text-xs text-slate-500">Optional. Leave blank or choose General expense to save without a name.</p>}</div><div className="space-y-2 md:col-span-1 xl:col-span-3"><Label>Details *</Label><Input value={line.description} onChange={(event) => updateLine({ description: event.target.value })} placeholder={chequeType === "salary" ? "Example: September 2026 salary" : chequeType === "expense" ? "Describe the expense" : "Cheque payment details"} required /></div></>}
      <div className="space-y-2"><Label>Amount *</Label><Input type="number" min="0.01" step="0.01" value={line.unitPrice} onChange={(event) => updateLine({ unitPrice: event.target.value, unitCost: event.target.value })} required /></div>
      <div className="space-y-2"><Label htmlFor="cash-vat-code">VAT code</Label><Select value={effectiveVatCode} onValueChange={(vatCode) => { const vatRate = vatRateForCode(vatCode, vatCodeOptions); const taxableSupplierCheque = form.type === "cheque" && isAccountsPayable && Number(vatRate) > 0 && directExpenseAccount; updateLine({ vatCode, vatRate }); setForm({ ...form, vatRate, ...(taxableSupplierCheque ? { chequeType: "expense", account: String(directExpenseAccount.name), billId: "", billIds: "[]", billReferences: "", billRemaining: "" } : {}) }); }}><SelectTrigger id="cash-vat-code" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{zeroVatOnly && !vatCodeOptions.some((option) => option.code === "ZERO") && <SelectItem value="ZERO">ZERO · 0%</SelectItem>}{vatCodeOptions.map((option) => <SelectItem key={option.code} value={option.code} disabled={(zeroVatOnly && option.code !== "ZERO") || (form.type === "cheque" && isAccountsPayable && Number(option.rate) > 0 && !directExpenseAccount)}>{option.label}</SelectItem>)}</SelectContent></Select>{form.type === "cheque" && isAccountsPayable && <p className="text-xs text-slate-500">Choose any active VAT code. Selecting taxable VAT changes this cheque to Direct expense and clears selected bills.</p>}</div>
      <div className="space-y-2"><Label>VAT Amount</Label><Input readOnly value={formatMoney(vat, form.currency)} className="bg-slate-100" /></div>
      <div className="space-y-2"><Label>Total</Label><Input readOnly value={formatMoney(amount + vat, form.currency)} className="bg-slate-100 font-bold" /></div>
      <div className="md:col-span-2 xl:col-span-4"><Field label="Memo" name="memo" form={form} setForm={setForm} placeholder="Optional note" /></div>
      {form.type === "cheque" && form.billReferences && <label className="grid gap-2 text-sm md:col-span-2 xl:col-span-4">Cheque memo<textarea readOnly className="min-h-20 rounded-md border bg-background p-3" value={[form.memo, `Bill references: ${form.billReferences}`].filter(Boolean).join(" · ")} /><span className="text-muted-foreground">Selected bill references are added automatically when saved.</span></label>}
      </div>
    </section>
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">This {receivePayment ? "payment reduces Accounts Receivable" : payBill ? "payment reduces Accounts Payable and the linked bank account" : isAccountsPayable ? "cheque reduces Accounts Payable" : "cheque posts to the selected expense account"} for the selected inventory.</div>
  </div>;
}

function BankTransactionFields({ form, setForm, contacts, accounts, locations, lines, setLines, vatCodeOptions, exchangeRates, baseCurrency }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void; contacts: DataRecord[]; accounts: DataRecord[]; locations: InventoryLocation[]; lines: LineForm[]; setLines: (lines: LineForm[]) => void; vatCodeOptions: VatCodeOption[]; exchangeRates: ExchangeRateRecord[]; baseCurrency: string }) {
  const line = lines[0] ?? { itemId: "", description: "", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: "ZERO", vatRate: "0" };
  const updateLine = (changes: Partial<LineForm>) => setLines([{ ...line, ...changes }]);
  const banks = accounts.filter((account) => account.active && (account.type === "Bank" || account.systemRole === "BANK"));
  const expenseAccounts = accounts.filter((account) => account.active && ["Expense", "Cost of Goods Sold", "Other Expense", "Purchases"].includes(String(account.type)));
  const incomeAccounts = accounts.filter((account) => account.active && ["Income", "Other Income", "Equity"].includes(String(account.type)));
  const vendors = contacts.filter((contact) => contact.type === "vendor");
  const isTransfer = form.type === "transfer";
  const fromBank = banks.find(bank => bank.name === form.account);
  const toBank = banks.find(bank => bank.name === form.party && bank.name !== form.account);
  const transferBankLabel = (bank: DataRecord) => `${bank.code} · ${bank.name} · ${bank.currency || baseCurrency} · Balance ${formatMoney(Number(bank.balance || 0), baseCurrency)}`;
  const transferBalance = (bank: DataRecord | undefined) => bank ? `Current balance: ${formatMoney(Number(bank.balance || 0), baseCurrency)} (${baseCurrency} ledger balance)` : "Select a bank to see its balance.";
  const isCard = form.type === "credit card charge";
  const isOrder = form.type === "cheque order";
  const hasCreditCard = accounts.some((account) => account.active && account.type === "Credit Card");
  const selectableAccounts = isTransfer || isOrder ? banks : isCard ? expenseAccounts : incomeAccounts;
  const amount = Number(line.unitPrice || 0);
  const vat = amount * Number(line.vatRate || 0) / 100;
  return <div className="space-y-5">
    <div className="grid gap-4 rounded-xl border bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-3">
      <Field label={isOrder ? "Order Reference" : "Reference Number"} name="number" form={form} setForm={setForm} required />
      <Field label={isOrder ? "Order Date" : "Transaction Date"} name="transactionDate" type="date" form={form} setForm={setForm} required />
      <div className="space-y-2"><Label>Inventory *</Label><Select disabled={Boolean(form.revision)} value={form.transactionLocationId || String(locations[0]?.id ?? "")} onValueChange={(transactionLocationId) => setForm({ ...form, transactionLocationId })}><SelectTrigger className="w-full"><SelectValue placeholder="Select inventory" /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}</SelectContent></Select></div>
      <CurrencyExchangeChoice form={form} setForm={setForm} exchangeRates={exchangeRates} baseCurrency={baseCurrency} />
      <Field label={`Exchange rate to ${baseCurrency}`} name="exchangeRate" type="number" form={form} setForm={setForm} required />
      <div className="space-y-2"><Label>{isTransfer ? "Transfer From" : isCard ? "Expense Account" : isOrder ? "Bank Account" : "Deposit Source"} *</Label><Select value={form.account || undefined} onValueChange={(account) => setForm({ ...form, account, ...(isTransfer && form.party === account ? { party: "" } : {}) })}><SelectTrigger className="w-full"><SelectValue placeholder="Select account" /></SelectTrigger><SelectContent>{selectableAccounts.map((account) => <SelectItem key={account.id} value={String(account.name)}>{isTransfer ? transferBankLabel(account) : `${account.code} · ${account.name}`}</SelectItem>)}</SelectContent></Select>{isTransfer && <p className="rounded-md border bg-white p-3 text-sm font-semibold" aria-live="polite">{transferBalance(fromBank)}</p>}</div>
      {isTransfer ? <div className="space-y-2"><Label>Transfer To *</Label><Select value={form.party || undefined} onValueChange={(party) => setForm({ ...form, party })}><SelectTrigger className="w-full"><SelectValue placeholder="Select destination bank" /></SelectTrigger><SelectContent>{banks.filter((account) => String(account.name) !== form.account).map((account) => <SelectItem key={account.id} value={String(account.name)}>{transferBankLabel(account)}</SelectItem>)}</SelectContent></Select><p className="rounded-md border bg-white p-3 text-sm font-semibold" aria-live="polite">{transferBalance(toBank)}</p></div> : isCard || isOrder ? <div className="space-y-2"><Label>{isOrder ? "Supplier" : "Vendor / Payee"} *</Label><Select value={form.party || undefined} onValueChange={(party) => setForm({ ...form, party })}><SelectTrigger className="w-full"><SelectValue placeholder="Select vendor" /></SelectTrigger><SelectContent>{vendors.map((vendor) => <SelectItem key={vendor.id} value={String(vendor.name)}>{String(vendor.company || vendor.name)}</SelectItem>)}</SelectContent></Select></div> : <Field label="Received From" name="party" form={form} setForm={setForm} required placeholder="Customer, owner, or other source" />}
    </div>
    <div className="grid gap-4 rounded-xl border bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-2 xl:col-span-2"><Label>{isOrder ? "Order Details" : "Description"} *</Label><Input required value={line.description} onChange={(event) => updateLine({ description: event.target.value })} /></div>
      <div className="space-y-2"><Label>{isOrder ? "Estimated Cost" : "Amount"} {isOrder ? "" : "*"}</Label><Input type="number" min={isOrder ? "0" : "0.01"} step="0.01" value={line.unitPrice} onChange={(event) => updateLine({ unitPrice: event.target.value, unitCost: event.target.value })} required /></div>
      {isCard ? <div className="space-y-2"><Label>VAT Code</Label><Select value={line.vatCode} onValueChange={(vatCode) => updateLine({ vatCode, vatRate: vatRateForCode(vatCode, vatCodeOptions) })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{vatCodeOptions.map((option) => <SelectItem key={option.code} value={option.code}>{option.label}</SelectItem>)}</SelectContent></Select></div> : <div className="space-y-2"><Label>VAT Code</Label><Input readOnly value="ZERO · 0%" className="bg-slate-100" /></div>}
      <div className="md:col-span-2 xl:col-span-3"><Field label="Memo" name="memo" form={form} setForm={setForm} placeholder="Optional note" /></div>
      <div className="rounded-lg bg-slate-900 p-3 text-right text-white"><p className="text-xs text-slate-400">Total</p><p className="font-bold">{formatMoney(amount + vat, form.currency)}</p></div>
    </div>
    <div className={`rounded-lg border p-4 text-sm ${isCard && !hasCreditCard ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{isOrder ? "This order is saved for tracking and does not post to the ledger." : isTransfer ? "The amount is credited from the source bank and debited to the destination bank." : isCard && !hasCreditCard ? "Add an active Credit Card account in Chart of Accounts before saving this charge." : isCard ? "The expense and recoverable VAT are posted against the linked credit-card account." : "The linked bank account is debited and the selected source account is credited."}</div>
  </div>;
}
function TransactionFields({ form, setForm, types, items, contacts, accounts, locations, lines, setLines, vatCodeOptions, exchangeRates, baseCurrency }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void; types: string[]; items: DataRecord[]; contacts: DataRecord[]; accounts: DataRecord[]; locations: InventoryLocation[]; lines: LineForm[]; setLines: (lines: LineForm[]) => void; vatCodeOptions: VatCodeOption[]; exchangeRates: ExchangeRateRecord[]; baseCurrency: string }) {
  if (form.type === "bill") return <BillFields form={form} setForm={setForm} items={items} vendors={contacts.filter((contact) => contact.type === "vendor")} salesmen={contacts.filter((contact) => contact.type === "employee")} accounts={accounts} locations={locations} lines={lines} setLines={setLines} vatCodeOptions={vatCodeOptions} exchangeRates={exchangeRates} baseCurrency={baseCurrency} />;
  if (["customer payment", "bill payment", "cheque"].includes(form.type)) return <CashTransactionFields form={form} setForm={setForm} contacts={contacts} accounts={accounts} locations={locations} lines={lines} setLines={setLines} vatCodeOptions={vatCodeOptions} exchangeRates={exchangeRates} baseCurrency={baseCurrency} />;
  if (["deposit", "transfer", "credit card charge", "cheque order"].includes(form.type)) return <BankTransactionFields form={form} setForm={setForm} contacts={contacts} accounts={accounts} locations={locations} lines={lines} setLines={setLines} vatCodeOptions={vatCodeOptions} exchangeRates={exchangeRates} baseCurrency={baseCurrency} />;
  const update = (index: number, changes: Partial<LineForm>) => setLines(lines.map((line, position) => position === index ? { ...line, ...(changes.unitPrice !== undefined ? { homeUnitPrice: undefined } : {}), ...changes } : line));
  const customerDocument = ["invoice", "sales receipt", "quotation", "estimate", "proforma invoice", "sales order", "credit memo", "statement charge", "finance charge"].includes(form.type);
  const purchaseDocument = ["bill", "purchase order", "item receipt", "received item bill"].includes(form.type);
  const selectableItems = items.filter(itemCanBeDocumentLine);
  const documentRate = Math.max(Number(form.exchangeRate) || 1, Number.EPSILON);
  const changeInvoiceForm = (next: Record<string, string>) => {
    if (!customerDocument || (next.currency === form.currency && next.exchangeRate === form.exchangeRate)) { setForm(next); return; }
    try {
      const oldRate = form.currency === baseCurrency ? 1 : validDocumentRate(form.exchangeRate);
      const newRate = next.currency === baseCurrency ? 1 : validDocumentRate(next.exchangeRate);
      setLines(convertInvoiceLines(lines, oldRate, newRate));
      setForm({ ...next, exchangeRate: String(newRate) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Set the currency exchange rate first.");
    }
  };
  const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
  const vat = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(line.vatRate || 0) / 100, 0);
  return <div className="grid gap-4 sm:grid-cols-2">
    {form.sourceDocumentLabel ? <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-medium text-sky-800 sm:col-span-2">Creating {form.type === "bill" ? "supplier bill" : "invoice"} from {form.sourceDocumentLabel}. The original document will be linked and marked converted after saving.</div> : null}
    {form.revision || types.length === 1 || customerDocument ? <div className="space-y-2"><Label htmlFor="transaction-type">Transaction type</Label><Input id="transaction-type" value={form.type} readOnly className="capitalize bg-slate-100" /></div> : <Choice label="Transaction type" name="type" values={types} form={form} setForm={setForm} />}<Field label="Document number" name="number" form={form} setForm={setForm} required />
    <div className="space-y-2 sm:col-span-2"><Label>{customerDocument ? "Customer" : "Vendor / payee"} *</Label><Select value={form.party || undefined} onValueChange={(value) => { const contactType = customerDocument ? "customer" : "vendor"; const party = contacts.find((entry) => entry.type === contactType && String(entry.name) === value); const currency = String(party?.currency || form.currency); const savedRate = exchangeRates.find((entry) => entry.currencyCode === currency)?.rate; changeInvoiceForm({ ...form, party: value, currency, exchangeRate: currency === baseCurrency ? "1" : savedRate ? String(savedRate) : "" }); }}><SelectTrigger className="w-full"><SelectValue placeholder={customerDocument ? "Select customer" : "Select vendor or payee"} /></SelectTrigger><SelectContent>{contacts.filter((contact) => contact.type === (customerDocument ? "customer" : "vendor")).map((contact) => <SelectItem key={contact.id} value={String(contact.name)}>{String(contact.company || contact.name)} · {String(contact.currency)}</SelectItem>)}</SelectContent></Select></div>
    <Field label="Transaction date" name="transactionDate" type="date" form={form} setForm={setForm} required /><Field label="Due date" name="dueDate" type="date" form={form} setForm={setForm} />
    {["invoice", "estimate", "proforma invoice", "sales order", "quotation"].includes(form.type) && <div className="space-y-2"><Label>Inventory *</Label><Select disabled={Boolean(form.sourceDocumentLabel)} value={form.transactionLocationId || String(locations[0]?.id ?? "")} onValueChange={(transactionLocationId) => setForm({ ...form, transactionLocationId })}><SelectTrigger className="w-full"><SelectValue placeholder="Select inventory" /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}</SelectContent></Select></div>}
    {["invoice", "estimate", "proforma invoice", "sales order", "quotation"].includes(form.type) && <div className="space-y-2"><Label htmlFor="document-sales-rep">Sales Rep</Label><Select value={form.salesman || undefined} onValueChange={(salesman) => setForm({ ...form, salesman })}><SelectTrigger id="document-sales-rep" className="w-full"><SelectValue placeholder="Select sales rep" /></SelectTrigger><SelectContent>{contacts.filter((contact) => contact.type === "employee").map((salesman) => <SelectItem key={salesman.id} value={String(salesman.name)}>{String(salesman.name)}</SelectItem>)}{!contacts.some((contact) => contact.type === "employee") && <SelectItem value="no-sales-reps" disabled>No sales reps available</SelectItem>}</SelectContent></Select></div>}
    <CurrencyExchangeChoice form={form} setForm={changeInvoiceForm} exchangeRates={exchangeRates} baseCurrency={baseCurrency} />{customerDocument ? <div className="space-y-2"><Label htmlFor="invoice-exchange-rate">Exchange rate to {baseCurrency}</Label><Input key={`${form.currency}-${form.exchangeRate}`} id="invoice-exchange-rate" type="number" min="0.000001" step="any" required readOnly={form.currency === baseCurrency} defaultValue={form.exchangeRate} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} onBlur={(event) => { const value = event.currentTarget.value; changeInvoiceForm({ ...form, exchangeRate: value }); if (!Number.isFinite(Number(value)) || Number(value) <= 0) event.currentTarget.value = form.exchangeRate; }} /><p className="text-xs text-slate-500">1 {form.currency} = {form.exchangeRate} {baseCurrency}. Item prices convert automatically.</p></div> : <Field label={`Exchange rate to ${baseCurrency}`} name="exchangeRate" type="number" form={form} setForm={setForm} required />}
    <div className="min-w-0 space-y-3 rounded-xl border bg-slate-50 p-3 sm:col-span-2">
      <div className="flex items-center justify-between"><div><Label>Items and services</Label><p className="text-xs text-slate-500">Stock updates when invoices, bills, and item receipts post.</p></div><Button type="button" variant="outline" size="sm" className="brand-primary-button border-transparent font-semibold" onClick={() => setLines([...lines, { itemId: "", description: "", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: form.vatRate === "0" ? "ZERO" : "STANDARD", vatRate: form.vatRate ?? "5" }])}><Plus className="size-3" />Line</Button></div>
      <div className="transaction-lines">{lines.map((line, index) => <div key={index} className="transaction-line rounded-lg border bg-white p-3">
        <div className="transaction-line-description space-y-2"><Label htmlFor={`line-description-${index}`}>Item Description</Label>
          <Select value={line.itemId || "custom"} onValueChange={(value) => { const item = selectableItems.find((entry) => String(entry.id) === value); const selectedVatCode = String(purchaseDocument ? item?.purchaseVatCode || line.vatCode : item?.salesVatCode || line.vatCode); const selectedVatRate = Number(vatRateForCode(selectedVatCode, vatCodeOptions)); const purchaseCostVatRate = Number(vatRateForCode(String(item?.purchaseVatCode || "ZERO"), vatCodeOptions)); const storedPurchasePrice = Number(item?.lastPurchasePrice ?? item?.cost ?? 0); const netPurchasePrice = item?.amountsIncludeVat === true && purchaseCostVatRate > 0 ? storedPurchasePrice / (1 + purchaseCostVatRate / 100) : storedPurchasePrice; const storedSalesPrice = Number(item?.salesPrice ?? 0); const netSalesPrice = item?.amountsIncludeVat === true && selectedVatRate > 0 ? storedSalesPrice / (1 + selectedVatRate / 100) : storedSalesPrice; const storedCost = Number(item?.cost ?? 0); const netCost = item?.amountsIncludeVat === true && purchaseCostVatRate > 0 ? storedCost / (1 + purchaseCostVatRate / 100) : storedCost; const otherQuantity = lines.reduce((sum, entry, position) => position !== index && entry.itemId === value ? sum + Math.max(0, Number(entry.quantity) || 0) : sum, 0); const invoiceQuantity = form.type === "invoice" && !form.revision && item && itemTypeOf(item.itemType) === "stock-part" ? { quantity: String(Math.max(0, Number(item.quantity || 0) - otherQuantity)) } : {}; update(index, value === "custom" ? { itemId: "" } : { ...invoiceQuantity, itemId: value, description: item ? itemDisplayDescription(item) || String(item.name) : "", unitPrice: purchaseDocument ? String(Number((netPurchasePrice / documentRate).toFixed(2))) : invoiceCurrencyAmount(netSalesPrice, documentRate), unitCost: customerDocument ? invoiceCurrencyAmount(netCost, documentRate) : String(netCost), homeUnitPrice: customerDocument ? netSalesPrice : undefined, homeUnitCost: customerDocument ? netCost : undefined, vatCode: selectedVatCode, vatRate: String(selectedVatRate) }); }}><SelectTrigger aria-label={`Item ${index + 1}`} className="w-full min-w-0 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"><SelectValue placeholder="Item" /></SelectTrigger><SelectContent position="popper" className="max-w-[calc(100vw-3rem)] [&_[data-slot=select-item]]:whitespace-normal [&_[data-slot=select-item]]:break-words"><SelectItem value="custom">Service / custom</SelectItem>{selectableItems.map((item) => <SelectItem key={item.id} value={String(item.id)}>{String(item.sku)} · {String(item.name)} · {itemTypeDetails[itemTypeOf(item.itemType)].label}</SelectItem>)}</SelectContent></Select>
          <Textarea id={`line-description-${index}`} aria-label={`Item description ${index + 1}`} placeholder="Description" required rows={2} className="min-h-16 w-full min-w-0 resize-y break-words" value={line.description} onChange={(e) => update(index, { description: e.target.value })} />
          {form.type === "invoice" && <DocumentExtraFields value={{ comments: line.comments || "", serialNumber: line.serialNumber || "" }} onChange={value => update(index, value)} />}
        </div>
        <div className="min-w-0 space-y-2"><Label htmlFor={`line-quantity-${index}`}>Qty</Label><Input id={`line-quantity-${index}`} aria-label="Quantity" title="Quantity" className="w-full min-w-0 px-2" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => update(index, { quantity: e.target.value })} /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor={`line-rate-${index}`}>Rate</Label><Input id={`line-rate-${index}`} aria-label="Unit price" title="Unit rate before VAT" className="w-full min-w-0 px-2" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => update(index, { unitPrice: e.target.value })} /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor={`line-inclusive-${index}`}>Inc VAT</Label><Input id={`line-inclusive-${index}`} aria-label="Unit rate including VAT" title="Unit rate including selected VAT" className="w-full min-w-0 bg-slate-50 px-2" readOnly value={(Number(line.unitPrice || 0) * (1 + Number(line.vatRate || 0) / 100)).toFixed(2)} /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor={`line-vat-${index}`}>VAT</Label>{form.type === "item receipt" ? <Input id={`line-vat-${index}`} readOnly value="0%" className="w-full min-w-0 bg-slate-100 px-2" /> : <Select value={line.vatCode} onValueChange={(vatCode) => update(index, { vatCode, vatRate: vatRateForCode(vatCode, vatCodeOptions) })}><SelectTrigger id={`line-vat-${index}`} aria-label={`VAT rate for line ${index + 1}`} title={vatCodeOptions.find((option) => option.code === line.vatCode)?.label} className="w-full min-w-0 px-2"><SelectValue>{line.vatRate}%</SelectValue></SelectTrigger><SelectContent position="popper" align="end" className="max-w-[min(20rem,calc(100vw-3rem))]">{vatCodeOptions.map((option) => <SelectItem key={option.code} value={option.code} className="whitespace-normal break-words">{option.label}</SelectItem>)}</SelectContent></Select>}</div>
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, position) => position !== index))} className="transaction-line-remove text-slate-400 hover:text-rose-600" title="Delete"><Trash2 className="size-4" /></Button>
      </div>)}</div>
      <div className="ml-auto grid max-w-xs gap-2 pt-2 text-sm"><div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatMoney(subtotal, form.currency)}</span></div><div className="flex justify-between text-slate-500"><span>VAT</span><span>{formatMoney(vat, form.currency)}</span></div><div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span>{formatMoney(subtotal + vat, form.currency)}</span></div></div>
    </div>
    {["invoice", "sales receipt"].includes(form.type) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:col-span-2">
      <label className="flex cursor-pointer items-start gap-3"><Checkbox checked={form.allowNegativeStock === "true"} onCheckedChange={(checked) => setForm({ ...form, allowNegativeStock: checked === true ? "true" : "false", adminOverridePin: checked === true ? form.adminOverridePin ?? "" : "" })} /><span><span className="block text-sm font-semibold text-amber-950">Admin override: allow negative stock</span><span className="mt-1 block text-xs text-amber-800">Normally blocked when stock is insufficient. Configure or change the PIN in Management &gt; Admin Controls.</span></span></label>
      {form.allowNegativeStock === "true" && <div className="mt-3 max-w-sm space-y-2"><Label htmlFor="adminOverridePin">Admin PIN</Label><Input id="adminOverridePin" name="adminOverridePin" type="password" inputMode="numeric" autoComplete="off" required value={form.adminOverridePin ?? ""} onChange={(event) => setForm({ ...form, adminOverridePin: event.target.value })} placeholder="Enter admin PIN" /></div>}
    </div>}
    {form.revision ? <div className="space-y-2"><Label>Status</Label><Input readOnly value={form.status} /></div> : <Choice label="Status" name="status" values={["open", "paid", "overdue", "cleared"]} form={form} setForm={setForm} />}<div className="space-y-2"><Label>Posting account</Label><Select value={form.account} onValueChange={(account) => setForm({ ...form, account })}><SelectTrigger className="w-full"><SelectValue placeholder="Select linked account" /></SelectTrigger><SelectContent>{accounts.filter((account) => account.active && account.systemRole).map((account) => <SelectItem key={account.id} value={String(account.name)}>{String(account.name)}</SelectItem>)}</SelectContent></Select></div>
    <div className="sm:col-span-2"><Field label="Memo" name="memo" form={form} setForm={setForm} /></div>
  </div>;
}
function ContactFields({ form, setForm, accounts }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void; accounts: DataRecord[] }) {
  const countries = ["United Arab Emirates", "Saudi Arabia", "Oman", "Qatar", "Bahrain", "Kuwait", "India", "Pakistan", "China", "Hong Kong", "United Kingdom", "United States", "Other"];
  const ledgerRole = form.type === "customer" ? "AR" : form.type === "vendor" ? "AP" : null;
  const matchingAccounts = ledgerRole ? accounts.filter((account) => account.active && account.systemRole === ledgerRole && String(account.currency) === form.currency) : [];
  const currencyAndAccount = ledgerRole ? <>
    <div className="space-y-2"><Label>Currency *</Label><Select value={form.currency} onValueChange={(currency) => { const match = controlAccountFor(accounts, ledgerRole, currency); setForm({ ...form, currency, ledgerAccountId: match ? String(match.id) : "" }); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{currencies.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-2"><Label>{ledgerRole === "AR" ? "Accounts Receivable" : "Accounts Payable"} account</Label>{matchingAccounts.length ? <Select value={form.ledgerAccountId || String(matchingAccounts[0].id)} onValueChange={(ledgerAccountId) => setForm({ ...form, ledgerAccountId })}><SelectTrigger className="w-full"><SelectValue placeholder={`Select ${form.currency} account`} /></SelectTrigger><SelectContent>{matchingAccounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{String(account.code)} · {String(account.name)}</SelectItem>)}</SelectContent></Select> : <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ledgerRole}-{form.currency} will be created automatically.</div>}<p className="text-xs text-slate-500">Transactions for this contact post to the matching currency control account.</p></div>
  </> : null;
  if (form.type === "vendor") return <div className="space-y-5">
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-bold text-slate-900">Vendor details</p>
      <p className="mt-1 text-xs text-slate-500">Add company, contact, currency and tax information for this vendor.</p>
    </div>
    <div className="space-y-4">
      <Field label="Company Name" name="company" form={form} setForm={(next) => setForm({ ...next, name: next.company })} required placeholder="Enter company name" />
      <Field label="Telephone" name="phone" form={form} setForm={setForm} required placeholder="Format +9713456789" />
      <Field label="Mobile Number" name="whatsapp" form={form} setForm={setForm} placeholder="Format +971501234567" />
      <Field label="Email Address" name="email" type="email" form={form} setForm={setForm} placeholder="Enter email address" />
      {currencyAndAccount}
      <Choice label="Country *" name="country" values={countries} form={form} setForm={setForm} placeholder="Select country" />
      <Field label="TRN" name="trn" form={form} setForm={setForm} placeholder="Enter TRN" />
    </div>
  </div>;
  if (form.type !== "customer") return <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Name" name="name" form={form} setForm={setForm} required /></div><Field label="Company" name="company" form={form} setForm={setForm} /><Field label="Email" name="email" type="email" form={form} setForm={setForm} /><Field label="Phone" name="phone" form={form} setForm={setForm} /></div>;

  return <div className="space-y-5">
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-bold text-slate-900">Customer details</p>
      <p className="mt-1 text-xs text-slate-500">Add billing, contact and tax information for this customer.</p>
    </div>
    <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
      <Field label="Company Name" name="company" form={form} setForm={setForm} required placeholder="Enter company name" />
      <Choice label="Country *" name="country" values={countries} form={form} setForm={setForm} placeholder="Select country" />
      <Field label="Billing Name" name="name" form={form} setForm={(next) => setForm({ ...next, billingName: next.name })} required placeholder="Enter billing name" />
      <Field label="TRN" name="trn" form={form} setForm={setForm} placeholder="Enter TRN" />
      <Field label="Contact Number" name="phone" form={form} setForm={setForm} required placeholder="Format +9713456789" />
      <Choice label="Reseller *" name="reseller" values={["Reseller", "End User"]} form={form} setForm={setForm} />
      <Field label="WhatsApp Number" name="whatsapp" form={form} setForm={setForm} required placeholder="Format +9713456789" />
      <Choice label="Planet *" name="planet" values={["No", "Yes"]} form={form} setForm={setForm} />
      <Field label="Email Address" name="email" type="email" form={form} setForm={setForm} placeholder="Enter email address" />
      <Field label="Passport #" name="passport" form={form} setForm={setForm} placeholder="Enter passport #" />
      {currencyAndAccount}
      
      <div className="space-y-2 md:col-span-2"><Label htmlFor="description">Description</Label><Textarea id="description" name="description" rows={4} placeholder="Add customer notes" value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
    </div>
  </div>;
}
function ItemFields({ form, setForm, items, accounts, contacts, vatCodeOptions, currency, editing }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void; items: DataRecord[]; accounts: DataRecord[]; contacts: DataRecord[]; vatCodeOptions: VatCodeOption[]; currency: string; editing: boolean }) {
  const count = Math.min(30, Math.max(1, Number(form.specCount ?? 8)));
  const [optionData, setOptionData] = useState<{ options: Record<string, string[]>; disabled: Record<string, string[]>; labels: string[]; disabledLabels: string[]; categories: string[]; disabledCategories: string[] }>({ options: {}, disabled: {}, labels: [...specificationFields], disabledLabels: [], categories: ["Laptop"], disabledCategories: [] });
  const loadOptions = useCallback(async () => {
    try {
      const response = await fetch("/api/spec-options");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load choices");
      setOptionData(data);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load choices"); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadOptions(); }, [loadOptions]);

  const changeOption = async (method: "POST" | "PATCH" | "DELETE", payload: Record<string, string>) => {
    const response = await fetch("/api/spec-options", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not update the choice");
    await loadOptions();
  };
  const savedLabels = items.flatMap((item) => {
    try {
      const parsed = JSON.parse(String(item.specifications ?? "[]")) as Array<{ label?: string }>;
      return parsed.map((specification) => specification.label?.trim()).filter((label): label is string => Boolean(label));
    } catch { return []; }
  });
  const disabledLabels = new Set(optionData.disabledLabels);
  const labelOptions = [...new Set([...optionData.labels, ...savedLabels, ...Object.keys(optionData.options)])].filter((label) => !disabledLabels.has(label));
  const disabledCategories = new Set(optionData.disabledCategories);
  const savedCategories = items.map((item) => String(item.category ?? "").trim()).filter(Boolean);
  const categoryOptions = [...new Set([...optionData.categories, ...savedCategories])].filter((category) => !disabledCategories.has(category));
  const description = Array.from({ length: count }, (_, index) => form[`specValue${index}`]?.trim() ?? "").filter((value) => value && value.toLowerCase() !== "no").join(" | ");
  const itemType = itemTypeOf(form.itemType);
  const typeInfo = itemTypeDetails[itemType];
  const standardLineItem = documentLineItemTypes.has(itemType);
  const stockPart = itemType === "stock-part";
  const activeAccounts = accounts.filter((account) => account.active !== false && String(account.active) !== "false");
  const normalizedAccountValue = (value: unknown) => String(value ?? "").trim().toLowerCase();
  const stockCogsAccounts = activeAccounts.filter((account) => {
    const role = normalizedAccountValue(account.systemRole);
    const type = normalizedAccountValue(account.type);
    const name = normalizedAccountValue(account.name);
    return role === "cogs" || type === "cost of goods sold" || name.includes("cost of goods");
  });
  const purchaseAccounts = activeAccounts.filter((account) => {
    const role = normalizedAccountValue(account.systemRole);
    const type = normalizedAccountValue(account.type);
    const name = normalizedAccountValue(account.name);
    return ["cogs", "purchases", "expense"].includes(role)
      || ["cost of goods sold", "expense", "other expense"].includes(type)
      || name.includes("cost of goods")
      || name.includes("purchases");
  });
  const incomeAccounts = activeAccounts.filter((account) => {
    const role = normalizedAccountValue(account.systemRole);
    const type = normalizedAccountValue(account.type);
    return ["sales", "other_income"].includes(role) || ["income", "other income"].includes(type);
  });
  const assetAccounts = activeAccounts.filter((account) => {
    const role = normalizedAccountValue(account.systemRole);
    const name = normalizedAccountValue(account.name);
    return role === "inventory" || name.includes("inventory asset");
  });
  const vendors = contacts.filter((contact) => contact.type === "vendor" && String(contact.status || "active") !== "inactive");
  const selectedPurchaseVat = form.purchaseVatCode || vatCodeOptions.find((code) => code.code === "STANDARD")?.code || vatCodeOptions[0]?.code || "ZERO";
  const selectedSalesVat = form.salesVatCode || vatCodeOptions.find((code) => code.code === "STANDARD")?.code || vatCodeOptions[0]?.code || "ZERO";
  const addSpecification = () => {
    if (count >= 30) return;
    setForm({ ...form, specCount: String(count + 1), [`specLabel${count}`]: specificationFields[count], [`specValue${count}`]: "" });
  };
  const removeSpecification = (index: number) => {
    if (count <= 1) return;
    const nextForm = { ...form };
    for (let position = index; position < count - 1; position += 1) {
      nextForm[`specLabel${position}`] = nextForm[`specLabel${position + 1}`] ?? specificationFields[position];
      nextForm[`specValue${position}`] = nextForm[`specValue${position + 1}`] ?? "";
    }
    delete nextForm[`specLabel${count - 1}`];
    delete nextForm[`specValue${count - 1}`];
    nextForm.specCount = String(count - 1);
    setForm(nextForm);
  };
  const valuesFor = (label: string) => {
    const saved = items.flatMap((item) => {
      try {
        const parsed = JSON.parse(String(item.specifications ?? "[]")) as Array<{ label?: string; value?: string }>;
        return parsed.filter((specification) => specification.label === label && specification.value).map((specification) => specification.value!);
      } catch { return []; }
    });
    const disabled = new Set(optionData.disabled[label] ?? []);
    return [...new Set([...(optionData.options[label] ?? []), ...saved])].filter((value) => !disabled.has(value));
  };
  const accountPicker = (label: string, name: "cogsAccountId" | "incomeAccountId" | "assetAccountId", choices: DataRecord[]) => <div className="space-y-2"><Label>{label}</Label><Select value={form[name] || "none"} onValueChange={(value) => setForm({ ...form, [name]: value === "none" ? "" : value })}><SelectTrigger className="w-full"><SelectValue placeholder="Select account" /></SelectTrigger><SelectContent><SelectItem value="none">Not linked</SelectItem>{choices.map((account) => <SelectItem key={account.id} value={String(account.id)}>{String(account.code || "")} · {String(account.name)}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">Linked to Chart of Accounts.</p></div>;
  const vatPicker = (label: string, name: "purchaseVatCode" | "salesVatCode", value: string) => <div className="space-y-2"><Label>{label}</Label><Select value={value} onValueChange={(next) => setForm({ ...form, [name]: next })}><SelectTrigger className="w-full"><SelectValue placeholder="Select VAT code" /></SelectTrigger><SelectContent>{vatCodeOptions.map((option) => <SelectItem key={option.code} value={option.code}>{option.label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">Linked to Management &gt; VAT Codes.</p></div>;
  return <div data-attachments-excluded="true" className="grid gap-4 sm:grid-cols-2">
    <section className="space-y-4 rounded-xl border bg-white p-4 sm:col-span-2">
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2"><Label>Type *</Label><Select value={itemType} onValueChange={(value) => { const nextType = itemTypeOf(value); setForm({ ...form, itemType: nextType, ...(nextType === "stock-part" ? {} : { quantity: "0", reorderPoint: "0", assetAccountId: "" }) }); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{itemTypeValues.map((value) => <SelectItem key={value} value={value}>{itemTypeDetails[value].label}</SelectItem>)}</SelectContent></Select></div>
        <div className="rounded-lg border bg-slate-50 p-3"><p className="font-semibold text-slate-900">{typeInfo.label}</p><p className="mt-1 text-sm leading-6 text-slate-600">{typeInfo.description}</p><p className="mt-2 text-xs font-semibold text-emerald-700">Linked area: {typeInfo.linkedArea}</p></div>
      </div>
    </section>

    {standardLineItem && <><section className="space-y-4 rounded-xl border bg-slate-50 p-4">
      <div><h3 className="font-bold text-slate-900">Purchase information</h3><p className="mt-1 text-xs text-slate-500">Defaults used when this item is selected on purchase documents.</p></div>
      <Field label={stockPart ? `Cost (${currency})` : `Purchase Cost / Rate (${currency})`} name="cost" type="number" form={form} setForm={setForm} />
      {vatPicker("Purch VAT Code", "purchaseVatCode", selectedPurchaseVat)}
      {accountPicker(stockPart ? "COGS Account" : "Expense / COGS Account", "cogsAccountId", stockPart ? stockCogsAccounts : purchaseAccounts)}
      <div className="space-y-2"><Label>Preferred Supplier</Label><Select value={form.preferredSupplierId || "none"} onValueChange={(value) => setForm({ ...form, preferredSupplierId: value === "none" ? "" : value })}><SelectTrigger className="w-full"><SelectValue placeholder="Select supplier" /></SelectTrigger><SelectContent><SelectItem value="none">No preferred supplier</SelectItem>{vendors.map((vendor) => <SelectItem key={vendor.id} value={String(vendor.id)}>{String(vendor.company || vendor.name)}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">Linked to Vendor Center.</p></div>
    </section>
    <section className="space-y-4 rounded-xl border bg-slate-50 p-4">
      <div><h3 className="font-bold text-slate-900">Sales information</h3><p className="mt-1 text-xs text-slate-500">Defaults used when this item is selected on sales documents.</p></div>
      <Field label={itemType === "service" ? `Rate (${currency})` : `Sales Price (${currency})`} name="salesPrice" type="number" form={form} setForm={setForm} />
      {vatPicker("Sales VAT Code", "salesVatCode", selectedSalesVat)}
      {accountPicker("Income Account", "incomeAccountId", incomeAccounts)}
    </section></>}

    {stockPart && <section className="space-y-4 rounded-xl border bg-white p-4 sm:col-span-2">
      <div><h3 className="font-bold text-slate-900">Stock information</h3><p className="mt-1 text-xs text-slate-500">On-hand stock changes only from stock documents after the opening quantity is saved.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="xl:col-span-1">{accountPicker("Asset Account", "assetAccountId", assetAccounts)}</div>
        <Field label="Reorder Point (Min)" name="reorderPoint" type="number" form={form} setForm={setForm} />
        <div className="space-y-2"><Label>On Hand</Label><Input type="number" min="0" step="0.01" readOnly={editing} value={form.quantity || "0"} onChange={(event) => setForm({ ...form, quantity: event.target.value })} className={editing ? "bg-slate-100" : ""} /><p className="text-xs text-slate-500">{editing ? "Updated by posted stock documents." : "Opening quantity for this inventory."}</p></div>
        <div className="space-y-2"><Label>Average Cost</Label><Input readOnly value={Number(form.cost || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} className="bg-slate-100" /><p className="text-xs text-slate-500">Calculated from posted stock purchases in home currency.</p></div>
        <div className="space-y-2"><Label>On P.O.</Label><Input readOnly value={Number(form.onPo || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} className="bg-slate-100" /><p className="text-xs text-slate-500">Open purchase order quantity.</p></div>
      </div>
    </section>}

    {!standardLineItem && <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 sm:col-span-2"><h3 className="font-bold text-sky-950">Document control item</h3><p className="mt-1 text-sm leading-6 text-sky-900">{typeInfo.label} is linked to <strong>{typeInfo.linkedArea}</strong> rather than the normal stock/service item selector, so it will not change inventory quantity.</p></section>}

    <section className="grid gap-4 rounded-xl border bg-white p-4 sm:col-span-2 md:grid-cols-2">
      <label className="flex items-center gap-3 text-sm font-medium"><Checkbox checked={form.status === "inactive"} onCheckedChange={(checked) => setForm({ ...form, status: checked === true ? "inactive" : "active" })} />Item is inactive</label>
      <label className="flex items-center gap-3 text-sm font-medium"><Checkbox checked={form.amountsIncludeVat === "true"} onCheckedChange={(checked) => setForm({ ...form, amountsIncludeVat: checked === true ? "true" : "false" })} />Amounts Inc VAT</label>
      {form.amountsIncludeVat === "true" && <p className="text-xs text-slate-500 md:col-span-2">Saved Cost and Sales Price/Rate are treated as VAT-inclusive. Document lines convert them to net values using the linked VAT code.</p>}
    </section>

    <div className="space-y-2 sm:col-span-2"><div><Label>Category</Label><p className="mt-1 text-xs text-slate-500">SKU and Item No. are generated automatically for every new item.</p></div><SpecificationValuePicker
      label="Item category"
      placeholder="Select or type category"
      value={form.category ?? ""}
      options={categoryOptions}
      onChange={(value) => setForm({ ...form, category: value })}
      onAdd={(value) => changeOption("POST", { type: "category", value })}
      onRename={(oldValue, newValue) => changeOption("PATCH", { type: "category", oldValue, newValue })}
      onDelete={(value) => changeOption("DELETE", { type: "category", value })}
    /></div>
    <section className="space-y-3 rounded-xl border bg-slate-50 p-4 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><Label>Item description specifications</Label><p className="mt-1 text-xs text-slate-500">Select or type any detail, then enter its value. Add or remove up to 30 fields.</p></div><Button type="button" variant="outline" size="sm" disabled={count >= 30} onClick={addSpecification}><Plus className="size-3" />Add detail ({count}/30)</Button></div>
      <div className="grid gap-2 md:grid-cols-2">{Array.from({ length: count }, (_, index) => <div key={index} className="grid grid-cols-[minmax(130px,.8fr)_minmax(0,1.2fr)_auto] gap-2 rounded-lg border bg-white p-2">
        <SpecificationValuePicker
          label="Specification detail"
          placeholder="Select or type detail"
          value={form[`specLabel${index}`] ?? specificationFields[index]}
          options={labelOptions}
          onChange={(value) => setForm({ ...form, [`specLabel${index}`]: value })}
          onAdd={(value) => changeOption("POST", { type: "label", value })}
          onRename={(oldValue, newValue) => changeOption("PATCH", { type: "label", oldValue, newValue })}
          onDelete={(value) => changeOption("DELETE", { type: "label", value })}
        />
        <SpecificationValuePicker
          label={form[`specLabel${index}`] ?? specificationFields[index]}
          value={form[`specValue${index}`] ?? ""}
          options={valuesFor(form[`specLabel${index}`] ?? specificationFields[index])}
          onChange={(value) => setForm({ ...form, [`specValue${index}`]: value })}
          onAdd={(value) => changeOption("POST", { label: form[`specLabel${index}`] ?? specificationFields[index], value })}
          onRename={(oldValue, newValue) => changeOption("PATCH", { label: form[`specLabel${index}`] ?? specificationFields[index], oldValue, newValue })}
          onDelete={(value) => changeOption("DELETE", { label: form[`specLabel${index}`] ?? specificationFields[index], value })}
        />
        <Button type="button" variant="ghost" size="icon" disabled={count <= 1} aria-label={`Remove ${form[`specLabel${index}`] ?? "specification"}`} title="Remove detail" onClick={() => removeSpecification(index)} className="text-slate-400 hover:text-rose-600"><Trash2 className="size-4" /></Button>
      </div>)}</div>
      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Generated description</p><p className="mt-2 min-h-6 text-sm leading-6 text-slate-700">{description || "Enter specification values to build the item description."}</p></div>
    </section>
  </div>;
}
function SpecificationValuePicker({ label, value, options, onChange, onAdd, onRename, onDelete, placeholder = "Select or enter value" }: { label: string; value: string; options: string[]; onChange: (value: string) => void; onAdd: (value: string) => Promise<void>; onRename: (oldValue: string, newValue: string) => Promise<void>; onDelete: (value: string) => Promise<void>; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [choiceSearch, setChoiceSearch] = useState("");
  const filteredOptions = options.filter((option) => option.toLowerCase().includes(choiceSearch.trim().toLowerCase()));
  const [newValue, setNewValue] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editedValue, setEditedValue] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    try { await action(); toast.success(success); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not update the choice"); }
    finally { setBusy(false); }
  };

  const add = () => {
    const next = newValue.trim();
    if (!next) return;
    run(async () => { await onAdd(next); setNewValue(""); }, "Choice added");
  };
  const rename = (oldValue: string) => {
    const next = editedValue.trim();
    if (!next) return;
    run(async () => {
      await onRename(oldValue, next);
      if (value === oldValue) onChange(next);
      setEditing(null);
    }, "Choice renamed");
  };
  const remove = (option: string) => run(async () => {
    await onDelete(option);
    if (value === option) onChange("");
  }, "Choice removed");

  return <Popover modal open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (nextOpen) setChoiceSearch(""); }}>
    <div className="flex min-w-0">
      <Textarea rows={1} ref={(element) => { if (element) { element.style.height = "auto"; element.style.height = `${element.scrollHeight}px`; } }} aria-label={`${label || "Specification"} value`} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-9 min-w-0 resize-none overflow-hidden rounded-r-none break-words" />
      <PopoverTrigger asChild><Button type="button" variant="outline" size="icon" title={`Manage ${label || "detail"} choices`} aria-label={`Manage ${label || "detail"} choices`} className="h-auto min-h-9 shrink-0 self-stretch rounded-l-none border-l-0"><ChevronDown className="size-4" /></Button></PopoverTrigger>
    </div>
    <PopoverContent data-attachments-excluded="true" align="start" className="flex max-h-[var(--radix-popover-content-available-height)] w-[min(36rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto p-3">
      <div><p className="text-sm font-bold text-slate-900">{label || "Detail"} choices</p><p className="text-xs text-slate-500">Select, add, rename or remove a choice.</p></div>
      <Input aria-label={`Search ${label || "detail"} choices`} placeholder="Search choices…" value={choiceSearch} onChange={(event) => setChoiceSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} className="shrink-0" />
      <div className="min-h-0 max-h-64 space-y-1 overflow-y-auto overscroll-contain pr-1" tabIndex={0} role="region" aria-label={`${label || "Detail"} choices`}>
        {filteredOptions.length === 0 ? <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">{options.length ? "No matching choices." : "No saved choices yet."}</p> : filteredOptions.map((option) => editing === option ? <div key={option} className="flex gap-1">
          <Input autoFocus value={editedValue} onChange={(event) => setEditedValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); rename(option); } }} className="h-8" />
          <Button type="button" size="icon" variant="ghost" disabled={busy} onClick={() => rename(option)} aria-label="Save renamed choice" className="size-8 text-emerald-600"><Check className="size-4" /></Button>
        </div> : <div key={option} className="group flex items-center gap-1 rounded-md hover:bg-slate-50">
          <button type="button" onClick={() => { onChange(option); setOpen(false); }} className="min-w-0 flex-1 whitespace-normal break-words [overflow-wrap:anywhere] px-2 py-2 text-left text-sm">{option}</button>
          <Button type="button" size="icon" variant="ghost" disabled={busy} onClick={() => { setEditing(option); setEditedValue(option); }} aria-label={`Rename ${option}`} className="size-8 shrink-0 text-slate-400 hover:text-sky-600"><Pencil className="size-3.5" /></Button>
          <Button type="button" size="icon" variant="ghost" disabled={busy} onClick={() => remove(option)} aria-label={`Remove ${option}`} className="size-8 shrink-0 text-slate-400 hover:text-rose-600" title="Delete"><Trash2 className="size-3.5" /></Button>
        </div>)}
      </div>
      <div className="flex shrink-0 gap-2 border-t pt-3"><Input value={newValue} onChange={(event) => setNewValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder="Add new choice" className="h-9" /><Button type="button" size="sm" disabled={busy || !newValue.trim()} onClick={add}><Plus className="size-4" />Add</Button></div>
    </PopoverContent>
  </Popover>;
}
function AccountFields({ form, setForm, accounts }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void; accounts: DataRecord[] }) {
  const multiCurrencyRole = form.systemRole === "AR" || form.systemRole === "AP";
  const availableRoles = accountRoleOptions.filter(([role]) => role === "AR" || role === "AP" || !accounts.some((account) => account.systemRole === role));
  const changeSystemRole = (value: string) => {
    const systemRole = value === "none" ? "" : value;
    const type = systemRole === "AR" ? "Accounts Receivable" : systemRole === "AP" ? "Accounts Payable" : form.type;
    setForm({ ...form, systemRole, type });
  };
  return <div className="grid gap-4 sm:grid-cols-2">
    <Field label="Account code" name="code" form={form} setForm={setForm} required />
    <Field label="Account name" name="name" form={form} setForm={setForm} required />
    <Choice label="Account type" name="type" values={accountTypesForRole(form.systemRole || "")} form={form} setForm={setForm} />
    <div className="space-y-2"><Label>Linked system use</Label><Select value={form.systemRole || "none"} onValueChange={changeSystemRole}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No system link</SelectItem>{availableRoles.map(([role, label]) => <SelectItem key={role} value={role}>{label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">{multiCurrencyRole ? "Add one control account for each currency used by customers or vendors." : "Linked accounts appear in invoices, bills, banking, VAT and inventory postings."}</p></div>
    <Choice label={multiCurrencyRole ? "Control account currency *" : "Account currency *"} name="currency" values={currencies} form={form} setForm={setForm} />
    <div className="space-y-2"><Label>Sub-account of</Label><Select value={form.parentAccountId || "none"} onValueChange={(value) => setForm({ ...form, parentAccountId: value === "none" ? "" : value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not a sub-account</SelectItem>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{String(account.code)} · {String(account.name)}</SelectItem>)}</SelectContent></Select></div>
    
  </div>;
}
