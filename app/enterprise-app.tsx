"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle, ArrowRightLeft, BadgeDollarSign, Bell, BookOpen, BookOpenCheck, BookmarkPlus, Boxes, Building2, CheckCircle2, Copy,
  Check, ChevronDown, ChevronRight, CircleDollarSign, Clock3, Download, FileBarChart2, Landmark,
  Eye, ImageUp, KeyRound, LayoutDashboard, LogOut, PackageCheck, PackageSearch, PackageX, Palette, Pencil, Plus, Printer, ReceiptText, RefreshCw,
  Search, Settings, ShieldCheck, ShoppingCart, Stamp, Sun, Moon, Trash2, Users, WalletCards, Percent,
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
import { InventoryOverview } from "@/app/inventory-overview";
import { InventoryCheckReports } from "@/app/inventory-check-reports";
import { ItemLogisticsCenter } from "@/app/item-logistics-center";
import { UserRoleCenter } from "@/app/user-role-center";
import { VatCodeCenter, type VatCodeRecord } from "@/app/vat-code-center";
import { CurrencyRateCenter, type ExchangeRateRecord } from "@/app/currency-rate-center";
import { JournalEntryCenter } from "@/app/journal-entry-center";
import { VatManagementCenter } from "@/app/vat-management-center";

type View = "dashboard" | "inventory-overview" | "sales" | "receive-payment" | "purchases" | "write-cheque" | "customers" | "vendors" | "inventory" | "item-logistics" | "inventory-check-reports" | "transfers" | "banking" | "journal-entries" | "accounts" | "vat-management" | "employees" | "reports" | "companies" | "company-setup" | "inventories" | "invoice-series" | "currencies" | "vat-codes" | "admin-controls";
type AppRole = "admin" | "accountant" | "sales" | "purchasing" | "inventory" | "viewer";
type UserTheme = "emerald" | "ocean" | "indigo" | "violet" | "rose" | "amber";
type AppearanceMode = "light" | "dark";
type CurrentUser = { id: number; fullName: string; email: string; avatarData: string; themeColor: string; appearanceMode: AppearanceMode; role: AppRole; mustChangePassword: boolean };
type Kind = "transactions" | "contacts" | "items" | "accounts";
type DataRecord = Record<string, string | number | boolean> & { id: number };
type LineForm = { itemId: string; description: string; quantity: string; unitPrice: string; unitCost: string; vatCode: string; vatRate: string };
type InventoryLocation = { id: number; companyId: number; name: string; code: string; invoicePrefix: string; nextInvoiceNumber: number; receivable?: number; payable?: number };
type CompanyWorkspace = { id: number; name: string; baseCurrency: string; locations: InventoryLocation[] };
type CompanySetup = { id: number; name: string; baseCurrency: string; logoData: string; stampData: string; addressLine1: string; addressLine2: string; city: string; country: string; phone: string; email: string; trn: string; bankName: string; bankAccountName: string; bankAccountNumber: string; bankIban: string; bankSwift: string; bankCurrency: string; documentTemplate: "classic" | "modern" | "minimal"; documentColor: string };
type ReportData = { title: string; generatedAt: string; currency: string; columns: Array<{ key: string; label: string; type?: "money" }>; rows: Array<Record<string, string | number>>; chart?: { labelKey: string; incomeKey: string; expenseKey: string; incomeLabel?: string; expenseLabel?: string } };
type MemorisedReportRecord = { id: number; companyId: number; locationId: number | null; name: string; reportKey: string; category: ReportCategory; currency: string; periodStart: string; periodEnd: string; updatedAt: string };
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
  accountant: ["dashboard", "inventory-overview", "inventory-check-reports", "sales", "receive-payment", "customers", "purchases", "write-cheque", "vendors", "banking", "journal-entries", "accounts", "vat-management", "reports"],
  sales: ["dashboard", "inventory-overview", "inventory-check-reports", "sales", "receive-payment", "customers"],
  purchasing: ["dashboard", "inventory-overview", "inventory-check-reports", "purchases", "write-cheque", "vendors"],
  inventory: ["dashboard", "inventory-overview", "inventory", "item-logistics", "inventory-check-reports", "transfers"],
  viewer: ["dashboard", "inventory-overview", "inventory-check-reports", "reports"],
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
  "inventory-overview": { title: "Inventory Overview", sub: "All company stock, specifications, quantities and prices" },
  sales: { title: "Sales & Invoicing", sub: "Estimates, sales orders, invoices, receipts and credits" },
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
  sales: ["invoice", "quotation", "estimate", "sales order", "sales receipt", "statement charge", "finance charge", "credit memo", "customer payment"],
  "receive-payment": ["customer payment"],
  purchases: ["bill", "purchase order", "item receipt", "received item bill", "expense", "vendor credit", "bill payment"],
  "write-cheque": ["cheque"],
  banking: ["deposit", "cheque", "credit card charge", "transfer", "cheque order", "opening balance"],
  dashboard: ["invoice", "bill", "expense", "deposit", "cheque", "journal entry"],
};

const allReports = [
  ["Profit & Loss Standard", "Income and expenses by period", "Financial", "profit-loss"],
  ["Profit & Loss Detail", "Every income and expense ledger posting", "Financial", "profit-loss-detail"],
  ["Profit & Loss YTD Comparison", "Current year-to-date against the same prior-year period", "Financial", "profit-loss-ytd"],
  ["Profit & Loss Prev Year Comparison", "This year against the previous calendar year", "Financial", "profit-loss-prev-year"],
  ["Profit & Loss by Job", "Net income grouped by inventory or business location", "Financial", "profit-loss-job"],
  ["Profit & Loss by Class", "Income and expense grouped by transaction type", "Financial", "profit-loss-class"],
  ["Profit & Loss Unclassified", "Income and expense postings without a Chart of Accounts match", "Financial", "profit-loss-unclassified"],
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
  ["Profit & Loss Budget Performance", "Budget performance for income and expenses", "Budgets", "budget-profit-loss"],
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
  ["Pending Sales", "Open estimates, sales orders, and invoices", "Sales", "pending-sales"],
  ["Sales Order Fulfilment", "Open and fulfilled orders", "Sales", "sales-orders"],
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
  ["Stock Valuation Summary", "Stock quantity and value grouped by category", "Inventory", "inventory-valuation"],
  ["Stock Valuation Detail", "Quantity, average cost, and value for every item", "Inventory", "inventory-valuation-detail"],
  ["Stock Status by Item", "Available quantity and reorder position by item", "Inventory", "inventory-status"],
  ["Stock Status by Supplier", "Stock quantity and value grouped by latest supplier", "Inventory", "inventory-status-supplier"],
  ["Physical Stock Worksheet", "Printable count sheet for stock verification", "Inventory", "physical-inventory"],
  ["Pending Builds", "Items below their reorder or build level", "Inventory", "pending-builds"],
  ["Item Profitability", "Gross profit by inventory item", "Inventory", "item-profitability"],
] as const;

const reportCategoryOrder = ["Financial", "Budgets", "Sales", "Customers", "Vendors", "Purchases", "Inventory", "Banking", "VAT", "Accountant", "Lists", "Company"] as const;
type ReportCategory = (typeof reportCategoryOrder)[number];

const currencies = ["AED", "USD", "EUR", "GBP", "SAR", "OMR", "QAR", "BHD", "KWD", "INR", "CNY", "HKD", "JPY", "CAD", "AUD", "CHF", "SGD", "NZD", "PKR", "BDT", "LKR", "MYR", "THB", "IDR", "KRW", "TRY", "ZAR"];
const formatMoney = (value: unknown, currency = "AED") => new Intl.NumberFormat("en-AE", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value ?? 0));
const today = () => new Date().toISOString().slice(0, 10);
const emptyCompanySetup = (id = 0, name = "Company", baseCurrency = "AED"): CompanySetup => ({ id, name, baseCurrency, logoData: "", stampData: "", addressLine1: "", addressLine2: "", city: "", country: "United Arab Emirates", phone: "", email: "", trn: "", bankName: "", bankAccountName: "", bankAccountNumber: "", bankIban: "", bankSwift: "", bankCurrency: baseCurrency, documentTemplate: "modern", documentColor: "#10b981" });
type VatCodeOption = VatCodeRecord & { label: string };
const defaultVatCodeOptions: VatCodeOption[] = [
  { id: -1, companyId: 0, code: "STANDARD", name: "Standard rated", label: "STANDARD · Standard rated · 5%", rate: 5, description: "Standard UAE VAT rate", active: true, system: true },
  { id: -2, companyId: 0, code: "ZERO", name: "Zero rated", label: "ZERO · Zero rated · 0%", rate: 0, description: "Taxable supply charged at 0%", active: true, system: true },
  { id: -3, companyId: 0, code: "EXEMPT", name: "Exempt", label: "EXEMPT · Exempt · 0%", rate: 0, description: "Supply exempt from VAT", active: true, system: true },
  { id: -4, companyId: 0, code: "OUT_OF_SCOPE", name: "Out of scope", label: "OUT OF SCOPE · Out of scope · 0%", rate: 0, description: "Transaction outside the scope of VAT", active: true, system: true },
];
const vatRateForCode = (code: string, options: VatCodeOption[]) => String(options.find((option) => option.code === code)?.rate ?? 0);
const accountRoleOptions = [
  ["BANK", "Bank / cash"], ["AR", "Accounts Receivable (A/R)"], ["AP", "Accounts Payable (A/P)"],
  ["INVENTORY", "Inventory asset"], ["INPUT_VAT", "Recoverable VAT"], ["OUTPUT_VAT", "VAT payable"],
  ["EQUITY", "Opening balance equity"], ["SALES", "Sales income"], ["OTHER_INCOME", "Other income"],
  ["COGS", "Cost of Goods Sold"], ["PURCHASES", "Purchases"], ["EXPENSE", "Operating expense"],
  ["PAYROLL", "Payroll expense"], ["SUSPENSE", "Suspense"],
] as const;
const controlAccountFor = (accounts: DataRecord[], role: "AR" | "AP", currency: string) => accounts.find((account) => account.active && account.systemRole === role && String(account.currency) === currency);
const linkedAccountName = (accounts: DataRecord[], role: string, fallback: string, currency?: string) => String(accounts.find((account) => account.active && account.systemRole === role && (!currency || String(account.currency) === currency))?.name ?? accounts.find((account) => account.active && account.systemRole === role)?.name ?? fallback);
const defaultPostingAccount = (type: string, accounts: DataRecord[]) => {
  if (type === "bill") return linkedAccountName(accounts, "PURCHASES", "Purchases");
  if (type === "bill payment") return linkedAccountName(accounts, "BANK", "Business Bank");
  if (["item receipt", "received item bill"].includes(type)) return linkedAccountName(accounts, "SUSPENSE", "Suspense");
  if (type === "cheque") return linkedAccountName(accounts, "AP", "Accounts Payable");
  if (type === "customer payment") return linkedAccountName(accounts, "BANK", "Business Bank");
  if (["invoice", "quotation", "estimate", "sales order", "sales receipt", "statement charge", "credit memo"].includes(type)) return linkedAccountName(accounts, "SALES", "Sales Revenue");
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
    const values = specifications.map((specification) => specification.value?.trim()).filter(Boolean).join(" | ");
    if (values) return values;
  } catch { /* Fall back to the saved description for older records. */ }
  return String(item.description ?? "");
};

export default function EnterpriseApp({ currentUser }: { currentUser: CurrentUser }) {
  const [view, setView] = useState<View>("dashboard");
  const [records, setRecords] = useState<Record<Kind, DataRecord[]>>({ transactions: [], contacts: [], items: [], accounts: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editorKind, setEditorKind] = useState<Kind | null>(null);
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
    const tx = records.transactions;
    const sales = tx.filter((r) => ["invoice", "sales receipt", "customer payment", "deposit"].includes(String(r.type))).reduce((n, r) => n + Number(r.baseTotal ?? r.total), 0);
    const expenses = tx.filter((r) => ["bill", "expense", "cheque", "bill payment"].includes(String(r.type))).reduce((n, r) => n + Number(r.baseTotal ?? r.total), 0);
    const receivable = tx.reduce((balance, transaction) => ["invoice", "statement charge", "finance charge"].includes(String(transaction.type)) ? balance + Number(transaction.baseTotal ?? transaction.total) : ["customer payment", "credit memo"].includes(String(transaction.type)) ? balance - Number(transaction.baseTotal ?? transaction.total) : balance, 0);
    const payableAccounts = new Set(records.accounts.filter((account) => account.active && account.systemRole === "AP").map((account) => String(account.name)));
    const payable = tx.reduce((balance, transaction) => ["bill", "received item bill"].includes(String(transaction.type)) ? balance + Number(transaction.baseTotal ?? transaction.total) : ["bill payment", "vendor payment", "vendor credit"].includes(String(transaction.type)) || (transaction.type === "cheque" && payableAccounts.has(String(transaction.account))) ? balance - Number(transaction.baseTotal ?? transaction.total) : balance, 0);
    return { sales, expenses, receivable, payable, cash: sales - expenses };
  }, [records.accounts, records.transactions]);

  const currentKind: Kind = view === "customers" || view === "vendors" || view === "employees" ? "contacts" : view === "inventory" ? "items" : view === "accounts" ? "accounts" : "transactions";
  const managementView = view === "inventory-overview" || view === "item-logistics" || view === "inventory-check-reports" || view === "transfers" || view === "journal-entries" || view === "vat-management" || view === "companies" || view === "company-setup" || view === "inventories" || view === "invoice-series" || view === "currencies" || view === "vat-codes" || view === "admin-controls";
  const visibleNavGroups = navGroups.map((group) => ({ ...group, items: group.items.filter((item) => roleViews[currentUser.role].includes(item.id)) })).filter((group) => group.items.length > 0);
  const canWriteCurrentView = roleWriteViews[currentUser.role].includes(view);
  const activeEditorKind = editorKind ?? currentKind;

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
    setEditorKind("transactions");
    if (type === "invoice") {
      setInvoiceInventoryOpen(true);
      return;
    }
    const prefix = type === "customer payment" ? "PAY" : type === "bill payment" ? "BPY" : type === "cheque" ? "CHQ" : type === "credit card charge" ? "CCC" : type === "cheque order" ? "CKO" : type === "transfer" ? "TRF" : type === "deposit" ? "DEP" : type === "statement charge" ? "STC" : type === "finance charge" ? "FIN" : type === "item receipt" ? "REC" : type === "received item bill" ? "RIB" : type === "sales order" ? "SO" : type === "quotation" ? "QUO" : type.slice(0, 3).toUpperCase();
    const taxFree = ["bill", "customer payment", "bill payment", "finance charge", "item receipt", "deposit", "transfer", "cheque order"].includes(type);
    const descriptions: Record<string, string> = { "customer payment": "Payment received", "bill payment": "Bill payment", cheque: "Cheque payment", "credit card charge": "Credit card charge", "cheque order": "Cheque books and envelopes", transfer: "Bank transfer", deposit: "Bank deposit", "statement charge": "Statement charge", "finance charge": "Finance charge", "credit memo": "Credit note / refund", "item receipt": "Items received", "received item bill": "Bill for received items" };
    setForm({ type, number: `${prefix}-${String(records.transactions.length + 1).padStart(4, "0")}`, transactionDate: today(), dueDate: today(), status: "open", account: defaultPostingAccount(type, records.accounts), vatRate: taxFree ? "0" : "5", currency: baseCurrency, exchangeRate: "1", billLocationId: String(activeLocationId), transactionLocationId: String(activeLocationId), salesman: "", isImport: "false", freightCharges: "0" });
    setLines([{ itemId: "", description: descriptions[type] ?? "", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: taxFree ? "ZERO" : "STANDARD", vatRate: taxFree ? "0" : "5" }]);
    setDialogOpen(true);
  }

  function openCreate() {
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
      const itemForm: Record<string, string> = { category: "Laptop", quantity: "0", reorderPoint: "0", salesPrice: "0", cost: "0", specCount: String(initialFields.length) };
      initialFields.forEach((label, index) => { itemForm[`specLabel${index}`] = label; itemForm[`specValue${index}`] = ""; });
      setForm(itemForm);
    }
    else setForm({ type: "Expense", balance: "0", parentAccountId: "", currency: baseCurrency });
    setDialogOpen(true);
  }

  function startInvoice(location: InventoryLocation) {
    setEditorKind("transactions");
    setActiveLocationId(location.id);
    setRecords((current) => ({ ...current, items: [] }));
    setForm({ type: "invoice", number: invoiceNumberPreview(activeCompanyId, location), transactionDate: today(), dueDate: today(), status: "open", account: linkedAccountName(records.accounts, "SALES", "Sales Revenue"), vatRate: "5", currency: baseCurrency, exchangeRate: "1", allowNegativeStock: "false", adminOverridePin: "" });
    setLines([{ itemId: "", description: "", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: "STANDARD", vatRate: "5" }]);
    setInvoiceInventoryOpen(false);
    setDialogOpen(true);
  }

  function openItemEdit(item: DataRecord) {
    let specifications: Array<{ label: string; value: string }> = [];
    try { specifications = JSON.parse(String(item.specifications ?? "[]")); } catch { specifications = []; }
    if (!specifications.length) specifications = specificationFields.filter((label) => label !== "Product Category").slice(0, 8).map((label) => ({ label, value: "" }));
    const itemForm: Record<string, string> = { category: String(item.category ?? "Laptop"), specCount: String(Math.min(30, specifications.length)) };
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
    const saveKind = activeEditorKind;
    if (saveKind === "contacts" && form.type === "customer") {
      const required = [form.company, form.name, form.phone, form.whatsapp, form.country, form.reseller, form.planet, form.currency];
      if (required.some((value) => !value?.trim())) return toast.error("Complete all required customer fields.");
    }
    if (saveKind === "contacts" && form.type === "vendor") {
      const required = [form.company, form.name, form.phone, form.country, form.currency];
      if (required.some((value) => !value?.trim())) return toast.error("Complete all required vendor fields.");
    }
    if (saveKind === "transactions" && form.type === "bill") {
      const required = [form.party, form.number, form.transactionDate, form.currency, form.exchangeRate, form.billLocationId];
      if (required.some((value) => !value?.trim()) || Number(form.exchangeRate) <= 0) return toast.error("Complete the vendor, reference, date, inventory, currency and exchange rate.");
      if (Number(form.freightCharges ?? 0) < 0) return toast.error("Freight charges cannot be negative.");
      if (lines.some((line) => !line.description.trim() || Number(line.quantity) <= 0 || Number(line.unitPrice) < 0)) return toast.error("Complete every bill line with a description, positive quantity and valid rate.");
    }
    if (saveKind === "transactions" && ["customer payment", "bill payment", "cheque"].includes(form.type)) {
      const required = [form.party, form.number, form.transactionDate, form.currency, form.exchangeRate, form.transactionLocationId];
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
      const billFreightCharge = saveKind === "transactions" && form.type === "bill" ? Number(form.freightCharges ?? 0) : 0;
      const billVatRate = form.isImport === "true" ? "5" : "0";
      const submittedLines = billFreightCharge > 0 ? [...lines, { itemId: "", description: "Freight Charges", quantity: "1", unitPrice: String(billFreightCharge), unitCost: String(billFreightCharge), vatCode: billVatRate === "5" ? "STANDARD" : "ZERO", vatRate: billVatRate }] : lines;
      const selectedLocationId = saveKind === "transactions" && form.type === "bill" ? Number(form.billLocationId || activeLocationId) : saveKind === "transactions" ? Number(form.transactionLocationId || activeLocationId) : activeLocationId;
      const response = await fetch("/api/records", { method: editingItem ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: saveKind, companyId: activeCompanyId, locationId: selectedLocationId, ...(editingItem ? { id: editingItemId } : {}), ...form, ...(saveKind === "transactions" ? { lines: submittedLines } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save record");
      setRecords((old) => ({ ...old, [saveKind]: editingItem ? old[saveKind].map((record) => record.id === data.record.id ? data.record : record) : [data.record, ...old[saveKind]] }));
      setDialogOpen(false); setEditorKind(null); setEditingItemId(null); toast.success(data.generatedAccount ? `${data.generatedAccount.name} created and linked automatically` : editingItem ? "Item updated" : "Record saved and posted");
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

  function convertSourceDocument(source: TransactionDetail) {
    const record = source.record;
    const purchaseOrder = record.type === "purchase order";
    if ((!purchaseOrder && !["quotation", "estimate", "sales order"].includes(String(record.type))) || record.convertedInvoiceId || record.status === "converted") return toast.error("This document cannot be converted again.");
    const locationId = Number(record.locationId);
    const location = activeLocations.find((candidate) => candidate.id === locationId);
    if (!location) return toast.error("The source inventory is not available.");
    setEditorKind("transactions");
    setActiveLocationId(locationId);
    setForm(purchaseOrder ? {
      type: "bill", sourceTransactionId: String(record.id), sourceDocumentLabel: `${String(record.type)} ${String(record.number)}`,
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

  async function openReport(key: string, period?: { start: string; end: string }, saved?: { locationId: number | null; currency: string }) {
    setReportLoading(true);
    try {
      const periodQuery = period ? `&periodStart=${period.start}&periodEnd=${period.end}` : "";
      const reportLocationId = saved?.locationId ?? activeLocationId;
      const reportCurrency = saved?.currency || baseCurrency;
      const response = await fetch(`/api/reports?type=${key}&companyId=${activeCompanyId}&locationId=${reportLocationId}&currency=${reportCurrency}${periodQuery}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate report");
      setReport(data.report);
      setReportContext({ key, locationId: reportLocationId, currency: reportCurrency, periodStart: period?.start ?? "", periodEnd: period?.end ?? "" });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not generate report"); }
    finally { setReportLoading(false); }
  }

  async function saveMemorisedReport() {
    if (!report || !reportContext) return;
    const definition = allReports.find((candidate) => candidate[3] === reportContext.key);
    if (!definition) return toast.error("This report cannot be memorised.");
    setMemoriseSaving(true);
    try {
      const response = await fetch("/api/memorised-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: activeCompanyId, locationId: reportContext.locationId, name: definition[0], reportKey: reportContext.key, category: definition[2], currency: reportContext.currency, periodStart: reportContext.periodStart, periodEnd: reportContext.periodEnd }) });
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
    const period = record.periodStart && record.periodEnd ? { start: record.periodStart, end: record.periodEnd } : undefined;
    void openReport(record.reportKey, period, { locationId: record.locationId, currency: record.currency });
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
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-7">
          <div className="flex min-w-0 items-center gap-3"><SidebarTrigger className="text-slate-600" /><div className="hidden h-5 w-px bg-slate-200 sm:block" /><div className="min-w-0"><h1 className="truncate text-lg font-bold text-slate-900">{heading.title}</h1><p className="hidden truncate text-xs text-slate-500 sm:block">{heading.sub}</p></div></div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" disabled={appearanceSaving} onClick={() => changeAppearance(appearanceMode === "light" ? "dark" : "light")} aria-label={`Switch to ${appearanceMode === "light" ? "dark" : "light"} mode`} title={`Switch to ${appearanceMode === "light" ? "dark" : "light"} mode`}>
              {appearanceMode === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </Button>
            <Badge variant="outline" className="hidden sm:inline-flex">{baseCurrency}</Badge>
            <Select value={String(activeLocationId || "")} onValueChange={(value) => { setActiveLocationId(Number(value)); setSearch(""); }}><SelectTrigger className="w-[165px]"><SelectValue placeholder="Inventory" /></SelectTrigger><SelectContent>{activeLocations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}</SelectContent></Select>
            <Button variant="ghost" size="icon" aria-label="Notifications"><Bell className="size-4" /></Button>
            {!managementView && canWriteCurrentView && <Button onClick={openCreate} className="brand-primary-button font-semibold"><Plus className="size-4" /><span className="hidden sm:inline">{createLabel}</span></Button>}
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1500px] p-4 lg:p-7">
          {view === "company-setup" ? <CompanySetupCenter key={activeCompanyId} setup={companySetup} onSaved={async (saved) => { setCompanySetup(saved); await loadWorkspaces(); }} /> : view === "inventory-overview" ? <InventoryOverview /> : view === "item-logistics" ? <ItemLogisticsCenter key={`${activeCompanyId}-${activeLocationId}`} companyId={activeCompanyId} companyName={activeCompany?.name ?? "Company"} locationId={activeLocationId} locationName={activeLocations.find((location) => location.id === activeLocationId)?.name ?? "Inventory"} canEdit={canWriteCurrentView} /> : view === "inventory-check-reports" ? <InventoryCheckReports key={`${activeCompanyId}-${activeLocationId}`} companyId={activeCompanyId} companyName={activeCompany?.name ?? "Company"} locationId={activeLocationId} locationName={activeLocations.find((location) => location.id === activeLocationId)?.name ?? "Inventory"} canManage={currentUser.role === "admin"} currentUserName={currentUser.fullName || currentUser.email} /> : view === "transfers" ? <MultiLineTransferCenter key={`${activeCompanyId}-${activeLocationId}`} companies={companies} activeLocationId={activeLocationId} onTransferred={loadData} /> : view === "journal-entries" ? <JournalEntryCenter key={`${activeCompanyId}-${activeLocationId}`} companyId={activeCompanyId} companyName={activeCompany?.name ?? "Company"} locationId={activeLocationId} locationName={activeLocations.find((location) => location.id === activeLocationId)?.name ?? "Inventory"} currency={baseCurrency} accounts={records.accounts.map((account) => ({ id: account.id, code: String(account.code), name: String(account.name), type: String(account.type), active: Boolean(account.active) }))} onPosted={loadData} /> : view === "vat-management" ? <VatManagementCenter key={`${activeCompanyId}-${activeLocationId}`} companyId={activeCompanyId} companyName={activeCompany?.name ?? "Company"} locationId={activeLocationId} locationName={activeLocations.find((location) => location.id === activeLocationId)?.name ?? "Inventory"} currency={baseCurrency} canWrite={canWriteCurrentView} canManageCodes={currentUser.role === "admin"} onOpenReport={openReport} onManageCodes={() => setView("vat-codes")} /> : view === "currencies" ? <CurrencyRateCenter key={activeCompanyId} company={activeCompany} currencies={currencies} onCompanyChanged={loadWorkspaces} onRatesChanged={loadExchangeRates} /> : view === "vat-codes" ? <VatCodeCenter key={activeCompanyId} companyId={activeCompanyId} companyName={activeCompany?.name ?? "Company"} onChanged={loadVatCodes} /> : view === "admin-controls" ? <AdminSettingsCenter key={activeCompanyId} companyId={activeCompanyId} companyName={activeCompany?.name ?? "Company"} currentUserEmail={currentUser.email} /> : managementView ? <WorkspaceCenter mode={view as "companies" | "inventories" | "invoice-series" | "currencies"} companies={companies} activeCompanyId={activeCompanyId} onChanged={loadWorkspaces} /> : view === "dashboard" ? <Dashboard metrics={metrics} records={records} companyName={activeCompany?.name ?? "Company"} currency={baseCurrency} themeColor={themeColor} themeSaving={themeSaving} onThemeChange={changeTheme} onNavigate={(next) => { if (roleViews[currentUser.role].includes(next)) setView(next); else toast.error("Your role does not allow this action."); }} onWorkflow={(type, target) => { if (!roleViews[currentUser.role].includes(target) || !roleWriteViews[currentUser.role].includes(target)) return toast.error("Your role does not allow this action."); setView(target); openTransaction(type); }} onCreate={openCreate} onOpenDetail={openDetail} canCreate={roleWriteViews[currentUser.role].includes("sales")} canViewReports={roleViews[currentUser.role].includes("reports")} /> : view === "reports" ? <ReportCenter metrics={metrics} currency={baseCurrency} memorisedReports={memorisedReports} onOpen={openReport} onOpenMemorised={openMemorisedReport} onDeleteMemorised={removeMemorisedReport} loading={reportLoading} /> : view === "sales" ? <SalesCenter records={filteredRecords} accounts={records.accounts} currency={baseCurrency} loading={loading} search={search} setSearch={setSearch} onRefresh={loadData} onCreate={openCreate} onDelete={removeRecord} onTransaction={openTransaction} onOpenDetail={openDetail} canWrite={canWriteCurrentView} canDelete={currentUser.role === "admin"} /> : view === "purchases" ? <PurchaseCenter records={filteredRecords} accounts={records.accounts} currency={baseCurrency} loading={loading} search={search} setSearch={setSearch} onRefresh={loadData} onCreate={openCreate} onDelete={removeRecord} onTransaction={openTransaction} onOpenDetail={openDetail} canWrite={canWriteCurrentView} canDelete={currentUser.role === "admin"} /> : view === "customers" ? <CustomerCenter records={filteredRecords} accounts={records.accounts} currency={baseCurrency} loading={loading} search={search} setSearch={setSearch} onRefresh={loadData} onCreateCustomer={openCreate} onDelete={removeRecord} onTransaction={openTransaction} onStatement={() => openReport("customer-statements")} onOpenDetail={openDetail} canWrite={canWriteCurrentView} canDelete={currentUser.role === "admin"} reportLoading={reportLoading} /> : view === "vendors" ? <VendorCenter records={filteredRecords} accounts={records.accounts} currency={baseCurrency} loading={loading} search={search} setSearch={setSearch} onRefresh={loadData} onCreateVendor={openCreate} onDelete={removeRecord} onTransaction={openTransaction} onOpenDetail={openDetail} canWrite={canWriteCurrentView} canDelete={currentUser.role === "admin"} /> : view === "banking" ? <BankingCenter records={filteredRecords} accounts={records.accounts} currency={baseCurrency} loading={loading} search={search} setSearch={setSearch} onRefresh={loadData} onCreate={openCreate} onDelete={removeRecord} onTransaction={openTransaction} onReport={openReport} onOpenDetail={openDetail} canWrite={canWriteCurrentView} canDelete={currentUser.role === "admin"} reportLoading={reportLoading} /> : (
            <RecordView view={view} kind={currentKind} records={filteredRecords} accounts={records.accounts} currency={baseCurrency} loading={loading} search={search} setSearch={setSearch} onRefresh={loadData} onCreate={openCreate} onDelete={removeRecord} onEditItem={openItemEdit} onDuplicateItem={duplicateItem} onOpenDetail={openDetail} canWrite={canWriteCurrentView} canDelete={currentUser.role === "admin"} />
          )}
        </div>
      </SidebarInset>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingItemId(null); setEditorKind(null); } }}>
        <DialogContent data-record-kind={activeEditorKind} className={`max-h-[90vh] overflow-y-auto ${activeEditorKind === "transactions" || activeEditorKind === "items" || (activeEditorKind === "contacts" && view === "customers") ? "sm:max-w-5xl" : "sm:max-w-xl"}`}>
          <DialogHeader><DialogTitle>{editingItemId !== null && activeEditorKind === "items" ? "Edit Item" : editorLabel}</DialogTitle><DialogDescription>{editingItemId !== null && activeEditorKind === "items" ? "Update the category and item description details." : activeEditorKind === "transactions" && form.type === "bill" ? "Select the vendor and enter the bill items below." : "Enter the record details below. Required fields are marked."}</DialogDescription></DialogHeader>
          <form onSubmit={saveRecord} className="space-y-5">
            {activeEditorKind === "transactions" && <TransactionFields form={form} setForm={setForm} types={["sales", "customers", "vendors", "banking"].includes(view) ? [form.type] : transactionTypes[view] ?? transactionTypes.dashboard} items={records.items} contacts={records.contacts} accounts={records.accounts} locations={activeLocations} lines={lines} setLines={setLines} vatCodeOptions={vatCodeOptions} exchangeRates={exchangeRates} baseCurrency={baseCurrency} />}
            {activeEditorKind === "contacts" && <ContactFields form={form} setForm={setForm} accounts={records.accounts} />}
            {activeEditorKind === "items" && <ItemFields form={form} setForm={setForm} items={records.items} />}
            {activeEditorKind === "accounts" && <AccountFields form={form} setForm={setForm} accounts={records.accounts} />}
            <DialogFooter><Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditorKind(null); }}>Cancel</Button><Button type="submit" disabled={saving} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">{saving ? "Saving…" : editingItemId !== null && activeEditorKind === "items" ? "Save changes" : "Save record"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={invoiceInventoryOpen} onOpenChange={setInvoiceInventoryOpen}>
        <DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>Select Inventory</DialogTitle><DialogDescription>Choose which company inventory will issue this invoice. Every company and inventory combination has its own invoice-number series.</DialogDescription></DialogHeader><div className="grid gap-3 py-3 sm:grid-cols-2 lg:grid-cols-3">{activeLocations.map((location) => <button type="button" key={location.id} onClick={() => startInvoice(location)} className="rounded-xl border-2 border-slate-200 bg-white p-5 text-left transition hover:border-emerald-400 hover:bg-emerald-50"><p className="font-semibold text-slate-900">{location.name}</p><p className="mt-2 font-mono text-xs text-slate-500">Next: {invoiceNumberPreview(activeCompanyId, location)}</p></button>)}</div>{activeLocations.length === 0 && <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Add an inventory location before creating an invoice.</p>}</DialogContent>
      </Dialog>
      <DocumentDialog key={detail ? String(detail.record.id) : "closed-document"} detail={detail} companyName={activeCompany?.name ?? "Company"} baseCurrency={baseCurrency} setup={companySetup} canConvert={detail?.record.type === "purchase order" ? roleWriteViews[currentUser.role].includes("purchases") : roleWriteViews[currentUser.role].includes("sales")} onConvert={convertSourceDocument} onClose={() => setDetail(null)} />
      <ReportDialog report={report} companyName={activeCompany?.name ?? "Company"} memorised={Boolean(reportContext && memorisedReports.some((savedReport) => savedReport.reportKey === reportContext.key))} saving={memoriseSaving} onMemorise={saveMemorisedReport} onClose={() => setReport(null)} />
      <WorkspaceDialog open={workspaceOpen} companies={companies} activeCompanyId={activeCompanyId} onClose={() => setWorkspaceOpen(false)} onChanged={loadWorkspaces} />
      <Toaster richColors position="bottom-right" />
    </SidebarProvider>
  );
}

function Dashboard({ metrics, records, companyName, currency, themeColor, themeSaving, onThemeChange, onNavigate, onWorkflow, onCreate, onOpenDetail, canCreate, canViewReports }: { metrics: Record<string, number>; records: Record<Kind, DataRecord[]>; companyName: string; currency: string; themeColor: UserTheme; themeSaving: boolean; onThemeChange: (theme: UserTheme) => void; onNavigate: (v: View) => void; onWorkflow: (type: string, target: View) => void; onCreate: () => void; onOpenDetail: (id: number) => void; canCreate: boolean; canViewReports: boolean }) {
  const [dashboardTab, setDashboardTab] = useState<"home" | "insights">("home");
  const recent = records.transactions.slice(0, 6);
  const cards = [
    ["Cash position", metrics.cash, CircleDollarSign, "Available net cash", "emerald"],
    ["Accounts receivable", metrics.receivable, Clock3, "Open customer invoices", "blue"],
    ["Accounts payable", metrics.payable, BadgeDollarSign, "Open vendor bills", "amber"],
    ["Inventory value", records.items.reduce((n, i) => n + Number(i.quantity) * Number(i.cost), 0), PackageSearch, `${records.items.length} active items`, "violet"],
  ] as const;
  const max = Math.max(metrics.sales, metrics.expenses, 1);
  return <div className="space-y-6">
    <div className="flex w-fit rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Overview sections"><button type="button" role="tab" aria-selected={dashboardTab === "home"} onClick={() => setDashboardTab("home")} className={`rounded-lg px-5 py-2 text-sm font-bold transition ${dashboardTab === "home" ? "brand-primary-button shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}>Home Page</button><button type="button" role="tab" aria-selected={dashboardTab === "insights"} onClick={() => setDashboardTab("insights")} className={`rounded-lg px-5 py-2 text-sm font-bold transition ${dashboardTab === "insights" ? "brand-primary-button shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}>Insights</button></div>
    {dashboardTab === "home" ? <WorkflowHome onNavigate={onNavigate} onWorkflow={onWorkflow} /> : <>
    <section className="brand-hero rounded-2xl p-6 text-white shadow-sm lg:flex lg:items-center lg:justify-between">
      <div><div className="brand-hero-signal mb-3 flex items-center gap-2 text-xs font-semibold tracking-[.15em]"><span className="brand-hero-dot size-2 rounded-full" /> COMPANY FILE ACTIVE</div><h2 className="text-2xl font-bold">{companyName}</h2><p className="mt-1 text-sm text-slate-300">Post transactions, control stock and close your books from one workspace.</p></div>
      <div className="mt-5 flex flex-wrap gap-2 lg:mt-0">{canViewReports && <Button variant="outline" onClick={() => onNavigate("reports")} className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"><FileBarChart2 />View reports</Button>}{canCreate && <Button onClick={onCreate} className="brand-primary-button"><Plus />Record transaction</Button>}</div>
    </section>
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3"><div className="brand-soft-icon grid size-10 shrink-0 place-items-center rounded-xl"><Palette className="size-5" /></div><div><h3 className="text-sm font-bold text-slate-900">Your interface color</h3><p className="text-xs text-slate-500">Saved privately to your user account.</p></div></div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose interface color">{userThemes.map((theme) => <button type="button" key={theme.value} disabled={themeSaving} aria-pressed={themeColor === theme.value} onClick={() => onThemeChange(theme.value)} className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${themeColor === theme.value ? "border-slate-900 bg-slate-900 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}><span className="size-4 rounded-full border border-black/10" style={{ backgroundColor: theme.color }} />{theme.label}{themeColor === theme.value ? <Check className="size-3.5" /> : null}</button>)}</div>
    </section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, Icon, detail, color]) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)]"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{formatMoney(value, currency)}</p></div><div className={`metric-icon metric-${color}`}><Icon className="size-5" /></div></div><p className="mt-4 text-xs text-slate-500">{detail}</p></article>)}</section>
    <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="font-bold text-slate-900">Income vs expenses</h3><p className="text-xs text-slate-500">All posted company transactions</p></div><Badge variant="outline">{currency}</Badge></div><div className="mt-8 grid grid-cols-[80px_1fr] gap-x-4 gap-y-5 text-sm"><span className="text-slate-500">Income</span><div className="flex items-center gap-3"><div className="brand-chart-bar h-8 rounded-r-md" style={{ width: `${Math.max((metrics.sales / max) * 100, metrics.sales ? 6 : 1)}%` }} /><strong className="whitespace-nowrap text-slate-800">{formatMoney(metrics.sales, currency)}</strong></div><span className="text-slate-500">Expenses</span><div className="flex items-center gap-3"><div className="h-8 rounded-r-md bg-sky-400" style={{ width: `${Math.max((metrics.expenses / max) * 100, metrics.expenses ? 6 : 1)}%` }} /><strong className="whitespace-nowrap text-slate-800">{formatMoney(metrics.expenses, currency)}</strong></div></div><div className="mt-7 flex items-center justify-between border-t pt-4"><span className="text-sm text-slate-500">Net result</span><strong className={metrics.sales - metrics.expenses >= 0 ? "brand-accent-text" : "text-rose-600"}>{formatMoney(metrics.sales - metrics.expenses, currency)}</strong></div></article>
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-bold text-slate-900">Business status</h3><div className="mt-5 space-y-4"><StatusLine label="Customers" value={records.contacts.filter((r) => r.type === "customer").length} action={() => onNavigate("customers")} /><StatusLine label="Vendors" value={records.contacts.filter((r) => r.type === "vendor").length} action={() => onNavigate("vendors")} /><StatusLine label="Inventory items" value={records.items.length} action={() => onNavigate("inventory")} /><StatusLine label="Transactions" value={records.transactions.length} action={() => onNavigate("sales")} /></div></article>
    </section>
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b px-5 py-4"><div><h3 className="font-bold text-slate-900">Recent activity</h3><p className="text-xs text-slate-500">Latest entries across the company file</p></div><Button variant="ghost" size="sm" onClick={() => onNavigate("sales")}>View all <ChevronRight /></Button></div><TransactionTable records={recent} empty="No transactions yet. Use Record transaction to add your first entry." onOpen={onOpenDetail} /></article>
    </>}
  </div>;
}

type OverviewWorkflowAction = { label: string; detail: string; icon: typeof ReceiptText; view: View; transaction?: string };

function WorkflowHome({ onNavigate, onWorkflow }: { onNavigate: (view: View) => void; onWorkflow: (type: string, target: View) => void }) {
  const supplierActions: OverviewWorkflowAction[] = [
    { label: "Purchase Orders", detail: "Order supplier stock", icon: FileBarChart2, view: "purchases", transaction: "purchase order" },
    { label: "Receive Stock", detail: "Receive before billing", icon: PackageCheck, view: "purchases", transaction: "item receipt" },
    { label: "Bills Against Stock", detail: "Post received items", icon: ReceiptText, view: "purchases", transaction: "received item bill" },
    { label: "Pay Bills", detail: "Settle supplier balances", icon: WalletCards, view: "purchases", transaction: "bill payment" },
  ];
  const customerActions: OverviewWorkflowAction[] = [
    { label: "Estimates", detail: "Estimate customer work", icon: FileBarChart2, view: "sales", transaction: "estimate" },
    { label: "Sales Orders", detail: "Confirm an accepted order", icon: ShoppingCart, view: "sales", transaction: "sales order" },
    { label: "Create Invoices", detail: "Post customer sales", icon: ReceiptText, view: "sales", transaction: "invoice" },
    { label: "Receive Payments", detail: "Reduce receivables", icon: CircleDollarSign, view: "receive-payment", transaction: "customer payment" },
    { label: "Record Deposits", detail: "Post bank deposits", icon: Landmark, view: "banking", transaction: "deposit" },
    { label: "Sales Receipts", detail: "Immediate paid sales", icon: BadgeDollarSign, view: "sales", transaction: "sales receipt" },
    { label: "Statement Charges", detail: "Charge customer account", icon: Plus, view: "sales", transaction: "statement charge" },
    { label: "Refunds & Credits", detail: "Issue customer credits", icon: RefreshCw, view: "sales", transaction: "credit memo" },
  ];
  const companyActions: OverviewWorkflowAction[] = [
    { label: "Company Setup", detail: "Logo, address, bank, and templates", icon: Settings, view: "company-setup" },
    { label: "Manage VAT", detail: "VAT codes and returns", icon: Percent, view: "vat-management" },
    { label: "Chart of Accounts", detail: "Manage ledger accounts", icon: BookOpen, view: "accounts" },
    { label: "Items & Services", detail: "Products and stock", icon: Boxes, view: "inventory" },
    { label: "Adjust Stock", detail: "Review quantities on hand", icon: PackageSearch, view: "inventory" },
  ];
  const bankingActions: OverviewWorkflowAction[] = [
    { label: "Write Cheques", detail: "Pay by cheque", icon: WalletCards, view: "write-cheque", transaction: "cheque" },
    { label: "Transfer Funds", detail: "Move bank balances", icon: ArrowRightLeft, view: "banking", transaction: "transfer" },
    { label: "Bank Register", detail: "Review bank activity", icon: Landmark, view: "banking" },
    { label: "Reconcile", detail: "Match cleared entries", icon: CheckCircle2, view: "banking" },
  ];

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
    <div className="space-y-5">
      <WorkflowSection title="SUPPLIERS" tone="blue" actions={supplierActions} onNavigate={onNavigate} onWorkflow={onWorkflow} />
      <WorkflowSection title="CUSTOMERS" tone="emerald" actions={customerActions} onNavigate={onNavigate} onWorkflow={onWorkflow} />
      <WorkflowSection title="EMPLOYEES" tone="violet" actions={[{ label: "Employee Center", detail: "Employees, contact details, and activity", icon: Users, view: "employees" }]} onNavigate={onNavigate} onWorkflow={onWorkflow} />
    </div>
    <div className="space-y-5">
      <WorkflowSection title="COMPANY" tone="amber" actions={companyActions} onNavigate={onNavigate} onWorkflow={onWorkflow} compact />
      <WorkflowSection title="BANKING" tone="sky" actions={bankingActions} onNavigate={onNavigate} onWorkflow={onWorkflow} compact />
    </div>
  </div>;
}

function WorkflowSection({ title, tone, actions, onNavigate, onWorkflow, compact = false }: { title: string; tone: "blue" | "emerald" | "violet" | "amber" | "sky"; actions: OverviewWorkflowAction[]; onNavigate: (view: View) => void; onWorkflow: (type: string, target: View) => void; compact?: boolean }) {
  const toneClasses = { blue: "bg-blue-100 text-blue-700", emerald: "bg-emerald-100 text-emerald-700", violet: "bg-violet-100 text-violet-700", amber: "bg-amber-100 text-amber-800", sky: "bg-sky-100 text-sky-700" } as const;
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-3 border-b bg-slate-50 px-5 py-3"><span className={`rounded-md px-3 py-1 text-xs font-black tracking-[.12em] ${toneClasses[tone]}`}>{title}</span><div className="h-px flex-1 bg-slate-200" /></div><div className={`grid gap-px bg-slate-200 ${compact ? "sm:grid-cols-2 xl:grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-4"}`}>{actions.map((action, index) => <button key={action.label} type="button" onClick={() => action.transaction ? onWorkflow(action.transaction, action.view) : onNavigate(action.view)} className="group relative min-h-32 bg-white p-5 text-left transition hover:z-10 hover:bg-emerald-50 focus-visible:z-10"><div className="flex items-start justify-between gap-3"><span className={`grid size-11 place-items-center rounded-xl ${toneClasses[tone]}`}><action.icon className="size-5" /></span>{index < actions.length - 1 ? <ChevronRight className="mt-3 size-4 text-slate-300 group-hover:text-emerald-500" /> : null}</div><p className="mt-4 text-sm font-bold text-slate-900">{action.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{action.detail}</p></button>)}</div></section>;
}

function StatusLine({ label, value, action }: { label: string; value: number; action: () => void }) { return <button onClick={action} className="brand-status-line flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left"><span className="text-sm text-slate-600">{label}</span><span className="flex items-center gap-2 font-bold text-slate-900">{value}<ChevronRight className="size-4 text-slate-400" /></span></button>; }

function SalesCenter({ records, accounts, currency, loading, search, setSearch, onRefresh, onCreate, onDelete, onTransaction, onOpenDetail, canWrite, canDelete }: { records: DataRecord[]; accounts: DataRecord[]; currency: string; loading: boolean; search: string; setSearch: (v: string) => void; onRefresh: () => void; onCreate: () => void; onDelete: (id: number) => void; onTransaction: (type: string) => void; onOpenDetail: (id: number) => void; canWrite: boolean; canDelete: boolean }) {
  const actions = [
    { label: "Create Estimate", detail: "Estimate products, services, VAT, and terms", type: "estimate", icon: BadgeDollarSign },
    { label: "Create Sales Order", detail: "Confirm an accepted order before invoicing", type: "sales order", icon: ShoppingCart },
    { label: "Create Invoice", detail: "Post sales, stock, VAT, and Accounts Receivable", type: "invoice", icon: ReceiptText },
  ];
  return <div className="space-y-6">
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Sales document workflow</h2><p className="mt-1 text-sm text-slate-500">Open any estimate or sales order and choose Convert to Invoice.</p></div><Badge variant="outline" className="w-fit">QuickBooks-style conversion</Badge></div><div className="grid gap-px bg-slate-200 sm:grid-cols-3">{actions.map((action) => <button key={action.type} type="button" disabled={!canWrite} onClick={() => onTransaction(action.type)} className="group min-h-32 bg-white p-5 text-left transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-700"><action.icon className="size-5" /></span><ChevronRight className="size-4 text-slate-300 group-hover:text-emerald-500" /></div><p className="mt-4 text-sm font-bold text-slate-900">{action.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{action.detail}</p></button>)}</div></section>
    <RecordView view="sales" kind="transactions" records={records} accounts={accounts} currency={currency} loading={loading} search={search} setSearch={setSearch} onRefresh={onRefresh} onCreate={onCreate} onDelete={onDelete} onEditItem={() => {}} onDuplicateItem={() => {}} onOpenDetail={onOpenDetail} canWrite={canWrite} canDelete={canDelete} />
  </div>;
}

function PurchaseCenter({ records, accounts, currency, loading, search, setSearch, onRefresh, onCreate, onDelete, onTransaction, onOpenDetail, canWrite, canDelete }: { records: DataRecord[]; accounts: DataRecord[]; currency: string; loading: boolean; search: string; setSearch: (v: string) => void; onRefresh: () => void; onCreate: () => void; onDelete: (id: number) => void; onTransaction: (type: string) => void; onOpenDetail: (id: number) => void; canWrite: boolean; canDelete: boolean }) {
  const actions = [
    { label: "Create Purchase Order", detail: "Order products or services from a supplier", type: "purchase order", icon: FileBarChart2 },
    { label: "Enter Supplier Bill", detail: "Post the supplier invoice and Accounts Payable", type: "bill", icon: ReceiptText },
    { label: "Receive Items", detail: "Receive ordered stock before the bill arrives", type: "item receipt", icon: PackageCheck },
    { label: "Pay Bills", detail: "Settle supplier balances from the linked bank", type: "bill payment", icon: WalletCards },
  ];
  return <div className="space-y-6">
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Purchase order workflow</h2><p className="mt-1 text-sm text-slate-500">Open a Purchase Order and choose Convert to Bill / Supplier Invoice.</p></div><Badge variant="outline" className="w-fit">QuickBooks-style conversion</Badge></div><div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">{actions.map((action) => <button key={action.type} type="button" disabled={!canWrite} onClick={() => onTransaction(action.type)} className="group min-h-32 bg-white p-5 text-left transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-700"><action.icon className="size-5" /></span><ChevronRight className="size-4 text-slate-300 group-hover:text-emerald-500" /></div><p className="mt-4 text-sm font-bold text-slate-900">{action.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{action.detail}</p></button>)}</div></section>
    <RecordView view="purchases" kind="transactions" records={records} accounts={accounts} currency={currency} loading={loading} search={search} setSearch={setSearch} onRefresh={onRefresh} onCreate={onCreate} onDelete={onDelete} onEditItem={() => {}} onDuplicateItem={() => {}} onOpenDetail={onOpenDetail} canWrite={canWrite} canDelete={canDelete} />
  </div>;
}

function CustomerCenter({ records, accounts, currency, loading, search, setSearch, onRefresh, onCreateCustomer, onDelete, onTransaction, onStatement, onOpenDetail, canWrite, canDelete, reportLoading }: { records: DataRecord[]; accounts: DataRecord[]; currency: string; loading: boolean; search: string; setSearch: (v: string) => void; onRefresh: () => void; onCreateCustomer: () => void; onDelete: (id: number) => void; onTransaction: (type: string) => void; onStatement: () => void; onOpenDetail: (id: number) => void; canWrite: boolean; canDelete: boolean; reportLoading: boolean }) {
  const actions = [
    { label: "Create Estimates", detail: "Estimate customer products and services", type: "estimate", icon: BadgeDollarSign },
    { label: "Create Sales Orders", detail: "Confirm an order before invoicing", type: "sales order", icon: ShoppingCart },
    { label: "Create Invoices", detail: "Post sales and accounts receivable", type: "invoice", shortcut: "Ctrl+I", icon: ReceiptText },
    { label: "Enter Sales Receipts", detail: "Record an immediate customer sale", type: "sales receipt", icon: CircleDollarSign },
    { label: "Enter Statement Charges", detail: "Add a charge directly to a statement", type: "statement charge", icon: Plus },
    { label: "Create Statements", detail: "Review and print customer activity", report: true, icon: FileBarChart2 },
    { label: "Assess Finance Charges", detail: "Post a finance charge to receivables", type: "finance charge", icon: BadgeDollarSign },
    { label: "Receive Payments", detail: "Reduce the customer's open balance", type: "customer payment", icon: WalletCards },
    { label: "Create Credit Notes / Refunds", detail: "Reduce receivables with a customer credit", type: "credit memo", icon: RefreshCw },
  ];
  return <div className="space-y-6">
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Customer workflows</h2><p className="mt-1 text-sm text-slate-500">Create and post every customer document from one place.</p></div><Badge variant="outline" className="w-fit">Customer Centre · Ctrl+J</Badge></div>
      <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">{actions.map((action) => <button key={action.label} type="button" disabled={(action.report ? reportLoading : false) || (!action.report && !canWrite)} onClick={() => action.report ? onStatement() : action.type && onTransaction(action.type)} className="group min-h-32 bg-white p-5 text-left transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-700"><action.icon className="size-5" /></span>{action.shortcut && <span className="text-xs font-medium text-slate-400">{action.shortcut}</span>}</div><p className="mt-4 text-sm font-bold text-slate-900">{action.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{action.detail}</p></button>)}</div>
    </section>
    <RecordView view="customers" kind="contacts" records={records} accounts={accounts} currency={currency} loading={loading} search={search} setSearch={setSearch} onRefresh={onRefresh} onCreate={onCreateCustomer} onDelete={onDelete} onEditItem={() => {}} onDuplicateItem={() => {}} onOpenDetail={onOpenDetail} canWrite={canWrite} canDelete={canDelete} />
  </div>;
}

function VendorCenter({ records, accounts, currency, loading, search, setSearch, onRefresh, onCreateVendor, onDelete, onTransaction, onOpenDetail, canWrite, canDelete }: { records: DataRecord[]; accounts: DataRecord[]; currency: string; loading: boolean; search: string; setSearch: (v: string) => void; onRefresh: () => void; onCreateVendor: () => void; onDelete: (id: number) => void; onTransaction: (type: string) => void; onOpenDetail: (id: number) => void; canWrite: boolean; canDelete: boolean }) {
  const actions = [
    { label: "Enter Bills", detail: "Record a vendor bill and receive its items", type: "bill", icon: ReceiptText },
    { label: "Pay Bills", detail: "Reduce the vendor balance and bank account", type: "bill payment", icon: WalletCards },
    { label: "Create Purchase Orders", detail: "Send a non-posting order to a supplier", type: "purchase order", icon: FileBarChart2 },
    { label: "Receive Items and Enter Bill", detail: "Receive stock and post Accounts Payable together", type: "bill", icon: PackageCheck },
    { label: "Receive Items", detail: "Increase stock before the supplier bill arrives", type: "item receipt", icon: Boxes },
    { label: "Enter Bill for Received Items", detail: "Move received-item clearing into Accounts Payable", type: "received item bill", icon: BadgeDollarSign },
  ];
  return <div className="space-y-6">
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Supplier workflows</h2><p className="mt-1 text-sm text-slate-500">Order, receive, bill, and pay vendors from one place.</p></div><Badge variant="outline" className="w-fit">Supplier Centre</Badge></div>
      <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-3">{actions.map((action) => <button key={action.label} type="button" disabled={!canWrite} onClick={() => onTransaction(action.type)} className="group min-h-32 bg-white p-5 text-left transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-700"><action.icon className="size-5" /></span><ChevronRight className="size-4 text-slate-300 group-hover:text-emerald-500" /></div><p className="mt-4 text-sm font-bold text-slate-900">{action.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{action.detail}</p></button>)}</div>
    </section>
    <RecordView view="vendors" kind="contacts" records={records} accounts={accounts} currency={currency} loading={loading} search={search} setSearch={setSearch} onRefresh={onRefresh} onCreate={onCreateVendor} onDelete={onDelete} onEditItem={() => {}} onDuplicateItem={() => {}} onOpenDetail={onOpenDetail} canWrite={canWrite} canDelete={canDelete} />
  </div>;
}

function BankingCenter({ records, accounts, currency, loading, search, setSearch, onRefresh, onCreate, onDelete, onTransaction, onReport, onOpenDetail, canWrite, canDelete, reportLoading }: { records: DataRecord[]; accounts: DataRecord[]; currency: string; loading: boolean; search: string; setSearch: (v: string) => void; onRefresh: () => void; onCreate: () => void; onDelete: (id: number) => void; onTransaction: (type: string) => void; onReport: (key: string) => void; onOpenDetail: (id: number) => void; canWrite: boolean; canDelete: boolean; reportLoading: boolean }) {
  const actions = [
    { label: "Write Cheques", detail: "Pay a vendor or record an expense", type: "cheque", shortcut: "Ctrl+W", icon: WalletCards },
    { label: "Order Cheques & Envelopes", detail: "Record a non-posting cheque-supply order", type: "cheque order", icon: ReceiptText },
    { label: "Enter Credit Card Charges", detail: "Post a purchase to the linked credit-card account", type: "credit card charge", icon: BadgeDollarSign },
    { label: "Use Register", detail: "Review bank debits, credits, and balances", report: "bank-register", shortcut: "Ctrl+R", icon: BookOpen },
    { label: "Make Deposits", detail: "Post money received to the linked bank account", type: "deposit", icon: CircleDollarSign },
    { label: "Transfer Funds", detail: "Move money between two bank accounts", type: "transfer", icon: ArrowRightLeft },
    { label: "Reconcile", detail: "Review cleared and uncleared bank activity", report: "bank-reconciliation", icon: CheckCircle2 },
  ];
  return <div className="space-y-6">
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Banking workflows</h2><p className="mt-1 text-sm text-slate-500">Payments, deposits, transfers, registers, and reconciliation in one place.</p></div><Badge variant="outline" className="w-fit">Banking Centre</Badge></div>
      <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">{actions.map((action) => <button key={action.label} type="button" disabled={action.report ? reportLoading : !canWrite} onClick={() => action.report ? onReport(action.report) : action.type && onTransaction(action.type)} className="group min-h-32 bg-white p-5 text-left transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-700"><action.icon className="size-5" /></span>{action.shortcut ? <span className="text-xs font-medium text-slate-400">{action.shortcut}</span> : <ChevronRight className="size-4 text-slate-300 group-hover:text-emerald-500" />}</div><p className="mt-4 text-sm font-bold text-slate-900">{action.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{action.detail}</p></button>)}</div>
    </section>
    <RecordView view="banking" kind="transactions" records={records} accounts={accounts} currency={currency} loading={loading} search={search} setSearch={setSearch} onRefresh={onRefresh} onCreate={onCreate} onDelete={onDelete} onEditItem={() => {}} onDuplicateItem={() => {}} onOpenDetail={onOpenDetail} canWrite={canWrite} canDelete={canDelete} />
  </div>;
}

function RecordView({ view, kind, records, accounts, currency, loading, search, setSearch, onRefresh, onCreate, onDelete, onEditItem, onDuplicateItem, onOpenDetail, canWrite, canDelete }: { view: View; kind: Kind; records: DataRecord[]; accounts: DataRecord[]; currency: string; loading: boolean; search: string; setSearch: (v: string) => void; onRefresh: () => void; onCreate: () => void; onDelete: (id: number) => void; onEditItem: (item: DataRecord) => void; onDuplicateItem: (id: number) => void; onOpenDetail: (id: number) => void; canWrite: boolean; canDelete: boolean }) {
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "low" | "out">("all");
  const stockCounts = kind === "items" ? {
    all: records.length,
    in: records.filter((record) => Number(record.quantity) > 0).length,
    low: records.filter((record) => Number(record.quantity) > 0 && Number(record.quantity) <= Number(record.reorderPoint)).length,
    out: records.filter((record) => Number(record.quantity) <= 0).length,
  } : { all: 0, in: 0, low: 0, out: 0 };
  const visibleRecords = kind !== "items" || stockFilter === "all" ? records : records.filter((record) => stockFilter === "in" ? Number(record.quantity) > 0 : stockFilter === "low" ? Number(record.quantity) > 0 && Number(record.quantity) <= Number(record.reorderPoint) : Number(record.quantity) <= 0);
  function exportCsv() {
    if (!visibleRecords.length) return toast.error("There are no records to export.");
    const headers = Array.from(new Set(visibleRecords.flatMap((record) => Object.keys(record))));
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [headers.map(escape).join(","), ...visibleRecords.map((record) => headers.map((header) => escape(record[header])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `comnet-${view}-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }
  return <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${view}…`} className="pl-9" /></div><div className="flex gap-2"><Button variant="outline" size="icon" onClick={onRefresh} aria-label="Refresh"><RefreshCw className="size-4" /></Button><Button variant="outline" onClick={exportCsv}><Download className="size-4" />Export</Button>{canWrite && <Button onClick={onCreate} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"><Plus className="size-4" />Add new</Button>}</div></div>
    {kind === "items" ? <div className="flex flex-wrap gap-2 border-b bg-slate-50 p-3"><Button type="button" size="sm" variant={stockFilter === "all" ? "default" : "outline"} onClick={() => setStockFilter("all")}><Boxes className="size-4" />All items <Badge variant="secondary">{stockCounts.all}</Badge></Button><Button type="button" size="sm" variant={stockFilter === "in" ? "default" : "outline"} onClick={() => setStockFilter("in")}><PackageCheck className="size-4" />In stock <Badge variant="secondary">{stockCounts.in}</Badge></Button><Button type="button" size="sm" variant={stockFilter === "low" ? "default" : "outline"} onClick={() => setStockFilter("low")}><AlertTriangle className="size-4" />Low stock <Badge variant="secondary">{stockCounts.low}</Badge></Button><Button type="button" size="sm" variant={stockFilter === "out" ? "destructive" : "outline"} onClick={() => setStockFilter("out")}><PackageX className="size-4" />Out of stock <Badge variant="secondary">{stockCounts.out}</Badge></Button></div> : null}
    {kind === "transactions" ? <TransactionTable records={visibleRecords} empty={loading ? "Loading records…" : "No transactions found."} onDelete={canDelete ? onDelete : undefined} onOpen={onOpenDetail} /> : kind === "contacts" ? <ContactTable records={visibleRecords} accounts={accounts} empty={loading ? "Loading records…" : "No contacts found."} onDelete={canDelete ? onDelete : undefined} /> : kind === "items" ? <ItemTable records={visibleRecords} currency={currency} empty={loading ? "Loading records…" : stockFilter === "out" ? "No out-of-stock items found." : "No inventory items found."} onDelete={canDelete ? onDelete : undefined} onEdit={canWrite ? onEditItem : undefined} onDuplicate={canWrite ? onDuplicateItem : undefined} /> : <AccountTable records={visibleRecords} currency={currency} empty={loading ? "Loading records…" : "No accounts found."} onDelete={canDelete ? onDelete : undefined} />}
  </section>;
}

function EmptyRow({ text, columns }: { text: string; columns: number }) { return <TableRow><TableCell colSpan={columns} className="h-40 text-center text-sm text-slate-500">{text}</TableCell></TableRow>; }
function DeleteButton({ id, onDelete }: { id: number; onDelete?: (id: number) => void }) { return onDelete ? <Button variant="ghost" size="icon" onClick={() => onDelete(id)} aria-label="Delete record" className="text-slate-400 hover:text-rose-600"><Trash2 className="size-4" /></Button> : null; }
function TransactionTable({ records, empty, onDelete, onOpen }: { records: DataRecord[]; empty: string; onDelete?: (id: number) => void; onOpen?: (id: number) => void }) { return <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>No.</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-24" /></TableRow></TableHeader><TableBody>{records.length === 0 ? <EmptyRow text={empty} columns={7} /> : records.map((r) => <TableRow key={r.id} className="cursor-pointer" onDoubleClick={() => onOpen?.(r.id)}><TableCell className="text-slate-500">{String(r.transactionDate)}</TableCell><TableCell className="font-medium capitalize">{String(r.type)}</TableCell><TableCell className="font-mono text-xs text-slate-500">{String(r.number)}</TableCell><TableCell>{String(r.party)}</TableCell><TableCell><StatusBadge value={String(r.status)} /></TableCell><TableCell className="text-right font-semibold">{formatMoney(r.total, String(r.currency || "AED"))}</TableCell><TableCell><div className="flex"><Button variant="ghost" size="icon" onClick={() => onOpen?.(r.id)} aria-label="Open document" className="text-slate-400 hover:text-emerald-600"><Eye className="size-4" /></Button><DeleteButton id={r.id} onDelete={onDelete} /></div></TableCell></TableRow>)}</TableBody></Table>; }
function ContactTable({ records, accounts, empty, onDelete }: { records: DataRecord[]; accounts: DataRecord[]; empty: string; onDelete?: (id: number) => void }) {
  return <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Company</TableHead><TableHead>Currency</TableHead><TableHead>Linked account</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{records.length === 0 ? <EmptyRow text={empty} columns={9} /> : records.map((record) => { const ledgerAccount = accounts.find((account) => account.id === Number(record.ledgerAccountId)); return <TableRow key={record.id}><TableCell className="font-semibold">{String(record.name)}</TableCell><TableCell>{String(record.company || "—")}</TableCell><TableCell><Badge variant="outline">{String(record.currency || "AED")}</Badge></TableCell><TableCell className="text-slate-500">{ledgerAccount ? String(ledgerAccount.name) : record.type === "employee" ? "—" : "Not linked"}</TableCell><TableCell>{String(record.email || "—")}</TableCell><TableCell>{String(record.phone || "—")}</TableCell><TableCell><StatusBadge value={String(record.status)} /></TableCell><TableCell className="text-right font-semibold">{formatMoney(record.balance, String(record.currency || "AED"))}</TableCell><TableCell><DeleteButton id={record.id} onDelete={onDelete} /></TableCell></TableRow>; })}</TableBody></Table>;
}
function ItemTable({ records, currency, empty, onDelete, onEdit, onDuplicate }: { records: DataRecord[]; currency: string; empty: string; onDelete?: (id: number) => void; onEdit?: (item: DataRecord) => void; onDuplicate?: (id: number) => void }) { return <Table><TableHeader><TableRow><TableHead>Item No.</TableHead><TableHead>SKU</TableHead><TableHead>Item & description</TableHead><TableHead>Category</TableHead><TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Reorder</TableHead><TableHead className="text-right">Sales price</TableHead><TableHead className="text-right">Avg. cost</TableHead><TableHead className="w-32" /></TableRow></TableHeader><TableBody>{records.length === 0 ? <EmptyRow text={empty} columns={9} /> : records.map((r) => { const description = itemDisplayDescription(r); const out = Number(r.quantity) <= 0; return <TableRow key={r.id}><TableCell className="font-mono text-xs">{String(r.itemNumber || 13000 + r.id)}</TableCell><TableCell className="font-mono text-xs">{String(r.sku)}</TableCell><TableCell><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{String(r.name)}</p>{out ? <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">Out of stock</Badge> : null}</div>{description ? <p className="mt-1 max-w-lg truncate text-xs text-slate-500" title={description}>{description}</p> : null}</TableCell><TableCell>{String(r.category)}</TableCell><TableCell className={`text-right font-semibold ${out ? "text-rose-600" : ""}`}>{String(r.quantity)}</TableCell><TableCell className="text-right">{String(r.reorderPoint)}</TableCell><TableCell className="text-right">{formatMoney(r.salesPrice, currency)}</TableCell><TableCell className="text-right">{formatMoney(r.cost, currency)}</TableCell><TableCell><div className="flex">{onDuplicate && <Button type="button" variant="ghost" size="icon" onClick={() => onDuplicate(r.id)} aria-label={`Duplicate ${String(r.name)}`} title="Duplicate item" className="text-slate-400 hover:text-violet-600"><Copy className="size-4" /></Button>}{onEdit && <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(r)} aria-label={`Edit ${String(r.name)}`} className="text-slate-400 hover:text-sky-600"><Pencil className="size-4" /></Button>}<DeleteButton id={r.id} onDelete={onDelete} /></div></TableCell></TableRow>; })}</TableBody></Table>; }
function AccountTable({ records, currency, empty, onDelete }: { records: DataRecord[]; currency: string; empty: string; onDelete?: (id: number) => void }) { return <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Account name</TableHead><TableHead>Linked use</TableHead><TableHead>Currency</TableHead><TableHead>Sub-account of</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Balance ({currency})</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{records.length === 0 ? <EmptyRow text={empty} columns={9} /> : records.map((r) => { const parent = records.find((candidate) => candidate.id === Number(r.parentAccountId)); const role = accountRoleOptions.find(([value]) => value === r.systemRole); return <TableRow key={r.id}><TableCell className="font-mono text-xs">{String(r.code)}</TableCell><TableCell className="font-semibold">{String(r.name)}</TableCell><TableCell>{role ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{role[1]}</Badge> : <span className="text-slate-400">Unlinked</span>}</TableCell><TableCell><Badge variant="outline">{String(r.currency || currency)}</Badge></TableCell><TableCell className="text-slate-500">{parent ? String(parent.name) : "—"}</TableCell><TableCell>{String(r.type)}</TableCell><TableCell><Badge variant="outline">{r.active ? "Active" : "Inactive"}</Badge></TableCell><TableCell className="text-right font-semibold">{formatMoney(r.balance, currency)}</TableCell><TableCell><DeleteButton id={r.id} onDelete={onDelete} /></TableCell></TableRow>; })}</TableBody></Table>; }
function StatusBadge({ value }: { value: string }) { const good = value === "paid" || value === "active" || value === "cleared" || value === "converted"; return <Badge variant="outline" className={good ? "border-emerald-200 bg-emerald-50 text-emerald-700" : value === "overdue" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700"}>{value}</Badge>; }

function ReportCenter({ metrics, currency, memorisedReports, onOpen, onOpenMemorised, onDeleteMemorised, loading }: { metrics: Record<string, number>; currency: string; memorisedReports: MemorisedReportRecord[]; onOpen: (key: string) => void; onOpenMemorised: (record: MemorisedReportRecord) => void; onDeleteMemorised: (record: MemorisedReportRecord) => void; loading: boolean }) {
  const [reportSearch, setReportSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<"All" | ReportCategory>("All");
  const normalizedSearch = reportSearch.trim().toLowerCase();
  const reports = allReports.filter(([name, description, category]) =>
    (activeCategory === "All" || category === activeCategory)
    && (!normalizedSearch || [name, description, category].some((value) => value.toLowerCase().includes(normalizedSearch))),
  );
  const groupedReports = reportCategoryOrder
    .map((category) => ({ category, reports: reports.filter((report) => report[2] === category) }))
    .filter((group) => group.reports.length > 0);
  const groupedMemorised = reportCategoryOrder
    .map((category) => ({ category, reports: memorisedReports.filter((report) => report.category === category) }))
    .filter((group) => group.reports.length > 0);
  const resetFilters = () => { setReportSearch(""); setActiveCategory("All"); };

  return <div className="grid gap-6 xl:grid-cols-[1fr_320px]"><div className="space-y-5"><section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Report Center</h2><p className="text-sm text-slate-500">Showing {reports.length} of {allReports.length} reports in {groupedReports.length} {groupedReports.length === 1 ? "category" : "categories"}.</p></div><div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder="Search all reports..." aria-label="Search reports" className="bg-white pl-9" /></div></div><div className="mt-5 flex flex-wrap gap-2"><Button type="button" size="sm" variant={activeCategory === "All" ? "default" : "outline"} onClick={() => setActiveCategory("All")}>All reports <span className="ml-1 opacity-70">{allReports.length}</span></Button>{reportCategoryOrder.map((category) => <Button key={category} type="button" size="sm" variant={activeCategory === category ? "default" : "outline"} onClick={() => setActiveCategory(category)}>{category} <span className="ml-1 opacity-70">{allReports.filter((report) => report[2] === category).length}</span></Button>)}</div></section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between bg-emerald-600 px-5 py-4 text-white"><div><h3 className="font-bold">Memorised Report List</h3><p className="text-xs text-emerald-100">Your saved reports for this company</p></div><Badge className="bg-white text-emerald-700 hover:bg-white">{memorisedReports.length}</Badge></div>{groupedMemorised.length ? <div className="divide-y">{groupedMemorised.map(({ category, reports: savedReports }) => <div key={category} className="p-4"><div className="mb-2 flex items-center gap-2"><ChevronRight className="size-4 text-emerald-600" /><h4 className="text-sm font-bold text-slate-900">{category}</h4></div><div className="grid gap-2 sm:grid-cols-2">{savedReports.map((savedReport) => <div key={savedReport.id} className="group flex items-center gap-2 rounded-lg border bg-slate-50 p-2 hover:border-emerald-300 hover:bg-emerald-50"><button type="button" disabled={loading} onClick={() => onOpenMemorised(savedReport)} className="min-w-0 flex-1 px-2 py-1 text-left disabled:opacity-60"><p className="truncate text-sm font-semibold text-slate-800">{savedReport.name}</p><p className="mt-0.5 text-xs text-slate-500">{savedReport.currency}{savedReport.periodStart ? ` · ${savedReport.periodStart} to ${savedReport.periodEnd}` : " · Current period"}</p></button><Button type="button" variant="ghost" size="icon" onClick={() => onDeleteMemorised(savedReport)} aria-label={`Remove ${savedReport.name}`} className="shrink-0 text-slate-400 hover:text-rose-600"><Trash2 className="size-4" /></Button></div>)}</div></div>)}</div> : <div className="p-6 text-center"><BookmarkPlus className="mx-auto size-6 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-700">No memorised reports yet</p><p className="mt-1 text-xs text-slate-500">Open a report and choose Memorise Report to save its current setup.</p></div>}</section>
    {groupedReports.length > 0 ? groupedReports.map(({ category, reports: categoryReports }) => <section key={category} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b bg-slate-50 px-5 py-4"><div><h3 className="font-bold text-slate-900">{category}</h3><p className="text-xs text-slate-500">{categoryReports.length} {categoryReports.length === 1 ? "report" : "reports"}</p></div><Badge variant="outline" className="bg-white">{category}</Badge></div><div className="grid gap-px bg-slate-200 sm:grid-cols-2">{categoryReports.map(([name, description, , key]) => <button key={name} disabled={loading} onClick={() => onOpen(key)} className="group bg-white p-5 text-left hover:bg-emerald-50 disabled:opacity-60"><div className="flex items-start justify-between"><div className="grid size-9 place-items-center rounded-lg bg-slate-100 text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-700"><FileBarChart2 className="size-4" /></div><ChevronRight className="size-4 text-slate-300 group-hover:text-emerald-500" /></div><h4 className="mt-4 text-sm font-bold text-slate-900">{name}</h4><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></button>)}</div></section>) : <section className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm"><Search className="mx-auto size-6 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No reports found</p><p className="mt-1 text-xs text-slate-500">Try another search or choose a different category.</p><Button variant="outline" size="sm" className="mt-4" onClick={resetFilters}>Show all reports</Button></section>}
  </div><aside className="space-y-4"><article className="rounded-xl bg-[#102033] p-5 text-white"><p className="text-xs font-semibold tracking-widest text-emerald-300">LIVE SUMMARY</p><h3 className="mt-3 text-lg font-bold">Profit & Loss</h3><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between text-slate-300"><span>Income</span><span>{formatMoney(metrics.sales, currency)}</span></div><div className="flex justify-between text-slate-300"><span>Expenses</span><span>({formatMoney(metrics.expenses, currency)})</span></div><div className="flex justify-between border-t border-white/15 pt-3 font-bold"><span>Net income</span><span className="text-emerald-300">{formatMoney(metrics.sales - metrics.expenses, currency)}</span></div></div></article><article className="rounded-xl border border-slate-200 bg-white p-5"><CheckCircle2 className="size-5 text-emerald-500" /><h3 className="mt-3 font-bold">Live reporting</h3><p className="mt-2 text-sm leading-6 text-slate-500">Financial statements, aging, sales, purchasing, inventory, VAT and accountant reports calculate from the company database and can be printed.</p></article></aside></div>;
}

type DocumentMode = "tax-invoice" | "commercial-invoice" | "delivery-note" | "packing-list" | "hs-code-summary";
const documentModeLabels: Record<DocumentMode, string> = { "tax-invoice": "Tax Invoice", "commercial-invoice": "Commercial Invoice", "delivery-note": "Delivery Note", "packing-list": "Packing List", "hs-code-summary": "HS Code Summary" };
function documentLineSpecification(line: DataRecord, names: string[]) {
  const normalized = names.map((name) => name.toLowerCase());
  if (normalized.some((name) => name === "hs code" || name === "hsn code") && line.hsCode) return String(line.hsCode);
  if (normalized.some((name) => name === "country of origin" || name === "coo") && line.countryOfOrigin) return String(line.countryOfOrigin);
  if (normalized.some((name) => name.includes("dimensions")) && line.dimensionText) return String(line.dimensionText);
  if (normalized.some((name) => name.includes("weight")) && Number(line.weightKg) > 0) return `${line.weightKg} kg`;
  try {
    const specifications = JSON.parse(String(line.specifications || "[]")) as Array<{ label?: string; value?: string }>;
    return specifications.find((specification) => names.some((name) => String(specification.label || "").toLowerCase() === name.toLowerCase()))?.value || "—";
  } catch { return "—"; }
}

function DocumentDialog({ detail, companyName, baseCurrency, setup, canConvert, onConvert, onClose }: { detail: TransactionDetail | null; companyName: string; baseCurrency: string; setup: CompanySetup; canConvert: boolean; onConvert: (detail: TransactionDetail) => void; onClose: () => void }) {
  const startingMode: DocumentMode = detail?.record.type === "invoice" ? "tax-invoice" : detail?.record.type === "sales order" ? "delivery-note" : "commercial-invoice";
  const [documentMode, setDocumentMode] = useState<DocumentMode>(startingMode);
  const [showStamp, setShowStamp] = useState(Boolean(setup.stampData));
  const [showBillingName, setShowBillingName] = useState(true);
  const [showShipping, setShowShipping] = useState(true);
  const [showHsCode, setShowHsCode] = useState(false);
  const [showDimensions, setShowDimensions] = useState(false);
  const [selectedBank, setSelectedBank] = useState(setup.bankName || "Emirates NBD Bank");
  if (!detail) return null;
  const record = detail.record;
  const brandedName = setup.name || companyName;
  const contact = detail.partyContact;
  const purchaseOrder = record.type === "purchase order";
  const convertible = (purchaseOrder || ["quotation", "estimate", "sales order"].includes(String(record.type))) && record.status !== "converted" && !record.convertedInvoiceId;
  const showsPrices = documentMode === "tax-invoice" || documentMode === "commercial-invoice";
  const activateDocument = (mode: DocumentMode) => { setDocumentMode(mode); if (mode === "packing-list") setShowDimensions(true); if (mode === "commercial-invoice" || mode === "hs-code-summary") setShowHsCode(true); };
  const downloadDocument = () => {
    const surface = document.querySelector(`[data-document-id="${record.id}"]`);
    if (!surface) return toast.error("Could not prepare the document download.");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${documentModeLabels[documentMode]} ${String(record.number)}</title><style>body{font-family:Arial,sans-serif;color:#0f172a;margin:32px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}.text-right{text-align:right}.rounded-xl{margin-bottom:16px}button,.document-internal-only{display:none}</style></head><body>${surface.innerHTML}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const link = document.createElement("a"); link.href = url; link.download = `${documentModeLabels[documentMode].toLowerCase().replaceAll(" ", "-")}-${String(record.number)}.html`; link.click(); URL.revokeObjectURL(url);
  };
  const actionClass = (active: boolean) => `h-10 w-full justify-start rounded-md border px-3 text-sm font-medium ${active ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-[1400px]">
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_210px]"><div className="document-print-surface space-y-4" data-document-id={record.id}>
    <DialogHeader><div className={`flex items-start justify-between gap-4 rounded-xl p-5 pr-8 ${setup.documentTemplate === "modern" ? "text-white" : setup.documentTemplate === "classic" ? "border-b-4 bg-slate-50" : "border-b"}`} style={setup.documentTemplate === "modern" ? { backgroundColor: setup.documentColor } : setup.documentTemplate === "classic" ? { borderColor: setup.documentColor } : undefined}><div className="flex min-w-0 gap-4">{setup.logoData ? <Image src={setup.logoData} alt={`${brandedName} logo`} width={88} height={56} unoptimized className="h-14 w-22 shrink-0 rounded-lg bg-white object-contain p-1" /> : null}<div><p className={`text-xs font-bold tracking-[.18em] ${setup.documentTemplate === "modern" ? "text-white/80" : "text-emerald-600"}`}>{brandedName.toUpperCase()}</p><DialogTitle className={`mt-2 ${setup.documentTemplate === "modern" ? "text-white" : ""}`}>{documentModeLabels[documentMode]} {String(record.number)}</DialogTitle><DialogDescription className={setup.documentTemplate === "modern" ? "text-white/75" : ""}>{String(record.party)} · {String(record.transactionDate)}</DialogDescription>{(setup.addressLine1 || setup.city || setup.phone || setup.trn) ? <p className={`mt-2 max-w-xl text-xs leading-5 ${setup.documentTemplate === "modern" ? "text-white/75" : "text-slate-500"}`}>{[setup.addressLine1, setup.addressLine2, setup.city, setup.country].filter(Boolean).join(", ")}{setup.phone ? ` · ${setup.phone}` : ""}{setup.trn ? ` · TRN ${setup.trn}` : ""}</p> : null}</div></div><div className="flex flex-wrap justify-end gap-2">{convertible && canConvert ? <Button onClick={() => onConvert(detail)} className={setup.documentTemplate === "modern" ? "bg-white text-slate-900 hover:bg-white/90" : "brand-primary-button"}><ReceiptText className="size-4" />{purchaseOrder ? "Convert to Bill / Supplier Invoice" : "Convert to Invoice"}</Button> : null}</div></div></DialogHeader>
    {record.convertedDocumentNumber ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Converted to {String(record.convertedDocumentType)} {String(record.convertedDocumentNumber)}</div> : null}
    {record.sourceDocumentNumber ? <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-medium text-sky-800">Created from {String(record.sourceDocumentType)} {String(record.sourceDocumentNumber)}</div> : null}
    {(showBillingName || showShipping) ? <div className="grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-2">{showBillingName ? <div><p className="font-bold text-slate-900">Billing Name</p><p className="mt-1">{String(contact?.billingName || contact?.company || record.party)}</p>{contact?.trn ? <p className="mt-1 text-slate-500">TRN: {String(contact.trn)}</p> : null}</div> : null}{showShipping ? <div><p className="font-bold text-slate-900">Shipping Details</p><p className="mt-1">{String(contact?.company || record.party)}</p><p className="mt-1 text-slate-500">{[contact?.country, contact?.phone, contact?.email].filter(Boolean).map(String).join(" · ") || "No shipping details saved"}</p></div> : null}</div> : null}
    <div className="grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-4"><div><p className="text-slate-500">Status</p><StatusBadge value={String(record.status)} /></div><div><p className="text-slate-500">Due date</p><strong>{String(record.dueDate || "—")}</strong></div><div><p className="text-slate-500">Account</p><strong>{String(record.account)}</strong></div><div><p className="text-slate-500">Currency</p><strong>{String(record.currency)}</strong></div></div>
    <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead>Item / Description</TableHead><TableHead className="text-right">Qty</TableHead>{showHsCode ? <><TableHead>HS Code</TableHead><TableHead>COO</TableHead></> : null}{showDimensions ? <><TableHead>Dimensions</TableHead><TableHead>Weight</TableHead></> : null}{showsPrices ? <><TableHead className="text-right">Rate</TableHead>{documentMode === "tax-invoice" ? <TableHead>VAT</TableHead> : null}<TableHead className="text-right">Total</TableHead></> : null}</TableRow></TableHeader><TableBody>{detail.lines.map((line, index) => <TableRow key={index}><TableCell className="font-medium">{line.itemNumber || line.sku ? <p className="mb-1 text-xs font-mono text-slate-500">{String(line.itemNumber || line.sku)}</p> : null}{String(line.description)}</TableCell><TableCell className="text-right">{String(line.quantity)}</TableCell>{showHsCode ? <><TableCell>{documentLineSpecification(line, ["HS Code", "HSN Code"])}</TableCell><TableCell>{documentLineSpecification(line, ["Country of Origin", "COO"])}</TableCell></> : null}{showDimensions ? <><TableCell>{documentLineSpecification(line, ["Dimensions", "Product Dimensions", "Package Dimensions"])}</TableCell><TableCell>{documentLineSpecification(line, ["Weight", "Product Weight", "Package Weight"])}</TableCell></> : null}{showsPrices ? <><TableCell className="text-right">{formatMoney(line.unitPrice, String(record.currency))}</TableCell>{documentMode === "tax-invoice" ? <TableCell>{String(line.vatCode || `${Number(line.vatRate)}%`)}</TableCell> : null}<TableCell className="text-right font-semibold">{formatMoney(line.total, String(record.currency))}</TableCell></> : null}</TableRow>)}</TableBody></Table></div>
    {showsPrices ? <div className="ml-auto grid w-full max-w-sm gap-2 text-sm"><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{formatMoney(record.subtotal, String(record.currency))}</span></div>{documentMode === "tax-invoice" ? <div className="flex justify-between"><span className="text-slate-500">VAT</span><span>{formatMoney(record.vatAmount, String(record.currency))}</span></div> : null}<div className="flex justify-between border-t pt-3 text-lg font-bold"><span>Total</span><span>{formatMoney(record.total, String(record.currency))}</span></div></div> : null}
    {selectedBank ? <div className="rounded-xl border p-4 text-sm"><div className="mb-3 flex items-center gap-2 font-bold" style={{ color: setup.documentColor }}><Landmark className="size-4" />{selectedBank}</div>{setup.bankName && !setup.bankName.toLowerCase().includes(selectedBank.toLowerCase().replace(" bank", "")) ? <p className="text-slate-500">Configure this bank account in Company Setup to show its payment details.</p> : <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2"><p><span className="text-slate-500">Account name:</span> {setup.bankAccountName || brandedName}</p><p><span className="text-slate-500">Account number:</span> {setup.bankAccountNumber || "—"}</p><p><span className="text-slate-500">Currency:</span> {setup.bankCurrency || setup.baseCurrency}</p><p><span className="text-slate-500">IBAN:</span> {setup.bankIban || "—"}</p>{setup.bankSwift ? <p><span className="text-slate-500">SWIFT:</span> {setup.bankSwift}</p> : null}</div>}</div> : null}
    {showStamp && setup.stampData ? <div className="flex justify-end"><Image src={setup.stampData} alt={`${brandedName} company stamp`} width={160} height={120} unoptimized className="max-h-30 w-auto max-w-40 object-contain" /></div> : null}
    {detail.journal.length > 0 && <div className="document-internal-only"><h3 className="mb-2 text-sm font-bold">Accounting entry ({baseCurrency})</h3><div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader><TableBody>{detail.journal.map((line, index) => <TableRow key={index}><TableCell>{String(line.accountName)}</TableCell><TableCell className="text-right">{Number(line.debit) ? formatMoney(line.debit, baseCurrency) : "—"}</TableCell><TableCell className="text-right">{Number(line.credit) ? formatMoney(line.credit, baseCurrency) : "—"}</TableCell></TableRow>)}</TableBody></Table></div></div>}
    {record.memo && <p className="rounded-lg border p-3 text-sm text-slate-600"><strong>Memo:</strong> {String(record.memo)}</p>}
    </div><aside className="document-action-panel space-y-2 rounded-xl border bg-slate-50 p-3 xl:sticky xl:top-0 xl:self-start"><p className="px-2 pb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Document Actions</p>
      <Button type="button" variant="ghost" className={actionClass(false)} onClick={() => window.print()}><Printer className="size-4" />Print</Button>
      <Button type="button" variant="ghost" className={actionClass(false)} onClick={downloadDocument}><Download className="size-4" />Download</Button>
      <Button type="button" variant="ghost" className={actionClass(showStamp)} onClick={() => setup.stampData ? setShowStamp((value) => !value) : toast.error("Add a company stamp in Company Setup first.")}><Stamp className="size-4" />Stamp</Button>
      <Button type="button" variant="ghost" className={actionClass(documentMode === "tax-invoice")} onClick={() => activateDocument("tax-invoice")}>Tax Invoice</Button>
      <Button type="button" variant="ghost" className={actionClass(documentMode === "commercial-invoice")} onClick={() => activateDocument("commercial-invoice")}>Commercial Invoice</Button>
      <Button type="button" variant="ghost" className={actionClass(showBillingName)} onClick={() => setShowBillingName((value) => !value)}>Billing Name</Button>
      <Button type="button" variant="ghost" className={actionClass(showShipping)} onClick={() => setShowShipping((value) => !value)}>Shipping Details</Button>
      <Button type="button" variant="ghost" className={actionClass(showHsCode)} onClick={() => setShowHsCode((value) => !value)}>HS Code &amp; COO</Button>
      <Button type="button" variant="ghost" className={actionClass(showDimensions)} onClick={() => setShowDimensions((value) => !value)}>Dimensions &amp; Weight</Button>
      <Button type="button" variant="ghost" className={actionClass(selectedBank === "Emirates NBD Bank")} onClick={() => setSelectedBank("Emirates NBD Bank")}>Emirates NBD Bank</Button>
      <Button type="button" variant="ghost" className={actionClass(selectedBank === "Habib Bank")} onClick={() => setSelectedBank("Habib Bank")}>Habib Bank</Button>
      <Button type="button" variant="ghost" className={actionClass(documentMode === "delivery-note")} onClick={() => activateDocument("delivery-note")}>Delivery Note</Button>
      <Button type="button" variant="ghost" className={actionClass(documentMode === "packing-list")} onClick={() => activateDocument("packing-list")}>Packing List</Button>
      <Button type="button" variant="ghost" className={actionClass(documentMode === "hs-code-summary")} onClick={() => activateDocument("hs-code-summary")}>HS Code Summary</Button>
    </aside></div>
  </DialogContent></Dialog>;
}

function ReportDialog({ report, companyName, memorised, saving, onMemorise, onClose }: { report: ReportData | null; companyName: string; memorised: boolean; saving: boolean; onMemorise: () => void; onClose: () => void }) {
  if (!report) return null;
  const chartMax = report.chart ? Math.max(1, ...report.rows.flatMap((row) => [Math.abs(Number(row[report.chart!.incomeKey] ?? 0)), Math.abs(Number(row[report.chart!.expenseKey] ?? 0))])) : 1;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
    <DialogHeader><div className="flex flex-col gap-4 pr-8 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold tracking-[.18em] text-emerald-600">{companyName.toUpperCase()}</p><DialogTitle className="mt-2">{report.title}</DialogTitle><DialogDescription>Generated {new Date(report.generatedAt).toLocaleString("en-AE")} · {report.currency} accrual basis</DialogDescription></div><div className="flex flex-wrap gap-2"><Button variant={memorised ? "secondary" : "outline"} onClick={onMemorise} disabled={saving}><BookmarkPlus className="size-4" />{saving ? "Saving…" : memorised ? "Update Memorised" : "Memorise Report"}</Button><Button variant="outline" onClick={() => window.print()}><Printer className="size-4" />Print / PDF</Button></div></div></DialogHeader>
    {report.chart && report.rows.length > 0 && <div className="rounded-xl border bg-slate-50 p-5"><div className="mb-4 flex gap-5 text-xs font-semibold"><span className="flex items-center gap-2"><span className="size-3 rounded-sm bg-emerald-500" />{report.chart.incomeLabel ?? "Income / Assets"}</span><span className="flex items-center gap-2"><span className="size-3 rounded-sm bg-amber-500" />{report.chart.expenseLabel ?? "Expenses / Liabilities"}</span></div><div className="grid min-h-56 grid-cols-6 items-end gap-3 md:grid-cols-12">{report.rows.slice(-12).map((row, index) => <div key={index} className="flex min-w-0 flex-col items-center gap-2"><div className="flex h-44 w-full items-end justify-center gap-1"><div className="w-1/2 rounded-t bg-emerald-500" style={{ height: `${Math.max(2, Math.abs(Number(row[report.chart!.incomeKey] ?? 0)) / chartMax * 100)}%` }} title={formatMoney(row[report.chart!.incomeKey], report.currency)} /><div className="w-1/2 rounded-t bg-amber-500" style={{ height: `${Math.max(2, Math.abs(Number(row[report.chart!.expenseKey] ?? 0)) / chartMax * 100)}%` }} title={formatMoney(row[report.chart!.expenseKey], report.currency)} /></div><span className="max-w-full truncate text-[11px] text-slate-500">{String(row[report.chart!.labelKey] ?? "")}</span></div>)}</div></div>}
    <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow>{report.columns.map((column) => <TableHead key={column.key} className={column.type === "money" ? "text-right" : ""}>{column.label}</TableHead>)}</TableRow></TableHeader><TableBody>{report.rows.length ? report.rows.map((row, index) => <TableRow key={index}>{report.columns.map((column) => <TableCell key={column.key} className={column.type === "money" ? "text-right font-medium" : ""}>{column.type === "money" ? formatMoney(row[column.key], report.currency) : String(row[column.key] ?? "—")}</TableCell>)}</TableRow>) : <EmptyRow text="No posted data is available for this report." columns={report.columns.length} />}</TableBody></Table></div>
  </DialogContent></Dialog>;
}

function CompanySetupCenter({ setup, onSaved }: { setup: CompanySetup; onSaved: (setup: CompanySetup) => void | Promise<void> }) {
  const [form, setForm] = useState<CompanySetup>(setup);
  const [saving, setSaving] = useState(false);
  const templates: Array<{ value: CompanySetup["documentTemplate"]; label: string; detail: string }> = [
    { value: "classic", label: "Classic", detail: "Traditional bordered document" },
    { value: "modern", label: "Modern", detail: "Bold branded header" },
    { value: "minimal", label: "Minimal", detail: "Clean typography and whitespace" },
  ];
  const update = (field: keyof CompanySetup, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const uploadLogo = (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 500_000) return toast.error("Upload a PNG, JPG, or WebP logo smaller than 500 KB.");
    const reader = new FileReader();
    reader.onload = () => update("logoData", String(reader.result ?? ""));
    reader.onerror = () => toast.error("Could not read the selected logo.");
    reader.readAsDataURL(file);
  };
  const uploadStamp = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 500_000) return toast.error("Upload an image stamp smaller than 500 KB.");
    const reader = new FileReader();
    reader.onload = () => update("stampData", String(reader.result ?? ""));
    reader.onerror = () => toast.error("Could not read the selected stamp.");
    reader.readAsDataURL(file);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/company-setup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, companyId: form.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save company setup");
      const saved = data.record as CompanySetup;
      setForm(saved);
      await onSaved(saved);
      toast.success("Company setup saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save company setup"); }
    finally { setSaving(false); }
  };
  return <form onSubmit={save} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
    <div className="space-y-5">
      <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-3"><div className="brand-soft-icon grid size-10 place-items-center rounded-xl"><Building2 className="size-5" /></div><div><h2 className="font-bold">Company identity</h2><p className="text-sm text-slate-500">Used on invoices, bills, statements, and reports.</p></div></div><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2 md:col-span-2"><Label>Company Name *</Label><Input value={form.name} onChange={(event) => update("name", event.target.value)} required maxLength={120} /></div><div className="space-y-2 md:col-span-2"><Label>Company Logo</Label><div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed p-4">{form.logoData ? <Image src={form.logoData} alt="Company logo preview" width={96} height={64} unoptimized className="h-16 w-24 rounded-lg border bg-white object-contain p-1" /> : <div className="grid h-16 w-24 place-items-center rounded-lg bg-slate-100 text-slate-400"><ImageUp className="size-6" /></div>}<div className="flex flex-wrap gap-2"><Label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium hover:bg-slate-50"><ImageUp className="size-4" />Choose logo<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => uploadLogo(event.target.files?.[0])} /></Label>{form.logoData ? <Button type="button" variant="outline" onClick={() => update("logoData", "")}>Remove</Button> : null}</div></div><p className="text-xs text-slate-500">PNG, JPG, or WebP · maximum 500 KB</p></div><div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} maxLength={160} placeholder="accounts@company.com" /></div><div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(event) => update("phone", event.target.value)} maxLength={40} placeholder="+971 ..." /></div><div className="space-y-2 md:col-span-2"><Label>Address Line 1</Label><Input value={form.addressLine1} onChange={(event) => update("addressLine1", event.target.value)} maxLength={180} placeholder="Building, street, area" /></div><div className="space-y-2 md:col-span-2"><Label>Address Line 2</Label><Input value={form.addressLine2} onChange={(event) => update("addressLine2", event.target.value)} maxLength={180} placeholder="Office, warehouse, free zone" /></div><div className="space-y-2"><Label>City</Label><Input value={form.city} onChange={(event) => update("city", event.target.value)} maxLength={80} placeholder="Dubai" /></div><div className="space-y-2"><Label>Country</Label><Input value={form.country} onChange={(event) => update("country", event.target.value)} maxLength={80} /></div><div className="space-y-2 md:col-span-2"><Label>VAT Registration Number / TRN</Label><Input value={form.trn} onChange={(event) => update("trn", event.target.value)} maxLength={40} /></div></div></section>
      <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-violet-100 text-violet-700"><Stamp className="size-5" /></div><div><h2 className="font-bold">Company stamp</h2><p className="text-sm text-slate-500">Displayed at the bottom of invoices and other documents.</p></div></div><div className="flex flex-wrap items-center gap-5 rounded-xl border border-dashed p-4">{form.stampData ? <Image src={form.stampData} alt="Company stamp preview" width={144} height={104} unoptimized className="h-26 w-36 rounded-lg bg-white object-contain p-1" /> : <div className="grid h-26 w-36 place-items-center rounded-lg bg-slate-100 text-slate-400"><Stamp className="size-8" /></div>}<div><div className="flex flex-wrap gap-2"><Label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium hover:bg-slate-50"><ImageUp className="size-4" />Choose stamp<input type="file" accept="image/*" className="sr-only" onChange={(event) => uploadStamp(event.target.files?.[0])} /></Label>{form.stampData ? <Button type="button" variant="outline" onClick={() => update("stampData", "")}>Remove</Button> : null}</div><p className="mt-2 text-xs text-slate-500">Any image format · maximum 500 KB</p></div></div></section>
      <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-sky-100 text-sky-700"><Landmark className="size-5" /></div><div><h2 className="font-bold">Bank account</h2><p className="text-sm text-slate-500">Displayed on customer documents for payment.</p></div></div><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Bank Name</Label><Input value={form.bankName} onChange={(event) => update("bankName", event.target.value)} maxLength={120} /></div><div className="space-y-2"><Label>Account Name</Label><Input value={form.bankAccountName} onChange={(event) => update("bankAccountName", event.target.value)} maxLength={120} /></div><div className="space-y-2"><Label>Account Number</Label><Input value={form.bankAccountNumber} onChange={(event) => update("bankAccountNumber", event.target.value)} maxLength={80} /></div><div className="space-y-2"><Label>Account Currency</Label><Select value={form.bankCurrency || form.baseCurrency} onValueChange={(value) => update("bankCurrency", value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{currencies.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>IBAN</Label><Input value={form.bankIban} onChange={(event) => update("bankIban", event.target.value.toUpperCase())} maxLength={80} /></div><div className="space-y-2"><Label>SWIFT / BIC</Label><Input value={form.bankSwift} onChange={(event) => update("bankSwift", event.target.value.toUpperCase())} maxLength={30} /></div></div></section>
    </div>
    <div className="space-y-5"><section className="sticky top-24 rounded-xl border bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-3"><div className="brand-soft-icon grid size-10 place-items-center rounded-xl"><Palette className="size-5" /></div><div><h2 className="font-bold">Document design</h2><p className="text-sm text-slate-500">Choose the invoice and bill layout.</p></div></div><div className="grid gap-2">{templates.map((template) => <button type="button" key={template.value} onClick={() => setForm((current) => ({ ...current, documentTemplate: template.value }))} className={`rounded-xl border-2 p-3 text-left transition ${form.documentTemplate === template.value ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300"}`}><div className="flex items-center justify-between"><span className="font-semibold">{template.label}</span>{form.documentTemplate === template.value ? <CheckCircle2 className="size-5 text-emerald-600" /> : null}</div><p className="mt-1 text-xs text-slate-500">{template.detail}</p></button>)}</div><div className="mt-4 space-y-2"><Label>Brand Color</Label><div className="flex gap-2"><Input type="color" value={form.documentColor} onChange={(event) => update("documentColor", event.target.value)} className="w-14 p-1" /><Input value={form.documentColor} onChange={(event) => update("documentColor", event.target.value)} maxLength={7} /></div></div><div className={`mt-5 overflow-hidden rounded-xl border bg-white ${form.documentTemplate === "minimal" ? "border-slate-200" : "shadow-sm"}`}><div className={form.documentTemplate === "modern" ? "p-4 text-white" : "border-b-4 p-4"} style={form.documentTemplate === "modern" ? { backgroundColor: form.documentColor } : { borderColor: form.documentColor }}><div className="flex items-center gap-3">{form.logoData ? <Image src={form.logoData} alt="Document logo" width={64} height={40} unoptimized className="h-10 w-16 rounded bg-white object-contain p-1" /> : null}<div><p className="font-bold">{form.name || "Company Name"}</p><p className={`text-xs ${form.documentTemplate === "modern" ? "text-white/80" : "text-slate-500"}`}>{form.city || "City"} · {form.country || "Country"}</p></div></div></div><div className="space-y-3 p-4"><div className="flex justify-between"><div><p className="text-xs text-slate-500">INVOICE</p><p className="font-bold">INV-0001</p></div><div className="text-right text-xs text-slate-500">Customer Name<br />Invoice date</div></div><div className="h-16 rounded bg-slate-100" /><div className="ml-auto h-14 w-1/2 rounded bg-slate-100" /></div></div><Button type="submit" disabled={saving || !form.id} className="brand-primary-button mt-5 w-full">{saving ? "Saving…" : "Save Company Setup"}</Button></section></div>
  </form>;
}

function AdminSettingsCenter({ companyId, companyName, currentUserEmail }: { companyId: number; companyName: string; currentUserEmail: string }) {
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin-settings?companyId=${companyId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load admin controls");
        if (active) setConfigured(Boolean(data.configured));
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "Could not load admin controls");
      } finally {
        if (active) setLoading(false);
      }
    }
    if (companyId) loadSettings();
    return () => { active = false; };
  }, [companyId]);

  async function savePin(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{4,12}$/.test(newPin)) return toast.error("The new PIN must contain 4 to 12 numbers.");
    if (newPin !== confirmPin) return toast.error("The new PIN and confirmation do not match.");
    setSaving(true);
    try {
      const response = await fetch("/api/admin-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, currentPin, newPin }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the admin PIN");
      setConfigured(true);
      setCurrentPin(""); setNewPin(""); setConfirmPin("");
      toast.success("Admin PIN saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the admin PIN");
    } finally { setSaving(false); }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 12) return toast.error("The new password must contain at least 12 characters.");
    if (newPassword !== confirmPassword) return toast.error("The new password and confirmation do not match.");
    setPasswordSaving(true);
    try {
      const response = await fetch("/api/auth/session", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not change the password");
      toast.success("Password changed. Sign in again.");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not change the password"); setPasswordSaving(false); }
  }

  return <div className="space-y-5"><div className="grid gap-5 xl:grid-cols-[1fr_420px]">
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b p-5"><div><h2 className="font-bold">Restricted stock operations</h2><p className="mt-1 text-sm text-slate-500">Security controls apply separately to {companyName}.</p></div><Badge className={configured ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-900 hover:bg-amber-100"}>{loading ? "Checking…" : configured ? "PIN configured" : "Setup required"}</Badge></div>
      <div className="p-5"><div className="flex gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="grid size-11 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-800"><ShieldCheck className="size-6" /></div><div><h3 className="font-semibold text-amber-950">Negative-stock invoice override</h3><p className="mt-1 text-sm leading-6 text-amber-900">Invoices and sales receipts are blocked when stock is insufficient. A company admin can enter this PIN on the document to approve an exception.</p><p className="mt-2 text-sm font-medium text-amber-950">Every override is recorded in the audit log.</p></div></div></div>
    </section>
    <div className="space-y-5"><form onSubmit={savePin} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-700"><KeyRound className="size-5" /></div><div><h2 className="font-bold">{configured ? "Change admin PIN" : "Set admin PIN"}</h2><p className="text-sm text-slate-500">Use 4 to 12 numbers.</p></div></div>
      {configured && <div className="space-y-2"><Label htmlFor="currentAdminPin">Current PIN</Label><Input id="currentAdminPin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{4,12}" value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 12))} required placeholder="Enter current PIN" /></div>}
      <div className="space-y-2"><Label htmlFor="newAdminPin">New PIN</Label><Input id="newAdminPin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,12}" value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 12))} required placeholder="Enter new PIN" /></div>
      <div className="space-y-2"><Label htmlFor="confirmAdminPin">Confirm new PIN</Label><Input id="confirmAdminPin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,12}" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 12))} required placeholder="Re-enter new PIN" /></div>
      <Button type="submit" disabled={loading || saving || !companyId} className="w-full bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400">{saving ? "Saving…" : configured ? "Change admin PIN" : "Set admin PIN"}</Button>
      <p className="text-sm leading-5 text-slate-500">The PIN is securely hashed before storage and is never displayed. Only authorized company administrators should change it.</p>
    </form>
    <form onSubmit={savePassword} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><ShieldCheck className="size-5" /></div><div><h2 className="font-bold">Change login password</h2><p className="text-sm text-slate-500">{currentUserEmail}</p></div></div>
      <div className="space-y-2"><Label htmlFor="currentLoginPassword">Current password</Label><Input id="currentLoginPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></div>
      <div className="space-y-2"><Label htmlFor="newLoginPassword">New password</Label><Input id="newLoginPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></div>
      <div className="space-y-2"><Label htmlFor="confirmLoginPassword">Confirm new password</Label><Input id="confirmLoginPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></div>
      <Button type="submit" disabled={passwordSaving} className="w-full">{passwordSaving ? "Changing…" : "Change login password"}</Button>
      <p className="text-sm leading-5 text-slate-500">Changing the password signs out every active session.</p>
    </form></div>
  </div><UserRoleCenter /></div>;
}

function WorkspaceCenter({ mode, companies, activeCompanyId, onChanged }: { mode: "companies" | "inventories" | "invoice-series" | "currencies"; companies: CompanyWorkspace[]; activeCompanyId: number; onChanged: () => Promise<void> }) {
  const activeCompany = companies.find((company) => company.id === activeCompanyId);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [currency, setCurrency] = useState(activeCompany?.baseCurrency ?? "AED");
  const [editingSeries, setEditingSeries] = useState<InventoryLocation | null>(null);
  const [seriesPrefix, setSeriesPrefix] = useState("");
  const [seriesNextNumber, setSeriesNextNumber] = useState("1");
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCurrency(activeCompany?.baseCurrency ?? "AED"); }, [activeCompany]);
  const save = async (method: "POST" | "PATCH", payload: Record<string, string | number>) => {
    setSaving(true);
    try {
      const response = await fetch("/api/workspaces", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save");
      await onChanged(); setName(""); setCode("");
      if (payload.type === "invoiceSeries") setEditingSeries(null);
      toast.success(payload.type === "invoiceSeries" ? "Invoice series updated" : mode === "companies" ? "Company added" : mode === "inventories" ? "Inventory added" : "Base currency updated");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save"); }
    finally { setSaving(false); }
  };
  const openSeriesEditor = (location: InventoryLocation) => {
    setEditingSeries(location);
    setSeriesPrefix(location.invoicePrefix);
    setSeriesNextNumber(String(location.nextInvoiceNumber));
  };
  const seriesEditor = <Dialog open={Boolean(editingSeries)} onOpenChange={(open) => { if (!open) setEditingSeries(null); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Customize invoice series</DialogTitle><DialogDescription>Set the prefix and next invoice number for {editingSeries?.name}. This affects only this company inventory.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!editingSeries) return; save("PATCH", { type: "invoiceSeries", companyId: activeCompanyId, locationId: editingSeries.id, invoicePrefix: seriesPrefix, nextInvoiceNumber: Number(seriesNextNumber) }); }}><div className="space-y-2"><Label>Invoice series prefix</Label><Input value={seriesPrefix} onChange={(event) => setSeriesPrefix(event.target.value.toUpperCase())} required maxLength={20} placeholder="JAFZA" /><p className="text-xs text-slate-500">Letters, numbers, hyphens and slashes are allowed.</p></div><div className="space-y-2"><Label>Next invoice number</Label><Input type="number" min="1" max="999999999" step="1" value={seriesNextNumber} onChange={(event) => setSeriesNextNumber(event.target.value)} required /></div><div className="rounded-lg border bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">Preview</p><p className="mt-1 font-mono text-sm font-semibold text-emerald-700">C{String(activeCompanyId).padStart(3, "0")}-{seriesPrefix || "PREFIX"}-INV-{String(Math.max(1, Number(seriesNextNumber) || 1)).padStart(4, "0")}</p></div><DialogFooter><Button type="button" variant="outline" onClick={() => setEditingSeries(null)}>Cancel</Button><Button type="submit" disabled={saving}>Save series</Button></DialogFooter></form></DialogContent></Dialog>;
  if (mode === "companies") return <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><section className="rounded-xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-bold">Company files</h2><p className="text-sm text-slate-500">Each company has separate customers, accounts, transactions and inventory.</p></div><div className="grid gap-3 p-5 md:grid-cols-2">{companies.map((company) => <article key={company.id} className={`rounded-xl border p-4 ${company.id === activeCompanyId ? "border-emerald-300 bg-emerald-50/50" : ""}`}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{company.name}</h3><p className="mt-1 text-sm text-slate-500">{company.locations.length} {company.locations.length === 1 ? "inventory" : "inventories"}</p></div><Badge variant="outline">{company.baseCurrency}</Badge></div>{company.id === activeCompanyId && <p className="mt-3 text-xs font-semibold text-emerald-700">Currently selected</p>}</article>)}</div></section><form className="space-y-4 rounded-xl border bg-white p-5 shadow-sm" onSubmit={(event) => { event.preventDefault(); save("POST", { type: "company", name, baseCurrency: currency }); }}><div><h2 className="font-bold">Add company</h2><p className="text-sm text-slate-500">A Main Inventory is included.</p></div><div className="space-y-2"><Label>Company name</Label><Input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Company name" /></div><div className="space-y-2"><Label>Base currency</Label><Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{currencies.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><Button disabled={saving} className="w-full"><Plus className="size-4" />Add company</Button></form></div>;
  if (mode === "inventories") return <>
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><section className="rounded-xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-bold">{activeCompany?.name} inventories</h2><p className="text-sm text-slate-500">Each inventory has separate stock, Accounts Receivable and Accounts Payable balances.</p></div><div className="grid gap-3 p-5 md:grid-cols-2">{activeCompany?.locations.map((location) => <article key={location.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><PackageSearch className="size-5 text-emerald-600" /><Button type="button" variant="outline" size="sm" onClick={() => openSeriesEditor(location)}><Pencil className="size-3" />Edit series</Button></div><h3 className="mt-3 font-semibold">{location.name}</h3><p className="mt-1 font-mono text-xs text-slate-500">{location.code}</p><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-lg bg-sky-50 p-3"><p className="text-xs font-medium text-sky-700">Receivable</p><p className="mt-1 text-sm font-bold text-sky-950">{formatMoney(location.receivable, activeCompany?.baseCurrency)}</p></div><div className="rounded-lg bg-amber-50 p-3"><p className="text-xs font-medium text-amber-700">Payable</p><p className="mt-1 text-sm font-bold text-amber-950">{formatMoney(location.payable, activeCompany?.baseCurrency)}</p></div></div><p className="mt-3 text-xs font-medium text-slate-500">Next invoice</p><p className="mt-1 font-mono text-sm text-emerald-700">{invoiceNumberPreview(activeCompanyId, location)}</p></article>)}</div></section><form className="space-y-4 rounded-xl border bg-white p-5 shadow-sm" onSubmit={(event) => { event.preventDefault(); save("POST", { type: "location", companyId: activeCompanyId, name, code }); }}><div><h2 className="font-bold">Add inventory</h2><p className="text-sm text-slate-500">Warehouse, showroom or store. Its code becomes part of the invoice series.</p></div><div className="space-y-2"><Label>Inventory name</Label><Input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Jebel Ali Warehouse" /></div><div className="space-y-2"><Label>Code / invoice prefix</Label><Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} required placeholder="JAFZA" /></div><Button disabled={saving || !activeCompanyId} className="w-full"><Plus className="size-4" />Add inventory</Button></form></div>
    {seriesEditor}
  </>;
  if (mode === "invoice-series") return <><section className="rounded-xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-bold">{activeCompany?.name} invoice series</h2><p className="text-sm text-slate-500">Every inventory has an independent prefix and next invoice number.</p></div><div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">{activeCompany?.locations.map((location) => <article key={location.id} className="rounded-xl border p-5"><div className="flex items-start justify-between gap-3"><div className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><ReceiptText className="size-5" /></div><Badge variant="outline">{location.code}</Badge></div><h3 className="mt-4 font-semibold">{location.name}</h3><p className="mt-1 text-sm text-slate-500">Next invoice</p><p className="mt-2 break-all font-mono text-base font-semibold text-emerald-700">{invoiceNumberPreview(activeCompanyId, location)}</p><Button type="button" className="mt-5 w-full" variant="outline" onClick={() => openSeriesEditor(location)}><Pencil className="size-4" />Customize series</Button></article>)}</div></section>{seriesEditor}</>;
  return <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><section className="rounded-xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-bold">Available transaction currencies</h2><p className="text-sm text-slate-500">Use any supported currency on invoices, bills and other transactions.</p></div><div className="flex flex-wrap gap-2 p-5">{currencies.map((value) => <Badge key={value} variant={value === activeCompany?.baseCurrency ? "default" : "outline"} className="px-3 py-1.5">{value}{value === activeCompany?.baseCurrency ? " · Base" : ""}</Badge>)}</div></section><form className="space-y-4 rounded-xl border bg-white p-5 shadow-sm" onSubmit={(event) => { event.preventDefault(); save("PATCH", { companyId: activeCompanyId, baseCurrency: currency }); }}><div><h2 className="font-bold">Company base currency</h2><p className="text-sm text-slate-500">Reports and accounting entries use this currency.</p></div><div className="space-y-2"><Label>{activeCompany?.name}</Label><Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{currencies.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><Button disabled={saving || !activeCompanyId} className="w-full">Save currency</Button></form></div>;
}

function WorkspaceDialog({ open, companies, activeCompanyId, onClose, onChanged }: { open: boolean; companies: CompanyWorkspace[]; activeCompanyId: number; onClose: () => void; onChanged: () => Promise<void> }) {
  const [companyName, setCompanyName] = useState("");
  const [companyCurrency, setCompanyCurrency] = useState("AED");
  const [locationName, setLocationName] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (payload: Record<string, string | number>) => {
    setSaving(true);
    try {
      const response = await fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save");
      await onChanged();
      setCompanyName(""); setLocationName(""); setLocationCode("");
      toast.success(payload.type === "company" ? "Company added" : "Inventory location added");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save"); }
    finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>Companies & inventory</DialogTitle><DialogDescription>Add separate company files and stock locations. Each company keeps its own records and base currency.</DialogDescription></DialogHeader>
    <div className="grid gap-5 md:grid-cols-2">
      <form className="space-y-4 rounded-xl border p-4" onSubmit={(event) => { event.preventDefault(); submit({ type: "company", name: companyName, baseCurrency: companyCurrency }); }}><div><h3 className="font-semibold">Add company</h3><p className="text-xs text-slate-500">A Main Inventory and standard accounts are created automatically.</p></div><div className="space-y-2"><Label>Company name</Label><Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required placeholder="Company name" /></div><div className="space-y-2"><Label>Base currency</Label><Select value={companyCurrency} onValueChange={setCompanyCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{currencies.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></div><Button type="submit" disabled={saving} className="w-full"><Plus className="size-4" />Add company</Button></form>
      <form className="space-y-4 rounded-xl border p-4" onSubmit={(event) => { event.preventDefault(); submit({ type: "location", companyId: activeCompanyId, name: locationName, code: locationCode }); }}><div><h3 className="font-semibold">Add inventory location</h3><p className="text-xs text-slate-500">Add a warehouse, showroom or store to the selected company.</p></div><div className="space-y-2"><Label>Location name</Label><Input value={locationName} onChange={(event) => setLocationName(event.target.value)} required placeholder="Jebel Ali Warehouse" /></div><div className="space-y-2"><Label>Location code</Label><Input value={locationCode} onChange={(event) => setLocationCode(event.target.value.toUpperCase())} required placeholder="JAFZA" /></div><Button type="submit" disabled={saving || !activeCompanyId} variant="outline" className="w-full"><Plus className="size-4" />Add inventory</Button></form>
    </div>
    <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">{companies.map((company) => <div key={company.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm"><div><strong>{company.name}</strong><p className="text-xs text-slate-500">{company.locations.map((location) => `${location.name} (${location.code})`).join(" · ")}</p></div><Badge variant="outline">{company.baseCurrency}</Badge></div>)}</div>
    <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Done</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function Field({ label, name, form, setForm, type = "text", required = false, placeholder }: { label: string; name: string; form: Record<string, string>; setForm: (f: Record<string, string>) => void; type?: string; required?: boolean; placeholder?: string }) { return <div className="space-y-2"><Label htmlFor={name}>{label}{required ? " *" : ""}</Label><Input id={name} name={name} type={type} required={required} placeholder={placeholder} value={form[name] ?? ""} onChange={(e) => setForm({ ...form, [name]: e.target.value })} /></div>; }
function Choice({ label, name, values, form, setForm, placeholder }: { label: string; name: string; values: string[]; form: Record<string, string>; setForm: (f: Record<string, string>) => void; placeholder?: string }) { return <div className="space-y-2"><Label>{label}</Label><Select value={form[name]} onValueChange={(value) => setForm({ ...form, [name]: value })}><SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{values.map((value) => <SelectItem key={value} value={value}><span className="capitalize">{value}</span></SelectItem>)}</SelectContent></Select></div>; }
function CurrencyExchangeChoice({ form, setForm, exchangeRates, baseCurrency }: { form: Record<string, string>; setForm: (form: Record<string, string>) => void; exchangeRates: ExchangeRateRecord[]; baseCurrency: string }) {
  const selectedRate = exchangeRates.find((rate) => rate.currencyCode === form.currency)?.rate;
  return <div className="space-y-2"><Label>Currency *</Label><Select value={form.currency} onValueChange={(currency) => { const savedRate = exchangeRates.find((entry) => entry.currencyCode === currency)?.rate; setForm({ ...form, currency, exchangeRate: currency === baseCurrency ? "1" : savedRate ? String(savedRate) : "" }); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{currencies.map((currency) => <SelectItem key={currency} value={currency}><span className="flex w-full items-center justify-between gap-3"><span>{currency}</span><span className="text-xs text-slate-500">{currency === baseCurrency ? "Base · 1.000000" : exchangeRates.find((entry) => entry.currencyCode === currency)?.rate ? `Rate ${exchangeRates.find((entry) => entry.currencyCode === currency)?.rate}` : "Rate not set"}</span></span></SelectItem>)}</SelectContent></Select>{form.currency !== baseCurrency && selectedRate ? <p className="text-xs text-emerald-700">Saved rate applied: 1 {form.currency} = {selectedRate} {baseCurrency}</p> : form.currency !== baseCurrency ? <p className="text-xs text-amber-700">No saved rate. Enter the document rate manually.</p> : null}</div>;
}
function BillFields({ form, setForm, items, vendors, salesmen, accounts, locations, lines, setLines, vatCodeOptions, exchangeRates, baseCurrency }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void; items: DataRecord[]; vendors: DataRecord[]; salesmen: DataRecord[]; accounts: DataRecord[]; locations: InventoryLocation[]; lines: LineForm[]; setLines: (lines: LineForm[]) => void; vatCodeOptions: VatCodeOption[]; exchangeRates: ExchangeRateRecord[]; baseCurrency: string }) {
  const update = (index: number, changes: Partial<LineForm>) => setLines(lines.map((line, position) => position === index ? { ...line, ...changes } : line));
  const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
  const vat = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(line.vatRate || 0) / 100, 0);
  const freightCharges = Math.max(0, Number(form.freightCharges || 0));
  const totalQuantity = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const freightVat = freightCharges * (form.isImport === "true" ? 0.05 : 0);
  const totalVat = vat + freightVat;
  const total = subtotal + freightCharges + totalVat;
  const purchaseAccounts = accounts.filter((account) => account.active && ["PURCHASES", "EXPENSE", "COGS"].includes(String(account.systemRole)));
  return <div className="space-y-5">
    <div className="grid gap-4 rounded-xl border bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-6">
      <div className="space-y-2"><Label>Salesman Name</Label><Select value={form.salesman || undefined} onValueChange={(value) => setForm({ ...form, salesman: value })}><SelectTrigger className="w-full"><SelectValue placeholder="Select salesman" /></SelectTrigger><SelectContent>{salesmen.length ? salesmen.map((salesman) => <SelectItem key={salesman.id} value={String(salesman.name)}>{String(salesman.name)}</SelectItem>) : <SelectItem value="no-salesmen" disabled>No salesmen available</SelectItem>}</SelectContent></Select></div>
      <Field label="Reference No." name="number" form={form} setForm={setForm} required placeholder="Enter reference no." />
      <div className="space-y-2"><Label>Inventory *</Label><Select value={form.billLocationId || String(locations[0]?.id ?? "")} onValueChange={(value) => setForm({ ...form, billLocationId: value })}><SelectTrigger className="w-full"><SelectValue placeholder="Select inventory" /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Import</Label><Select value={form.isImport ?? "false"} onValueChange={(value) => { const vatRate = value === "true" ? "5" : "0"; const vatCode = value === "true" ? "STANDARD" : "ZERO"; setForm({ ...form, isImport: value, vatRate }); setLines(lines.map((line) => ({ ...line, vatCode, vatRate }))); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Yes — 5% VAT</SelectItem><SelectItem value="false">No — 0% VAT</SelectItem></SelectContent></Select></div>
      <CurrencyExchangeChoice form={form} setForm={setForm} exchangeRates={exchangeRates} baseCurrency={baseCurrency} />
      <Field label={`Exchange Rate to ${baseCurrency}`} name="exchangeRate" type="number" form={form} setForm={setForm} required placeholder="1.000000" />
    </div>
    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-2"><Label>Vendor *</Label><Select value={form.party} onValueChange={(value) => { const vendor = vendors.find((entry) => String(entry.name) === value); const currency = String(vendor?.currency || form.currency); const savedRate = exchangeRates.find((entry) => entry.currencyCode === currency)?.rate; setForm({ ...form, party: value, currency, exchangeRate: currency === baseCurrency ? "1" : savedRate ? String(savedRate) : "" }); }}><SelectTrigger className="w-full"><SelectValue placeholder="Select vendor" /></SelectTrigger><SelectContent>{vendors.length ? vendors.map((vendor) => <SelectItem key={vendor.id} value={String(vendor.name)}>{String(vendor.company || vendor.name)} · {String(vendor.currency)}</SelectItem>) : <SelectItem value="no-vendors" disabled>No vendors available</SelectItem>}</SelectContent></Select></div>
      <Field label="Date" name="transactionDate" type="date" form={form} setForm={setForm} required />
      <div className="space-y-2"><Label>Purchase account *</Label><Select value={form.account} onValueChange={(account) => setForm({ ...form, account })}><SelectTrigger className="w-full"><SelectValue placeholder="Select linked account" /></SelectTrigger><SelectContent>{purchaseAccounts.map((account) => <SelectItem key={account.id} value={String(account.name)}>{String(account.name)}</SelectItem>)}</SelectContent></Select></div>
    </div>
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="hidden grid-cols-[minmax(260px,1fr)_90px_130px_130px_170px_48px] gap-2 border-b bg-slate-100 px-3 py-3 text-sm font-bold text-slate-700 md:grid"><span>Description</span><span>QTY</span><span>Rate</span><span>Subtotal</span><span>VAT code</span><span /></div>
      <div className="divide-y">{lines.map((line, index) => {
        const lineSubtotal = Number(line.quantity || 0) * Number(line.unitPrice || 0);
        const selectedItem = items.find((entry) => String(entry.id) === line.itemId);
        return <div key={index} className="grid gap-2 p-3 md:grid-cols-[minmax(260px,1fr)_90px_130px_130px_170px_48px]">
          <div className="space-y-2"><Label className="md:hidden">Description</Label><Select value={line.itemId || "custom"} onValueChange={(value) => { const item = items.find((entry) => String(entry.id) === value); const lastPrice = Number(item?.lastPurchasePrice ?? item?.cost ?? 0); update(index, value === "custom" ? { itemId: "", description: "" } : { itemId: value, description: String(item?.name ?? ""), unitPrice: String(lastPrice), unitCost: String(lastPrice) }); }}><SelectTrigger className="w-full"><SelectValue placeholder="Select item" /></SelectTrigger><SelectContent><SelectItem value="custom">Custom description</SelectItem>{items.map((item) => <SelectItem key={item.id} value={String(item.id)}>{String(item.sku)} · {String(item.name)} · Last {Number(item.lastPurchasePrice ?? item.cost ?? 0).toFixed(2)}</SelectItem>)}</SelectContent></Select>{selectedItem && <p className="text-xs font-medium text-sky-700">Last purchase price: {formatMoney(selectedItem.lastPurchasePrice ?? selectedItem.cost, form.currency)}</p>}{!line.itemId && <Input placeholder="Enter description" required value={line.description} onChange={(event) => update(index, { description: event.target.value })} />}</div>
          <div className="space-y-2"><Label className="md:hidden">QTY</Label><Input aria-label="Quantity" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => update(index, { quantity: event.target.value })} /></div>
          <div className="space-y-2"><Label className="md:hidden">Rate</Label><Input aria-label="Rate" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => update(index, { unitPrice: event.target.value, unitCost: event.target.value })} /></div>
          <div className="space-y-2"><Label className="md:hidden">Subtotal</Label><Input aria-label="Subtotal" readOnly value={lineSubtotal.toFixed(2)} className="bg-slate-50 font-semibold" /></div>
          <div className="space-y-2"><Label className="md:hidden">VAT code</Label><Select value={line.vatCode} onValueChange={(vatCode) => update(index, { vatCode, vatRate: vatRateForCode(vatCode, vatCodeOptions) })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{vatCodeOptions.map((option) => <SelectItem key={option.code} value={option.code}><span className="flex flex-col"><span>{option.label}</span>{option.description ? <span className="text-xs text-slate-500">{option.description}</span> : null}</span></SelectItem>)}</SelectContent></Select></div>
          <Button type="button" variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, position) => position !== index))} className="text-slate-400 hover:text-rose-600"><Trash2 className="size-4" /></Button>
        </div>;
      })}</div>
      <div className="flex justify-end border-t bg-slate-50 p-3"><Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, { itemId: "", description: "", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: form.isImport === "true" ? "STANDARD" : "ZERO", vatRate: form.isImport === "true" ? "5" : "0" }])}><Plus className="size-4" />Add line</Button></div>
    </div>
    <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
      <div />
      <div className="space-y-4 rounded-xl border bg-slate-50 p-4">
        <Field label="Freight Charges" name="freightCharges" type="number" form={form} setForm={setForm} placeholder="0.00" />
        <div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Total quantity</span><strong>{totalQuantity.toLocaleString()}</strong></div><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><strong>{formatMoney(subtotal + freightCharges, form.currency)}</strong></div><div className="flex justify-between"><span className="text-slate-500">VAT ({form.isImport === "true" ? "5" : "0"}%)</span><strong>{formatMoney(totalVat, form.currency)}</strong></div><div className="flex justify-between border-t pt-3 text-lg"><span className="font-bold">Total</span><strong>{formatMoney(total, form.currency)}</strong></div></div>
      </div>
    </div>
  </div>;
}
function CashTransactionFields({ form, setForm, contacts, accounts, locations, lines, setLines, vatCodeOptions, exchangeRates, baseCurrency }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void; contacts: DataRecord[]; accounts: DataRecord[]; locations: InventoryLocation[]; lines: LineForm[]; setLines: (lines: LineForm[]) => void; vatCodeOptions: VatCodeOption[]; exchangeRates: ExchangeRateRecord[]; baseCurrency: string }) {
  const receivePayment = form.type === "customer payment";
  const payBill = form.type === "bill payment";
  const parties = contacts.filter((contact) => contact.type === (receivePayment ? "customer" : "vendor"));
  const line = lines[0] ?? { itemId: "", description: receivePayment ? "Payment received" : "Cheque payment", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: "ZERO", vatRate: "0" };
  const updateLine = (changes: Partial<LineForm>) => setLines([{ ...line, ...changes }]);
  const amount = Number(line.unitPrice || 0);
  const vat = amount * Number(line.vatRate || 0) / 100;
  const bankName = linkedAccountName(accounts, "BANK", "Business Bank");
  const apName = linkedAccountName(accounts, "AP", "Accounts Payable", form.currency);
  const chequeAccounts = accounts.filter((account) => account.active && (["EXPENSE", "PURCHASES"].includes(String(account.systemRole)) || (account.systemRole === "AP" && String(account.currency) === form.currency)));
  const isAccountsPayable = form.account === apName;
  return <div className="space-y-5">
    <div className="grid gap-4 rounded-xl border bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-3">
      <div className="space-y-2"><Label>{receivePayment ? "Customer" : "Vendor / Payee"} *</Label><Select value={form.party || undefined} onValueChange={(value) => { const party = parties.find((entry) => String(entry.name) === value); const currency = String(party?.currency || form.currency); const savedRate = exchangeRates.find((entry) => entry.currencyCode === currency)?.rate; setForm({ ...form, party: value, currency, exchangeRate: currency === baseCurrency ? "1" : savedRate ? String(savedRate) : "", ...(receivePayment ? {} : { account: linkedAccountName(accounts, "AP", "Accounts Payable", currency) }) }); }}><SelectTrigger className="w-full"><SelectValue placeholder={receivePayment ? "Select customer" : "Select vendor"} /></SelectTrigger><SelectContent>{parties.length ? parties.map((party) => <SelectItem key={party.id} value={String(party.name)}>{String(party.company || party.name)} · {String(party.currency)}</SelectItem>) : <SelectItem value="no-parties" disabled>No {receivePayment ? "customers" : "vendors"} available</SelectItem>}</SelectContent></Select></div>
      <Field label={receivePayment ? "Payment Reference" : payBill ? "Bill Payment Reference" : "Cheque Number"} name="number" form={form} setForm={setForm} required placeholder={receivePayment ? "Enter payment reference" : payBill ? "Enter bill payment reference" : "Enter cheque number"} />
      <Field label={payBill ? "Payment Date" : receivePayment ? "Payment Date" : "Cheque Date"} name="transactionDate" type="date" form={form} setForm={setForm} required />
      <div className="space-y-2"><Label>Inventory *</Label><Select value={form.transactionLocationId || String(locations[0]?.id ?? "")} onValueChange={(value) => setForm({ ...form, transactionLocationId: value })}><SelectTrigger className="w-full"><SelectValue placeholder="Select inventory" /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}</SelectContent></Select></div>
      <CurrencyExchangeChoice form={form} setForm={setForm} exchangeRates={exchangeRates} baseCurrency={baseCurrency} />
      <Field label={`Exchange rate to ${baseCurrency}`} name="exchangeRate" type="number" form={form} setForm={setForm} required />
      {receivePayment ? <div className="space-y-2"><Label>Deposit To</Label><Input readOnly value={bankName} className="bg-slate-100" /></div> : payBill ? <div className="space-y-2"><Label>Pay From</Label><Input readOnly value={bankName} className="bg-slate-100" /></div> : <div className="space-y-2"><Label>Posting account</Label><Select value={form.account || apName} onValueChange={(value) => { const isPayable = value === apName; setForm({ ...form, account: value, ...(isPayable ? { vatRate: "0" } : {}) }); if (isPayable) updateLine({ vatCode: "ZERO", vatRate: "0" }); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{chequeAccounts.map((account) => <SelectItem key={account.id} value={String(account.name)}>{String(account.name)}</SelectItem>)}</SelectContent></Select></div>}
    </div>
    <div className="grid gap-4 rounded-xl border bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-2"><Label>Amount *</Label><Input type="number" min="0.01" step="0.01" value={line.unitPrice} onChange={(event) => updateLine({ unitPrice: event.target.value, unitCost: event.target.value })} required /></div>
      {receivePayment || payBill || isAccountsPayable ? <div className="space-y-2"><Label>VAT code</Label><Input readOnly value={vatCodeOptions.find((option) => option.code === "ZERO")?.label ?? "ZERO · 0%"} className="bg-slate-100" /></div> : <div className="space-y-2"><Label>VAT code</Label><Select value={line.vatCode} onValueChange={(vatCode) => { const vatRate = vatRateForCode(vatCode, vatCodeOptions); updateLine({ vatCode, vatRate }); setForm({ ...form, vatRate }); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{vatCodeOptions.map((option) => <SelectItem key={option.code} value={option.code}><span className="flex flex-col"><span>{option.label}</span>{option.description ? <span className="text-xs text-slate-500">{option.description}</span> : null}</span></SelectItem>)}</SelectContent></Select></div>}
      <div className="space-y-2"><Label>VAT Amount</Label><Input readOnly value={formatMoney(vat, form.currency)} className="bg-slate-100" /></div>
      <div className="space-y-2"><Label>Total</Label><Input readOnly value={formatMoney(amount + vat, form.currency)} className="bg-slate-100 font-bold" /></div>
      <div className="md:col-span-2 xl:col-span-4"><Field label="Memo" name="memo" form={form} setForm={setForm} placeholder="Optional note" /></div>
    </div>
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">This {receivePayment ? "payment reduces Accounts Receivable" : payBill ? "payment reduces Accounts Payable and the linked bank account" : isAccountsPayable ? "cheque reduces Accounts Payable" : "cheque posts to the selected expense account"} for the selected inventory.</div>
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
      <div className="space-y-2"><Label>Inventory *</Label><Select value={form.transactionLocationId || String(locations[0]?.id ?? "")} onValueChange={(transactionLocationId) => setForm({ ...form, transactionLocationId })}><SelectTrigger className="w-full"><SelectValue placeholder="Select inventory" /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}</SelectContent></Select></div>
      <CurrencyExchangeChoice form={form} setForm={setForm} exchangeRates={exchangeRates} baseCurrency={baseCurrency} />
      <Field label={`Exchange rate to ${baseCurrency}`} name="exchangeRate" type="number" form={form} setForm={setForm} required />
      <div className="space-y-2"><Label>{isTransfer ? "Transfer From" : isCard ? "Expense Account" : isOrder ? "Bank Account" : "Deposit Source"} *</Label><Select value={form.account || undefined} onValueChange={(account) => setForm({ ...form, account, ...(isTransfer && form.party === account ? { party: "" } : {}) })}><SelectTrigger className="w-full"><SelectValue placeholder="Select account" /></SelectTrigger><SelectContent>{selectableAccounts.map((account) => <SelectItem key={account.id} value={String(account.name)}>{String(account.code)} · {String(account.name)}</SelectItem>)}</SelectContent></Select></div>
      {isTransfer ? <div className="space-y-2"><Label>Transfer To *</Label><Select value={form.party || undefined} onValueChange={(party) => setForm({ ...form, party })}><SelectTrigger className="w-full"><SelectValue placeholder="Select destination bank" /></SelectTrigger><SelectContent>{banks.filter((account) => String(account.name) !== form.account).map((account) => <SelectItem key={account.id} value={String(account.name)}>{String(account.code)} · {String(account.name)}</SelectItem>)}</SelectContent></Select></div> : isCard || isOrder ? <div className="space-y-2"><Label>{isOrder ? "Supplier" : "Vendor / Payee"} *</Label><Select value={form.party || undefined} onValueChange={(party) => setForm({ ...form, party })}><SelectTrigger className="w-full"><SelectValue placeholder="Select vendor" /></SelectTrigger><SelectContent>{vendors.map((vendor) => <SelectItem key={vendor.id} value={String(vendor.name)}>{String(vendor.company || vendor.name)}</SelectItem>)}</SelectContent></Select></div> : <Field label="Received From" name="party" form={form} setForm={setForm} required placeholder="Customer, owner, or other source" />}
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
  const update = (index: number, changes: Partial<LineForm>) => setLines(lines.map((line, position) => position === index ? { ...line, ...changes } : line));
  const customerDocument = ["invoice", "sales receipt", "quotation", "estimate", "sales order", "credit memo", "statement charge", "finance charge"].includes(form.type);
  const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
  const vat = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(line.vatRate || 0) / 100, 0);
  return <div className="grid gap-4 sm:grid-cols-2">
    {form.sourceDocumentLabel ? <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-medium text-sky-800 sm:col-span-2">Creating {form.type === "bill" ? "supplier bill" : "invoice"} from {form.sourceDocumentLabel}. The original document will be linked and marked converted after saving.</div> : null}
    {types.length === 1 || customerDocument ? <div className="space-y-2"><Label htmlFor="transaction-type">Transaction type</Label><Input id="transaction-type" value={form.type} readOnly className="capitalize bg-slate-100" /></div> : <Choice label="Transaction type" name="type" values={types} form={form} setForm={setForm} />}<Field label="Document number" name="number" form={form} setForm={setForm} required />
    <div className="space-y-2 sm:col-span-2"><Label>{customerDocument ? "Customer" : "Vendor / payee"} *</Label><Select value={form.party || undefined} onValueChange={(value) => { const contactType = customerDocument ? "customer" : "vendor"; const party = contacts.find((entry) => entry.type === contactType && String(entry.name) === value); const currency = String(party?.currency || form.currency); const savedRate = exchangeRates.find((entry) => entry.currencyCode === currency)?.rate; setForm({ ...form, party: value, currency, exchangeRate: currency === baseCurrency ? "1" : savedRate ? String(savedRate) : "" }); }}><SelectTrigger className="w-full"><SelectValue placeholder={customerDocument ? "Select customer" : "Select vendor or payee"} /></SelectTrigger><SelectContent>{contacts.filter((contact) => contact.type === (customerDocument ? "customer" : "vendor")).map((contact) => <SelectItem key={contact.id} value={String(contact.name)}>{String(contact.company || contact.name)} · {String(contact.currency)}</SelectItem>)}</SelectContent></Select></div>
    <Field label="Transaction date" name="transactionDate" type="date" form={form} setForm={setForm} required /><Field label="Due date" name="dueDate" type="date" form={form} setForm={setForm} />
    <CurrencyExchangeChoice form={form} setForm={setForm} exchangeRates={exchangeRates} baseCurrency={baseCurrency} /><Field label={`Exchange rate to ${baseCurrency}`} name="exchangeRate" type="number" form={form} setForm={setForm} required />
    <div className="space-y-3 rounded-xl border bg-slate-50 p-3 sm:col-span-2">
      <div className="flex items-center justify-between"><div><Label>Items and services</Label><p className="text-xs text-slate-500">Stock updates when invoices, bills, and item receipts post.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, { itemId: "", description: "", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: form.vatRate === "0" ? "ZERO" : "STANDARD", vatRate: form.vatRate ?? "5" }])}><Plus className="size-3" />Line</Button></div>
      {lines.map((line, index) => <div key={index} className="grid gap-2 rounded-lg border bg-white p-3 sm:grid-cols-[1.15fr_1.6fr_.55fr_.75fr_.55fr_auto]">
        <Select value={line.itemId || "custom"} onValueChange={(value) => { const item = items.find((entry) => String(entry.id) === value); const purchaseDocument = ["bill", "purchase order", "item receipt", "received item bill"].includes(form.type); update(index, value === "custom" ? { itemId: "" } : { itemId: value, description: String(item?.name ?? ""), unitPrice: String(purchaseDocument ? item?.lastPurchasePrice ?? item?.cost ?? 0 : item?.salesPrice ?? 0), unitCost: String(item?.cost ?? 0) }); }}><SelectTrigger className="w-full"><SelectValue placeholder="Item" /></SelectTrigger><SelectContent><SelectItem value="custom">Service / custom</SelectItem>{items.map((item) => <SelectItem key={item.id} value={String(item.id)}>{String(item.sku)} · {String(item.name)}</SelectItem>)}</SelectContent></Select>
        <Input placeholder="Description" required value={line.description} onChange={(e) => update(index, { description: e.target.value })} />
        <Input aria-label="Quantity" title="Quantity" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => update(index, { quantity: e.target.value })} />
        <Input aria-label="Unit price" title="Unit price" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => update(index, { unitPrice: e.target.value })} />
        {form.type === "item receipt" ? <Input readOnly value={vatCodeOptions.find((option) => option.code === "ZERO")?.label ?? "ZERO · 0%"} className="bg-slate-100" /> : <Select value={line.vatCode} onValueChange={(vatCode) => update(index, { vatCode, vatRate: vatRateForCode(vatCode, vatCodeOptions) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{vatCodeOptions.map((option) => <SelectItem key={option.code} value={option.code}><span className="flex flex-col"><span>{option.label}</span>{option.description ? <span className="text-xs text-slate-500">{option.description}</span> : null}</span></SelectItem>)}</SelectContent></Select>}
        <Button type="button" variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, position) => position !== index))} className="text-slate-400 hover:text-rose-600"><Trash2 className="size-4" /></Button>
      </div>)}
      <div className="ml-auto grid max-w-xs gap-2 pt-2 text-sm"><div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatMoney(subtotal, form.currency)}</span></div><div className="flex justify-between text-slate-500"><span>VAT</span><span>{formatMoney(vat, form.currency)}</span></div><div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span>{formatMoney(subtotal + vat, form.currency)}</span></div></div>
    </div>
    {["invoice", "sales receipt"].includes(form.type) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:col-span-2">
      <label className="flex cursor-pointer items-start gap-3"><Checkbox checked={form.allowNegativeStock === "true"} onCheckedChange={(checked) => setForm({ ...form, allowNegativeStock: checked === true ? "true" : "false", adminOverridePin: checked === true ? form.adminOverridePin ?? "" : "" })} /><span><span className="block text-sm font-semibold text-amber-950">Admin override: allow negative stock</span><span className="mt-1 block text-xs text-amber-800">Normally blocked when stock is insufficient. Configure or change the PIN in Management &gt; Admin Controls.</span></span></label>
      {form.allowNegativeStock === "true" && <div className="mt-3 max-w-sm space-y-2"><Label htmlFor="adminOverridePin">Admin PIN</Label><Input id="adminOverridePin" name="adminOverridePin" type="password" inputMode="numeric" autoComplete="off" required value={form.adminOverridePin ?? ""} onChange={(event) => setForm({ ...form, adminOverridePin: event.target.value })} placeholder="Enter admin PIN" /></div>}
    </div>}
    <Choice label="Status" name="status" values={["open", "paid", "overdue", "cleared"]} form={form} setForm={setForm} /><div className="space-y-2"><Label>Posting account</Label><Select value={form.account} onValueChange={(account) => setForm({ ...form, account })}><SelectTrigger className="w-full"><SelectValue placeholder="Select linked account" /></SelectTrigger><SelectContent>{accounts.filter((account) => account.active && account.systemRole).map((account) => <SelectItem key={account.id} value={String(account.name)}>{String(account.name)}</SelectItem>)}</SelectContent></Select></div>
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
  if (form.type !== "customer") return <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Name" name="name" form={form} setForm={setForm} required /></div><Field label="Company" name="company" form={form} setForm={setForm} /><Field label="Opening balance" name="balance" type="number" form={form} setForm={setForm} /><Field label="Email" name="email" type="email" form={form} setForm={setForm} /><Field label="Phone" name="phone" form={form} setForm={setForm} /></div>;

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
      <Field label="Opening Balance" name="balance" type="number" form={form} setForm={setForm} />
      <div className="space-y-2 md:col-span-2"><Label htmlFor="description">Description</Label><Textarea id="description" name="description" rows={4} placeholder="Add customer notes" value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
    </div>
  </div>;
}
function ItemFields({ form, setForm, items }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void; items: DataRecord[] }) {
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
  const description = Array.from({ length: count }, (_, index) => form[`specValue${index}`]?.trim() ?? "").filter(Boolean).join(" | ");
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
  return <div data-attachments-excluded="true" className="grid gap-4 sm:grid-cols-2">
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

  return <Popover open={open} onOpenChange={setOpen}>
    <div className="flex min-w-0">
      <Input aria-label={`${label || "Specification"} value`} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-r-none" />
      <PopoverTrigger asChild><Button type="button" variant="outline" size="icon" title={`Manage ${label || "detail"} choices`} aria-label={`Manage ${label || "detail"} choices`} className="shrink-0 rounded-l-none border-l-0"><ChevronDown className="size-4" /></Button></PopoverTrigger>
    </div>
    <PopoverContent data-attachments-excluded="true" align="start" className="w-80 space-y-3 p-3">
      <div><p className="text-sm font-bold text-slate-900">{label || "Detail"} choices</p><p className="text-xs text-slate-500">Select, add, rename or remove a choice.</p></div>
      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {options.length === 0 ? <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">No saved choices yet.</p> : options.map((option) => editing === option ? <div key={option} className="flex gap-1">
          <Input autoFocus value={editedValue} onChange={(event) => setEditedValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); rename(option); } }} className="h-8" />
          <Button type="button" size="icon" variant="ghost" disabled={busy} onClick={() => rename(option)} aria-label="Save renamed choice" className="size-8 text-emerald-600"><Check className="size-4" /></Button>
        </div> : <div key={option} className="group flex items-center gap-1 rounded-md hover:bg-slate-50">
          <button type="button" onClick={() => { onChange(option); setOpen(false); }} className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm">{option}</button>
          <Button type="button" size="icon" variant="ghost" disabled={busy} onClick={() => { setEditing(option); setEditedValue(option); }} aria-label={`Rename ${option}`} className="size-8 text-slate-400 hover:text-sky-600"><Pencil className="size-3.5" /></Button>
          <Button type="button" size="icon" variant="ghost" disabled={busy} onClick={() => remove(option)} aria-label={`Remove ${option}`} className="size-8 text-slate-400 hover:text-rose-600"><Trash2 className="size-3.5" /></Button>
        </div>)}
      </div>
      <div className="flex gap-2 border-t pt-3"><Input value={newValue} onChange={(event) => setNewValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder="Add new choice" className="h-9" /><Button type="button" size="sm" disabled={busy || !newValue.trim()} onClick={add}><Plus className="size-4" />Add</Button></div>
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
    <Choice label="Account type" name="type" values={["Income", "Expense", "Cost of Goods Sold", "Other Income", "Other Expense", "Fixed Asset", "Bank", "Loan", "Credit Card", "Equity", "Accounts Receivable", "Other Current Asset", "Other Asset", "Accounts Payable", "Other Current Liability", "Long Term Liability"]} form={form} setForm={setForm} />
    <div className="space-y-2"><Label>Linked system use</Label><Select value={form.systemRole || "none"} onValueChange={changeSystemRole}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No system link</SelectItem>{availableRoles.map(([role, label]) => <SelectItem key={role} value={role}>{label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">{multiCurrencyRole ? "Add one control account for each currency used by customers or vendors." : "Linked accounts appear in invoices, bills, banking, VAT and inventory postings."}</p></div>
    {multiCurrencyRole ? <Choice label="Control account currency *" name="currency" values={currencies} form={form} setForm={setForm} /> : null}
    <div className="space-y-2"><Label>Sub-account of</Label><Select value={form.parentAccountId || "none"} onValueChange={(value) => setForm({ ...form, parentAccountId: value === "none" ? "" : value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not a sub-account</SelectItem>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{String(account.code)} · {String(account.name)}</SelectItem>)}</SelectContent></Select></div>
    <Field label="Opening balance" name="balance" type="number" form={form} setForm={setForm} />
  </div>;
}
