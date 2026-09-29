"use client";
import { FinancialReport } from "./financial-report";
import type { FinancialReportData } from "@/lib/financial-reports";
import { SharedItemCatalogue } from "@/app/shared-item-catalogue";
import { SharedOutOfStock } from "@/app/shared-out-of-stock";
import { ReportDateFilter } from "./report-date-filter";
import { reportPeriod, type ReportPeriod } from "@/lib/report-period";
import { CompanyClearButton } from "./company-clear-button";
import { CompanyTemplateDesigner } from "./company-template-designer";
import { LetterheadCenter } from "./letterhead-center";
import { WarrantyCenter } from "./warranty-center";
import { VendorCenterErrorBoundary } from "./vendor-center-error-boundary";

import { ActiveCustomersReport } from "./active-customers-report";
import { BusinessFinalReport } from "./business-final-report";
import { CustomerOpenBalance } from "./customer-open-balance";
import type { OpenBalanceData } from "@/lib/customer-open-balance";
import { DocumentExtraFields } from "./document-extra-fields";
import { AccountHistory } from "./account-history";
import { useSkuLock, SkuLockNotice } from "./use-sku-lock";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { PaymentSalesRep } from "./payment-sales-rep";
import { PaymentTermsPicker } from "./payment-terms-picker";
import { UaeBankCheque } from "./uae-bank-cheque";
import { PaidInvoiceStamp } from "./paid-invoice-stamp";
import { StatementFilters, StatementHeading, type StatementData } from "./statement-layout";
import { LetterheadStamp } from "./letterhead-page";
import { defaultLetterhead, letterheadForDocument } from "@/lib/letterhead";
import { SalesSourceInvoicing } from "./sales-source-invoicing";
import { OpenSalesDocuments } from "./open-sales-documents";
import { OpenPurchaseOrders } from "./open-purchase-orders";
import { PurchaseOrderReceiving } from "./purchase-order-receiving";
import { UnpaidInvoices } from "./unpaid-invoices";
import { UnpaidBills } from "./unpaid-bills";
import { PurchaseReturnSource } from "./purchase-return-source";
import { ProfitLossReport } from "./profit-loss-report";
import type { PnlMeta, PnlReport } from "@/lib/profit-loss";
import { LiveProfitLossSummary } from "./live-profit-loss-summary";
import { dashboardMetrics } from "@/lib/dashboard-metrics";
import { filterZeroQohRows, hasInventoryQohFilter } from "@/lib/inventory-report-filter";
import { filterRecordListByDate, recordListReport } from "@/lib/record-list-export";
import { reportCsv, reportFilename, reportPdf, reportWorkbook } from "@/lib/report-export";
import { budgetReportKeys, budgetSummary } from "@/lib/budget-report";
import { salesDetailTarget, salesReportKeys, salesSummary } from "@/lib/sales-report";
import { customerDetailTarget, customerReportKeys, customerSummary } from "@/lib/customer-report";
import { vendorDetailTarget, vendorReportKeys, vendorSummary } from "@/lib/vendor-report";
import { purchaseDetailTarget, purchaseReportKeys, purchaseSummary } from "@/lib/purchase-report";
import { inventoryDetailTarget, inventoryReportKeys, inventorySummary } from "@/lib/inventory-report";
import { bankingDetailTarget, bankingReportKeys, bankingSummary } from "@/lib/banking-report";
import { accountantDetailTarget, accountantReportKeys, accountantSummary } from "@/lib/accountant-report";
import { listDetailTarget, listReportKeys, listSummary } from "@/lib/list-report";
import { employeeDetailTarget, employeeReportKeys, employeeSummary as employeeReportSummary } from "@/lib/employee-report";
import { convertInvoiceLines, invoiceCurrencyAmount, validDocumentRate, type PricedInvoiceLine } from "@/lib/invoice-pricing";
import { dueDateForPaymentTerms } from "@/lib/payment-terms";
import { inferUaeChequeLayout, uaeChequeLayouts } from "@/lib/uae-cheque-layouts";
import { applyContactCurrency } from "@/lib/contact-currency";
import { countries } from "@/lib/countries";
import { generatedItemDescription, type ItemSpecification } from "@/lib/item-description";
import { SalesDocumentTemplate, salesDocumentModeForTransaction } from "./sales-document-template";
import { InvoiceAttachments } from "./invoice-attachments";
import { PrintOrientationSelect, type PrintOrientation } from "@/components/print-orientation-select";
import {
  AlertTriangle, ArrowRightLeft, BadgeDollarSign, BookOpen, BookOpenCheck, BookmarkPlus, Boxes, Building2, CheckCircle2, Copy,
  Check, ChevronDown, ChevronRight, CircleDollarSign, Clock3, Download, FileBarChart2, FileSpreadsheet, FileText, Landmark,
  Eye, ImageUp, KeyRound, LayoutDashboard, LogOut, PackageCheck, PackageSearch, PackageX, Palette, Paperclip, Pencil, Plus, Printer, ReceiptText, RefreshCw,
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

type View = "serial-search" | "stock-pricing" | "dashboard" | "inventory-overview" | "sales" | "receive-payment" | "purchases" | "write-cheque" | "customers" | "warranties" | "vendors" | "inventory" | "item-logistics" | "inventory-check-reports" | "transfers" | "banking" | "journal-entries" | "accounts" | "vat-management" | "employees" | "reports" | "companies" | "company-setup" | "letterhead" | "inventories" | "invoice-series" | "currencies" | "vat-codes" | "admin-controls";
type AppRole = "admin" | "accountant" | "sales" | "purchasing" | "inventory" | "viewer";
type UserTheme = "emerald" | "ocean" | "indigo" | "violet" | "rose" | "amber";
type AppearanceMode = "light" | "dark";
type CurrentUser = { isAllAdmin?: boolean; id: number; fullName: string; email: string; avatarData: string; themeColor: string; appearanceMode: AppearanceMode; role: AppRole; mustChangePassword: boolean };
type Kind = "transactions" | "contacts" | "items" | "accounts";
type DataRecord = Record<string, string | number | boolean> & { id: number };
type LineForm = PricedInvoiceLine & { id?: number; sourceLineId?: number; comments?: string; serialNumber?: string; freightCharge?: string; itemId: string; description: string; quantity: string; unitPrice: string; unitCost: string; vatCode: string; vatRate: string };
type InventoryLocation = { id: number; companyId: number; name: string; code: string; invoicePrefix: string; nextInvoiceNumber: number; receivable?: number; payable?: number };
type CompanyWorkspace = { id: number; name: string; baseCurrency: string; locations: InventoryLocation[] };
type CompanySetup = { id: number; name: string; baseCurrency: string; logoData: string; rightLogoData: string; loginBranding: boolean; loginLogoData: string; loginCompanyLogoData: string; loginDisplayName: string; loginCopyrightYears: string; loginBackgroundData: string; loginBackgroundColor: string; documentDesign: string; letterheadDesign: string; stampData: string; addressLine1: string; addressLine2: string; city: string; country: string; phone: string; email: string; trn: string; bankName: string; bankAccountName: string; bankAccountNumber: string; bankIban: string; bankSwift: string; bankCurrency: string; documentTemplate: "classic" | "modern" | "minimal"; documentColor: string };
type ReportData = { financial?: FinancialReportData["financial"]; period?: ReportPeriod; pnl?: PnlMeta; summary?: PnlReport["summary"]; activeCustomers?: { canViewAccounts: boolean; asOf: string; count: number }; openBalance?: OpenBalanceData; statement?: StatementData; key?: string; companyId?: number; supplierId?: number; canEditPrices?: boolean; canViewAccounts?: boolean; accountLinkIssues?: string[]; vatCodes?: Array<{ code: string; name: string; rate: number }>; title: string; description?: string; generatedAt: string; currency: string; columns: Array<{ key: string; label: string; type?: "money" }>; rows: Array<Record<string, string | number>>; chart?: { labelKey: string; incomeKey: string; expenseKey: string; incomeLabel?: string; expenseLabel?: string } };
type MemorisedReportRecord = { customer?: string; statementDate?: string; memo?: string; id: number; companyId: number; locationId: number | null; name: string; reportKey: string; category: ReportCategory; currency: string; periodStart: string; periodEnd: string; updatedAt: string };
type ReportContext = { key: string; locationId: number; currency: string; periodStart: string; periodEnd: string; supplierId?: number };
type TransactionDetail = { revision?: string; record: DataRecord; lines: DataRecord[]; journal: DataRecord[]; partyContact?: DataRecord | null };

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
    { id: "warranties", label: "Warranty / RMA", icon: ShieldCheck },
  ] },
  { label: "VENDORS", items: [
    { id: "purchases", label: "Purchases & Bills", icon: ShoppingCart },
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
    { id: "write-cheque", label: "Write UAE Bank Cheque", icon: WalletCards },
    { id: "journal-entries", label: "General Journal", icon: BookOpenCheck },
    { id: "accounts", label: "Chart of Accounts", icon: BookOpen },
    { id: "vat-management", label: "VAT Management", icon: Percent },
    { id: "employees", label: "Employees & HR", icon: WalletCards },
    { id: "reports", label: "Reports", icon: FileBarChart2 },
  ] },
  { label: "MANAGEMENT", items: [
    { id: "companies", label: "Companies", icon: Building2 },
    { id: "company-setup", label: "Company Setup", icon: Settings },
    { id: "letterhead", label: "Letterhead Generator", icon: FileText },
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
  accountant: ["serial-search", "dashboard", "inventory-overview", "inventory-check-reports", "sales", "receive-payment", "customers", "warranties", "purchases", "write-cheque", "vendors", "banking", "journal-entries", "accounts", "vat-management", "reports"],
  sales: ["serial-search", "dashboard", "inventory-overview", "inventory-check-reports", "sales", "receive-payment", "customers", "warranties"],
  purchasing: ["serial-search", "dashboard", "inventory-overview", "inventory-check-reports", "purchases", "write-cheque", "vendors"],
  inventory: ["serial-search", "dashboard", "inventory-overview", "inventory", "item-logistics", "inventory-check-reports", "transfers"],
  viewer: ["serial-search", "dashboard", "inventory-overview", "inventory-check-reports", "reports"],
};

const roleWriteViews: Record<AppRole, readonly View[]> = {
  admin: ["sales", "receive-payment", "customers", "warranties", "purchases", "write-cheque", "vendors", "inventory", "item-logistics", "inventory-check-reports", "transfers", "banking", "journal-entries", "accounts", "employees", "companies", "inventories", "invoice-series", "currencies", "vat-codes", "admin-controls"],
  accountant: ["sales", "receive-payment", "customers", "warranties", "purchases", "write-cheque", "vendors", "banking", "journal-entries", "accounts", "vat-management"],
  sales: ["sales", "receive-payment", "customers", "warranties"],
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
  "write-cheque": { title: "Write UAE Bank Cheque", sub: "Prepare, save, post and print UAE bank cheques" },
  customers: { title: "Customer Center", sub: "Customer balances, contacts and activity" },
  warranties: { title: "Warranty / RMA", sub: "Customer returns, invoice items and A4 service records" },
  vendors: { title: "Vendor Center", sub: "Suppliers, payables and purchasing history" },
  inventory: { title: "Inventory Center", sub: "Stock levels, pricing, costs and reorder controls" },
  "item-logistics": { title: "HS Code, COO & Dimensions", sub: "Maintain customs classifications, country of origin, dimensions and weight" },
  "inventory-check-reports": { title: "Inventory Check Reports", sub: "Select in-stock items and compare quantities across your companies" },
  transfers: { title: "Stock Transfers", sub: "Move stock between companies and inventory locations" },
  banking: { title: "Banking", sub: "Deposits, cheques, transfers and account activity" },
  "journal-entries": { title: "General Journal Entries", sub: "Post balanced debits and credits directly to the ledger" },
  accounts: { title: "Chart of Accounts", sub: "Assets, liabilities, equity, income and expenses" },
  "vat-management": { title: "VAT Management", sub: "Review, adjust, report and file VAT" },
  employees: { title: "Employees & HR", sub: "Employee records and balances" },
  reports: { title: "Report Center", sub: "Financial, sales, purchasing and inventory analysis" },
  companies: { title: "Companies", sub: "Create and switch between separate company files" },
  "company-setup": { title: "Company Setup", sub: "Logo, address, bank details and document design" },
  letterhead: { title: "Letterhead Generator", sub: "Named A4 letterheads for selected documents" },
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
  ["Complete Business Final Report", "Executive summary of sales, purchases, profit, VAT, receivables, payables, banking and inventory", "Financial", "business-final"],
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
  ["Employee Balance Summary", "Current employee balances by currency and status", "Employees & HR", "employee-balances"],
  ["Employee Payment Detail", "Dated cheque payments linked to employee records", "Employees & HR", "employee-payments"],
  ["Other Names Phone List", "Telephone directory for transaction names not saved as contacts", "Lists", "other-names-phone-list"],
  ["Other Names Contact List", "Transaction names not saved as customers, suppliers, or employees", "Lists", "other-names-contact-list"],
  ["Terms Listing", "Payment terms found across sales and purchase documents", "Lists", "terms-listing"],
  ["To Do Notes", "Open transaction notes and due dates", "Lists", "to-do-notes"],
  ["Memorised Transaction Listing", "Transactions marked as memorised, recurring, or templates", "Lists", "memorised-transactions"],
  ["Bank Register", "Bank account debits, credits and running balances", "Banking", "bank-register"],
  ["Bank Reconciliation", "Cleared and uncleared banking activity", "Banking", "bank-reconciliation"],
  ["UAE VAT201 Summary", "Company-wide UAE output, recoverable, and net VAT in AED", "VAT", "vat-summary"],
  ["VAT Detail Report", "Transaction-level VAT amounts by code", "VAT", "vat-detail"],
  ["Unassigned VAT Amounts Detail Report", "Taxable postings without a VAT code", "VAT", "vat-unassigned"],
  ["VAT Exception Report", "Transactions that need VAT review", "VAT", "vat-exceptions"],
  ["VAT Item Summary", "VAT totals grouped by item", "VAT", "vat-item-summary"],
  ["Reverse Charge and Import VAT List", "UAE imports and purchases subject to reverse charge", "VAT", "reverse-charge"],
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
  ["Customer Document Summary", "Estimate, proforma invoice, and sales order counts by customer", "Customers", "customer-document-summary"],
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
  ["QuickReport", "Selected vendor activity in transaction currency", "Vendors", "supplier-quickreport"],
  ["Open Balance", "Selected vendor's unpaid bills in transaction currency", "Vendors", "supplier-open-balance"],
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
  ["Purchase Order Summary", "Open, partially received and completed orders by supplier", "Purchases", "purchase-order-summary"],
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

const reportCategoryOrder = ["Profit & Loss", "Financial", "Budgets", "Sales", "Customers", "Vendors", "Purchases", "Employees & HR", "Inventory", "Banking", "VAT", "Accountant", "Lists", "Company"] as const;
type ReportCategory = (typeof reportCategoryOrder)[number];
const vendorSelectionReportKeys = new Set(["supplier-quickreport", "supplier-open-balance"]);
const profitLossReportKeys = new Set(["profit-loss", "profit-loss-item", "profit-loss-rep", "profit-loss-detail", "profit-loss-ytd", "profit-loss-prev-year", "profit-loss-job", "profit-loss-class", "profit-loss-unclassified", "budget-profit-loss", "stock-pricing-profit", "item-profitability"]);
const financialReportKeys = new Set(["business-final", "income-customer-summary", "income-customer-detail", "expenses-supplier-summary", "expenses-supplier-detail", "income-expense-graph", "realised-gains-losses", "unrealised-gains-losses", "balance-sheet", "balance-sheet-detail", "balance-sheet-summary", "balance-sheet-prev-year", "net-worth-graph", "cash-flow", "cash-flow-forecast"]);
const financialLandscapeReportKeys = new Set(["business-final", "income-customer-detail", "expenses-supplier-detail", "income-expense-graph", "realised-gains-losses", "unrealised-gains-losses", "balance-sheet-detail", "balance-sheet-prev-year", "net-worth-graph", "cash-flow-forecast"]);

const currencies = ["AED", "USD", "EUR", "GBP", "SAR", "OMR", "QAR", "BHD", "KWD", "INR", "CNY", "HKD", "JPY", "CAD", "AUD", "CHF", "SGD", "NZD", "PKR", "BDT", "LKR", "MYR", "THB", "IDR", "KRW", "TRY", "ZAR"];
const formatMoney = (value: unknown, currency = "AED") => new Intl.NumberFormat("en-AE", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value ?? 0));
const today = () => new Date().toISOString().slice(0, 10);
const emptyCompanySetup = (id = 0, name = "Company", baseCurrency = "AED"): CompanySetup => ({ id, name, baseCurrency, logoData: "", rightLogoData: "", loginBranding: false, loginLogoData: "", loginCompanyLogoData: "", loginDisplayName: "", loginCopyrightYears: "1996-2021", loginBackgroundData: "", loginBackgroundColor: "#f3f6fa", documentDesign: "", letterheadDesign: "", stampData: "", addressLine1: "", addressLine2: "", city: "", country: "United Arab Emirates", phone: "", email: "", trn: "", bankName: "", bankAccountName: "", bankAccountNumber: "", bankIban: "", bankSwift: "", bankCurrency: baseCurrency, documentTemplate: "modern", documentColor: "#10b981" });
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
    const specifications = JSON.parse(String(item.specifications ?? "[]")) as ItemSpecification[];
    if (specifications.length) return generatedItemDescription(specifications, item.sku, item.itemNumber);
  } catch { /* Fall back to the saved description for older records. */ }
  return String(item.description ?? "").toLocaleUpperCase("en").split(" | ").filter((value) => value.trim().toLowerCase() !== "no").join(" | ");
};

export default function EnterpriseApp({ currentUser }: { currentUser: CurrentUser }) {
  const [view, setView] = useState<View>("dashboard");
  const [records, setRecords] = useState<Record<Kind, DataRecord[]>>({ transactions: [], contacts: [], items: [], accounts: [] });
  const [loading, setLoading] = useState(true);
  const [documentInventory, setDocumentInventory] = useState<{ key: string; items: DataRecord[]; error?: string }>({ key: "", items: [] });
  const [search, setSearch] = useState("");
  const [salesListTarget, setSalesListTarget] = useState<{ type: string; customer: string; nonce: number } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editorKind, setEditorKind] = useState<Kind | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<LineForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [invoiceFiles, setInvoiceFiles] = useState<{ fileName: string; mimeType: string; fileData: string; fileSize: number }[]>([]);
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

  useEffect(() => {
    if (view !== "inventory-overview") return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      const openLayer = document.querySelector(
        '[data-slot="dialog-content"][data-state="open"], [data-slot="sheet-content"][data-state="open"], [data-slot="drawer-content"][data-state="open"], [data-slot="alert-dialog-content"][data-state="open"], [role="dialog"][aria-modal="true"]'
      );
      if (openLayer) return;
      event.preventDefault();
      setView("dashboard");
      setSearch("");
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [view]);

  const activeCompany = companies.find((company) => company.id === activeCompanyId);
  const activeCompanyName = activeCompany?.name || "Select company";
  const activeCompanyInitials = activeCompany?.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toLocaleUpperCase() || "CO";
  const activeLocations = useMemo(() => activeCompany?.locations ?? [], [activeCompany]);
  const baseCurrency = activeCompany?.baseCurrency ?? "AED";
  const reportVendors = useMemo(() => records.contacts.filter((record) => record.type === "vendor"), [records.contacts]);
  const reportVendorCurrencies = useMemo(() => {
    const vendorNames = new Set(reportVendors.map((vendor) => String(vendor.name)));
    const vendorTransactionTypes = new Set(["bill", "received item bill", "expense", "cheque", "bill payment", "vendor payment", "vendor credit", "purchase order", "item receipt"]);
    return [...new Set([baseCurrency, ...reportVendors.map((vendor) => String(vendor.currency || "")), ...records.transactions.filter((record) => vendorTransactionTypes.has(String(record.type)) || vendorNames.has(String(record.party))).map((record) => String(record.currency || ""))].filter((code) => /^[A-Z]{3}$/.test(code)))].sort((a, b) => a === baseCurrency ? -1 : b === baseCurrency ? 1 : a.localeCompare(b));
  }, [baseCurrency, records.transactions, reportVendors]);

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
  // Company-level records (especially Chart of Accounts) must still load when a
  // company temporarily has no active inventory location. Location-scoped lists
  // safely return empty rows for locationId 0, while accounts load company-wide.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (activeCompanyId) loadData(); }, [activeCompanyId, activeLocationId, loadData]);
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
  const managementView = view === "serial-search" || view === "inventory-overview" || view === "item-logistics" || view === "inventory-check-reports" || view === "transfers" || view === "journal-entries" || view === "vat-management" || view === "companies" || view === "company-setup" || view === "letterhead" || view === "inventories" || view === "invoice-series" || view === "currencies" || view === "vat-codes" || view === "admin-controls";
  const visibleNavGroups = navGroups.map((group) => ({ ...group, items: group.items.filter((item) => roleViews[currentUser.role].includes(item.id)) })).filter((group) => group.items.length > 0);
  const canWriteCurrentView = roleWriteViews[currentUser.role].includes(view);
  const activeEditorKind = editorKind ?? currentKind;
  const salesDetailsOnly = activeEditorKind === "transactions" && editingRecordId !== null && ["invoice", "customer payment"].includes(form.type);
  const linkedInventoryDocument = activeEditorKind === "transactions" && ["bill", "vendor credit", "invoice", "estimate", "proforma invoice", "sales order", "quotation"].includes(form.type);
  const documentLocationId = Number((["bill", "vendor credit"].includes(form.type) ? form.billLocationId : form.transactionLocationId) || activeLocationId);
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
    if (["invoice", "estimate", "proforma invoice", "sales order", "quotation"].includes(next.type) && (next.terms !== form.terms || next.transactionDate !== form.transactionDate)) {
      const dueDate = dueDateForPaymentTerms(next.transactionDate, next.terms || "");
      if (dueDate) next = { ...next, dueDate };
    }
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
    setInvoiceFiles([]);
    setEditingItemId(null);
    setEditingRecordId(null);
    setEditorKind("transactions");
    if (type === "invoice") {
      setInvoiceInventoryOpen(true);
      return;
    }
    const prefix = type === "customer payment" ? "PAY" : type === "bill payment" ? "BPY" : type === "vendor credit" ? "PRET" : type === "cheque" ? "CHQ" : type === "credit card charge" ? "CCC" : type === "cheque order" ? "CKO" : type === "transfer" ? "TRF" : type === "deposit" ? "DEP" : type === "statement charge" ? "STC" : type === "finance charge" ? "FIN" : type === "item receipt" ? "REC" : type === "received item bill" ? "RIB" : type === "proforma invoice" ? "PRO" : type === "sales order" ? "SO" : type === "quotation" ? "QUO" : type.slice(0, 3).toUpperCase();
    const taxFree = ["customer payment", "bill payment", "finance charge", "item receipt", "deposit", "transfer", "cheque order"].includes(type);
    const descriptions: Record<string, string> = { "customer payment": "Payment received", "bill payment": "Bill payment", "vendor credit": "Purchase return", cheque: "Cheque payment", "credit card charge": "Credit card charge", "cheque order": "Cheque books and envelopes", transfer: "Bank transfer", deposit: "Bank deposit", "statement charge": "Statement charge", "finance charge": "Finance charge", "credit memo": "Credit note / refund", "item receipt": "Items received", "received item bill": "Bill for received items" };
    setForm({ type, number: `${prefix}-${String(records.transactions.length + 1).padStart(4, "0")}`, transactionDate: today(), dueDate: today(), terms: type === "cheque" ? "account-payee" : "Due on receipt", chequeBankKey: type === "cheque" ? "other-uae-bank" : "", status: "open", account: defaultPostingAccount(type, records.accounts), vatRate: taxFree ? "0" : "5", currency: baseCurrency, exchangeRate: "1", billLocationId: String(activeLocationId), transactionLocationId: String(activeLocationId), salesman: "", isImport: "false", freightCharges: "0" });
    setLines([{ itemId: "", description: descriptions[type] ?? "", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: taxFree ? "ZERO" : "STANDARD", vatRate: taxFree ? "0" : "5" }]);
    setDialogOpen(true);
  }

  function openListEdit(record: DataRecord) {
    setInvoiceFiles([]);
    setEditingItemId(null); setEditingRecordId(record.id); setEditorKind(currentKind);
    setForm(Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value == null ? "" : String(value)])));
    setDialogOpen(true);
  }

  async function newItemIdentity() {
    const response = await fetch(`/api/records?kind=items&companyId=${activeCompanyId}&locationId=${activeLocationId}&previewIdentity=true`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not generate the item identifiers");
    return { sku: String(data.sku), itemNumber: String(data.itemNumber) };
  }

  async function openCreate() {
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
      let identity: { sku: string; itemNumber: string };
      try { identity = await newItemIdentity(); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Could not generate the item identifiers"); return; }
      const initialFields = specificationFields.filter((label) => label !== "Product Category").slice(0, 8);
      const defaultCogs = records.accounts.find((account) => account.active && (account.systemRole === "COGS" || account.type === "Cost of Goods Sold" || /cost of goods/i.test(String(account.name || ""))));
      const defaultIncome = records.accounts.find((account) => account.active && (account.systemRole === "SALES" || account.type === "Income" || /^income$/i.test(String(account.name || ""))));
      const defaultAsset = records.accounts.find((account) => account.active && account.systemRole === "INVENTORY")
        ?? records.accounts.find((account) => account.active && /inventory asset/i.test(String(account.name || "")));
      const defaultVat = vatCodeOptions.find((code) => code.code === "STANDARD")?.code ?? vatCodeOptions[0]?.code ?? "ZERO";
      const itemForm: Record<string, string> = {
        itemType: "stock-part", category: "LAPTOP", sku: identity.sku, itemNumber: identity.itemNumber, quantity: "0", reorderPoint: "0", salesPrice: "0", cost: "0",
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
    setForm({ type: "invoice", number: invoiceNumberPreview(activeCompanyId, location), transactionDate: today(), dueDate: today(), terms: "Due on receipt", status: "open", account: linkedAccountName(records.accounts, "SALES", "Sales Revenue"), vatRate: "5", currency: baseCurrency, exchangeRate: "1", allowNegativeStock: "false", adminOverridePin: "" });
    setLines([{ itemId: "", description: "", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: "STANDARD", vatRate: "5" }]);
    setInvoiceInventoryOpen(false);
    setDialogOpen(true);
  }

  function openItemEdit(item: DataRecord, duplicateIdentity?: { sku: string; itemNumber: string }) {
    const defaultCogs = records.accounts.find((account) => account.active && (account.systemRole === "COGS" || account.type === "Cost of Goods Sold" || /cost of goods/i.test(String(account.name || ""))));
    const defaultIncome = records.accounts.find((account) => account.active && (account.systemRole === "SALES" || account.type === "Income" || /^income$/i.test(String(account.name || ""))));
    const defaultAsset = records.accounts.find((account) => account.active && account.systemRole === "INVENTORY")
        ?? records.accounts.find((account) => account.active && /inventory asset/i.test(String(account.name || "")));
    let specifications: Array<{ label: string; value: string }> = [];
    try { specifications = JSON.parse(String(item.specifications ?? "[]")); } catch { specifications = []; }
    if (!specifications.length) specifications = specificationFields.filter((label) => label !== "Product Category").slice(0, 8).map((label) => ({ label, value: "" }));
    const itemForm: Record<string, string> = {
      itemType: itemTypeOf(item.itemType), category: String(item.category ?? "LAPTOP").toLocaleUpperCase("en"),
      itemNumber: duplicateIdentity?.itemNumber ?? String(item.itemNumber ?? ""), sku: duplicateIdentity?.sku ?? String(item.sku ?? ""), quantity: duplicateIdentity ? "0" : String(item.quantity ?? 0),
      reorderPoint: String(item.reorderPoint ?? 0), salesPrice: String(item.salesPrice ?? 0), cost: String(item.averageCost ?? item.cost ?? 0),
      lastPurchasePrice: String(item.lastPurchasePrice ?? item.cost ?? 0), onPo: String(item.onPo ?? 0),
      purchaseVatCode: String(item.purchaseVatCode ?? "STANDARD"), salesVatCode: String(item.salesVatCode ?? "STANDARD"),
      cogsAccountId: item.cogsAccountId ? String(item.cogsAccountId) : (defaultCogs ? String(defaultCogs.id) : ""), incomeAccountId: item.incomeAccountId ? String(item.incomeAccountId) : (defaultIncome ? String(defaultIncome.id) : ""),
      assetAccountId: item.assetAccountId ? String(item.assetAccountId) : (defaultAsset ? String(defaultAsset.id) : ""), preferredSupplierId: item.preferredSupplierId ? String(item.preferredSupplierId) : "",
      status: String(item.status ?? "active"), amountsIncludeVat: item.amountsIncludeVat === true || String(item.amountsIncludeVat) === "true" ? "true" : "false",
      specCount: String(Math.min(30, specifications.length)), ...(duplicateIdentity ? { duplicateOfItemId: String(item.id) } : {}),
    };
    specifications.slice(0, 30).forEach((specification, index) => {
      itemForm[`specLabel${index}`] = specification.label;
      itemForm[`specValue${index}`] = String(specification.value ?? "").toLocaleUpperCase("en");
    });
    setEditingItemId(duplicateIdentity ? null : item.id);
    setEditorKind("items");
    setForm(itemForm);
    setDialogOpen(true);
  }

  function appendInvoiceLine() {
    setLines((current) => [...current, { itemId: "", description: "", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: "STANDARD", vatRate: "5", comments: "", serialNumber: "" }]);
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saveAndPrint = (event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement && (event.nativeEvent as SubmitEvent).submitter?.dataset.action === "save-print";
    if (!skuLock.ready) return;
    const saveKind = activeEditorKind;
    if (saveKind === "items" && !activeLocations.some(location => location.id === activeLocationId)) return toast.error("Select a company with an active inventory before saving the item.");
    if (saveKind === "items" && (!/^[A-Z0-9]{6}$/.test(form.sku || "") || !/^\d{5,}$/.test(form.itemNumber || ""))) return toast.error("Wait for the generated SKU and Item No. before saving.");
    if (!salesDetailsOnly && linkedInventoryDocument && !documentInventoryReady) return toast.error("Wait for the selected inventory to load before saving.");
    if (saveKind === "contacts" && form.type === "customer") {
      const required = [form.company, form.name, form.phone, form.whatsapp, form.country, form.reseller, form.planet, form.currency];
      if (required.some((value) => !value?.trim())) return toast.error("Complete all required customer fields.");
    }
    if (saveKind === "contacts" && form.type === "vendor" && editingRecordId === null) {
      const required = [form.company, form.name, form.phone, form.country, form.currency];
      if (required.some((value) => !value?.trim())) return toast.error("Complete all required vendor fields.");
    }
    if (saveKind === "transactions" && ["bill", "vendor credit"].includes(form.type)) {
      const required = [form.party, form.number, form.transactionDate, form.currency, form.exchangeRate, form.billLocationId];
      if (required.some((value) => !value?.trim()) || Number(form.exchangeRate) <= 0) return toast.error("Complete the vendor, reference, date, inventory, currency and exchange rate.");
      if (lines.some(line => !Number.isFinite(Number(line.freightCharge || 0)) || Number(line.freightCharge || 0) < 0)) return toast.error("Freight charges must be valid non-negative amounts.");
      if (lines.some((line) => !line.description.trim() || Number(line.quantity) <= 0 || Number(line.unitPrice) < 0)) return toast.error("Complete every bill line with a description, positive quantity and valid rate.");
      if (form.type === "vendor credit" && !form.billId) return toast.error("Select the original supplier bill for this purchase return.");
    }
    if (saveKind === "transactions" && form.type === "bill payment" && !records.accounts.some((bank) => bank.active && (bank.type === "Bank" || bank.systemRole === "BANK") && bank.name === form.account && bank.currency === form.currency)) return toast.error("Select an active Pay From bank matching the payment currency.");
    if (saveKind === "transactions" && form.type === "cheque" && !records.accounts.some((bank) => bank.active && (bank.type === "Bank" || bank.systemRole === "BANK") && String(bank.id) === form.bankAccountId && String(bank.currency) === form.currency)) return toast.error("Select an active bank in the cheque currency for Pay From.");
    if (saveKind === "transactions" && form.type === "cheque" && !uaeChequeLayouts.some((layout) => layout.key === form.chequeBankKey)) return toast.error("Select the UAE bank cheque layout before saving.");
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
      const selectedLocationId = saveKind === "transactions" && ["bill", "vendor credit"].includes(form.type) ? Number(form.billLocationId || activeLocationId) : saveKind === "transactions" ? Number(form.transactionLocationId || activeLocationId) : activeLocationId;
      const response = await fetch("/api/records", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json", ...skuLock.headers }, body: JSON.stringify(salesDetailsOnly ? { kind: "transactions", id: editingRecordId, companyId: activeCompanyId, editMode: "details", revision: form.revision, number: form.number, transactionDate: form.transactionDate, dueDate: form.dueDate, terms: form.terms, salesman: form.salesman, memo: form.memo, ...(form.type === "invoice" ? { comments: form.comments, serialNumber: form.serialNumber, lineDetails: lines.filter(line => line.id).map(line => ({ id: line.id, comments: line.comments || "", serialNumber: line.serialNumber || "" })), appendLines: lines.filter(line => !line.id).map(line => ({ itemId: line.itemId, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, unitCost: line.unitCost, vatCode: line.vatCode, vatRate: line.vatRate, comments: line.comments || "", serialNumber: line.serialNumber || "" })) } : {}) } : { kind: saveKind, companyId: activeCompanyId, locationId: selectedLocationId, ...(editing ? { id: editingItem ? editingItemId : editingRecordId } : {}), ...form, ...(zeroVatPayment ? { vatRate: "0" } : {}), ...(saveKind === "transactions" ? { lines: submittedLines } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save record");
      let attachmentError = "";
      if (saveKind === "transactions" && form.type === "invoice" && invoiceFiles.length) {
        try {
          const upload = await fetch("/api/attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: activeCompanyId, entityType: "transaction", entityId: data.record.id, attachments: invoiceFiles }) });
          if (!upload.ok) attachmentError = (await upload.json()).error || "Upload failed.";
          else setInvoiceFiles([]);
        } catch (cause) { attachmentError = cause instanceof Error ? cause.message : "Upload failed."; }
      }
      setRecords((old) => ({ ...old, [saveKind]: editing ? old[saveKind].map((record) => record.id === data.record.id ? data.record : record) : [data.record, ...old[saveKind]] }));
      setDialogOpen(false); setEditorKind(null); setEditingItemId(null); setEditingRecordId(null); if (attachmentError) toast.error(`Invoice saved, but attachments failed: ${attachmentError} Open the invoice to add them again.`);
      else toast.success(data.generatedAccount ? `${data.generatedAccount.name} created and linked automatically` : editing ? "Changes saved" : "Record saved and posted");
      if (saveKind === "transactions" && selectedLocationId !== activeLocationId) setActiveLocationId(selectedLocationId);
      else await loadData();
      if (saveKind === "transactions" && form.type === "invoice") await loadWorkspaces();
      if (saveAndPrint && saveKind === "transactions" && form.type === "cheque") await openDetail(Number(data.record.id));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save record"); }
    finally { setSaving(false); }
  }

  async function removeRecord(id: number, kindOverride?: Kind) {
    const deletingKind = kindOverride ?? currentKind;
    try {
      const response = await fetch("/api/records", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: deletingKind, id, companyId: activeCompanyId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Delete failed");
      setRecords((old) => ({ ...old, [deletingKind]: old[deletingKind].filter((r) => r.id !== id) }));
      if (deletingKind === "transactions") await loadData();
      toast.success("Record deleted");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete record"); }
  }

  async function duplicateItem(id: number) {
    try {
      const source = records.items.find((item) => item.id === id);
      if (!source) throw new Error("The item to duplicate was not found.");
      const identity = await newItemIdentity();
      openItemEdit(source, identity);
      toast.info(`Duplicate draft ${identity.sku} is not saved. Press Save record to create it, or Cancel to discard it.`);
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
      setLines(data.lines.filter((line: DataRecord) => !line.isFreightCharge).map((line: DataRecord) => ({ id: line.id, sourceLineId: line.sourceLineId ? String(line.sourceLineId) : "", comments: String(line.comments ?? ""), serialNumber: String(line.serialNumber ?? ""), freightCharge: String(line.freightCharge || 0), itemId: line.itemId ? String(line.itemId) : "", description: String(line.description ?? ""), quantity: String(line.quantity), unitPrice: String(line.unitPrice), unitCost: String(Math.round((Number(line.unitPrice || 0) + Number(line.freightCharge || 0) / Math.max(Number(line.quantity || 0), Number.EPSILON)) * 100) / 100), vatCode: String(line.vatCode), vatRate: String(line.vatRate) })));
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

  async function openReport(key: string, period?: { start: string; end: string }, saved?: { locationId: number | null; currency: string; customer?: string; statementDate?: string; memo?: string; supplierId?: number }) {
    setReportLoading(true);
    try {
      const periodQuery = (period ? `&periodStart=${period.start}&periodEnd=${period.end}` : "") + `&customer=${encodeURIComponent(saved?.customer || "")}&statementDate=${encodeURIComponent(saved?.statementDate || "")}&memo=${encodeURIComponent(saved?.memo || "")}&supplierId=${saved?.supplierId || ""}`;
      const reportLocationId = saved?.locationId ?? activeLocationId;
      const reportCurrency = saved?.currency || baseCurrency;
      const response = await fetch(`/api/reports?type=${key}&companyId=${activeCompanyId}&locationId=${reportLocationId}&currency=${reportCurrency}${periodQuery}`, { signal: AbortSignal.timeout(30000), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate report");
      setReport(data.report);
      setReportContext({ key, locationId: reportLocationId, currency: reportCurrency, periodStart: period?.start ?? "", periodEnd: period?.end ?? "", supplierId: saved?.supplierId });
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
    <SidebarProvider data-user-theme={themeColor} data-appearance={appearanceMode} className="app-shell">
      <Sidebar collapsible="icon" className="brand-sidebar border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <SidebarHeader className="border-b border-white/8 px-3 py-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="brand-logo grid size-9 shrink-0 place-items-center rounded-lg text-sm font-black shadow-sm ring-1 ring-white/10">{activeCompanyInitials}</div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold tracking-wide text-white" title={activeCompanyName}>{activeCompanyName}</p>
              <p className="truncate text-[11px] text-slate-400">Enterprise Accounting</p>
            </div>
          </div>
          <div className="mt-3 group-data-[collapsible=icon]:hidden"><Select value={String(activeCompanyId || "")} onValueChange={(value) => { const company = companies.find((entry) => entry.id === Number(value)); setActiveCompanyId(Number(value)); setActiveLocationId(company?.locations[0]?.id ?? 0); setSearch(""); }}><SelectTrigger aria-label="Active company" className="w-full border-white/10 bg-white/6 text-white shadow-none hover:bg-white/10"><SelectValue placeholder="Select company" /></SelectTrigger><SelectContent>{companies.map((company) => <SelectItem key={company.id} value={String(company.id)}>{company.name}</SelectItem>)}</SelectContent></Select></div>
        </SidebarHeader>
        <SidebarContent className="px-2 py-3">
          {visibleNavGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-[10px] font-bold tracking-[.18em] text-slate-500">{group.label}</SidebarGroupLabel>
              <SidebarGroupContent><SidebarMenu>
                {group.items.map((item) => <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton tooltip={item.label} isActive={view === item.id} onClick={() => { setView(item.id as View); setSearch(""); }} className="brand-nav-item h-10 rounded-lg px-2.5 text-slate-300 hover:bg-white/8 hover:text-white">
                    <item.icon /><span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>)}
              </SidebarMenu></SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="border-t border-white/10 p-3">
          {currentUser.role === "admin" && <SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip="Companies & inventory" onClick={() => setWorkspaceOpen(true)} className="text-slate-400"><Settings /><span>Companies & inventory</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>}
          <div className="mt-1 flex items-center gap-3 rounded-xl border border-white/6 bg-white/5 p-2 group-data-[collapsible=icon]:hidden">
            {currentUser.avatarData ? <Image src={currentUser.avatarData} alt={`${currentUser.fullName || currentUser.email} profile`} width={32} height={32} unoptimized className="size-8 rounded-full border border-white/15 object-cover" /> : <div className="grid size-8 place-items-center rounded-full bg-slate-700 text-xs font-bold">{(currentUser.fullName || currentUser.email).slice(0, 2).toUpperCase()}</div>}
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{currentUser.fullName || roleLabels[currentUser.role]}</p><p className="truncate text-[11px] text-slate-500">{roleLabels[currentUser.role]} · {currentUser.email}</p></div>
            <Button type="button" variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={signOut} className="size-8 shrink-0 text-slate-400 hover:bg-white/10 hover:text-white"><LogOut className="size-4" /></Button>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="brand-workspace min-w-0">
        <header className="app-header sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/80 bg-background/92 px-3 py-2.5 shadow-[0_1px_0_rgb(15_23_42/0.02)] backdrop-blur-xl sm:px-5 lg:px-7">
          <div className="flex min-w-0 flex-1 items-center gap-3"><SidebarTrigger className="size-9 text-muted-foreground hover:text-foreground" /><div className="hidden h-5 w-px bg-border sm:block" /><div className="min-w-0"><h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">{heading.title}</h1><p className="hidden truncate text-xs text-muted-foreground sm:block">{heading.sub}</p></div></div>
          <div className="app-header-actions ml-auto flex max-w-full flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Appearance" title="Appearance"><Palette className="size-4" /></Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-4">
                <div><p className="font-semibold">Appearance</p><p className="text-sm text-muted-foreground">Saved to your account across the app.</p></div>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Display mode">
                  {(["light", "dark"] as const).map((mode) => <Button key={mode} type="button" variant={appearanceMode === mode ? "default" : "outline"} disabled={appearanceSaving} aria-pressed={appearanceMode === mode} onClick={() => changeAppearance(mode)}>{mode === "light" ? <Sun className="size-4" /> : <Moon className="size-4" />}{mode === "light" ? "Light" : "Dark"}</Button>)}
                </div>
                <div className="space-y-2"><p className="text-sm font-medium">Interface color</p><div className="grid grid-cols-2 gap-2" role="group" aria-label="Interface color">
                  {userThemes.map((theme) => <Button key={theme.value} type="button" variant="outline" disabled={themeSaving} aria-pressed={themeColor === theme.value} onClick={() => changeTheme(theme.value)} className="justify-start"><span className="size-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: theme.color }} />{theme.label}{themeColor === theme.value ? <Check className="ml-auto size-4" /> : null}</Button>)}
                </div></div>
              </PopoverContent>
            </Popover>
            <Badge variant="outline" className="hidden sm:inline-flex">{baseCurrency}</Badge>
            <Select value={String(activeLocationId || "")} onValueChange={(value) => { setActiveLocationId(Number(value)); setSearch(""); }}><SelectTrigger aria-label="Active inventory" className="w-[min(165px,42vw)] sm:w-[165px]"><SelectValue placeholder="Inventory" /></SelectTrigger><SelectContent>{activeLocations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}</SelectContent></Select>
            {!managementView && view !== "purchases" && view !== "sales" && view !== "employees" && canWriteCurrentView && <Button onClick={openCreate} className="brand-primary-button font-semibold"><Plus className="size-4" /><span className="hidden sm:inline">{createLabel}</span></Button>}
          </div>
          <div data-export-slot="page" className="flex w-full justify-end empty:hidden" />
        </header>

        <div className="app-content mx-auto w-full max-w-[1560px] px-3 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-7">
          {view === "serial-search" ? <SerialNumberSearch key={activeCompanyId} companyId={activeCompanyId} onOpen={openDetail} /> : view === "stock-pricing" ? <StockPricing key={activeCompanyId} companyId={activeCompanyId} onSaved={loadData} /> : view === "company-setup" ? <CompanySetupCenter canClearCompany={currentUser.role === "admin"} canSelectLoginBranding={currentUser.role === "admin"} key={activeCompanyId} setup={companySetup} onSaved={async (saved) => { setCompanySetup(saved); await loadWorkspaces(); }} /> : view === "letterhead" ? <LetterheadCenter key={activeCompanyId} company={companySetup} onSaved={(saved) => setCompanySetup(saved as CompanySetup)} /> : view === "warranties" ? <WarrantyCenter key={activeCompanyId} companyId={activeCompanyId} company={companySetup} canWrite={canWriteCurrentView} /> : view === "inventory-overview" ? <InventoryOverview /> : view === "item-logistics" ? <ItemLogisticsCenter key={`${activeCompanyId}-${activeLocationId}`} companyId={activeCompanyId} companyName={activeCompany?.name ?? "Company"} locationId={activeLocationId} locationName={activeLocations.find((location) => location.id === activeLocationId)?.name ?? "Inventory"} canEdit={canWriteCurrentView} /> : view === "inventory-check-reports" ? <InventoryCheckReports key={`${activeCompanyId}-${activeLocationId}`} companyId={activeCompanyId} companyName={activeCompany?.name ?? "Company"} locationId={activeLocationId} locationName={activeLocations.find((location) => location.id === activeLocationId)?.name ?? "Inventory"} canManage={currentUser.role === "admin"} currentUserName={currentUser.fullName || currentUser.email} /> : view === "transfers" ? <MultiLineTransferCenter key={`${activeCompanyId}-${activeLocationId}`} companies={companies} activeLocationId={activeLocationId} onTransferred={loadData} /> : view === "journal-entries" ? <JournalEntryCenter exchangeRates={exchangeRates} onOpenSource={openDetail} key={`${activeCompanyId}-${activeLocationId}`} companyId={activeCompanyId} companyName={activeCompany?.name ?? "Company"} locationId={activeLocationId} locationName={activeLocations.find((location) => location.id === activeLocationId)?.name ?? "Inventory"} currency={baseCurrency} accounts={records.accounts.map((account) => ({ id: account.id, code: String(account.code), name: String(account.name), type: String(account.type), active: Boolean(account.active), currency: String(account.currency || baseCurrency) }))} onPosted={loadData} /> : view === "vat-management" ? <VatManagementCenter key={`${activeCompanyId}-${activeLocationId}`} companyId={activeCompanyId} companyName={activeCompany?.name ?? "Company"} locationId={activeLocationId} locationName={activeLocations.find((location) => location.id === activeLocationId)?.name ?? "Inventory"} currency={baseCurrency} canWrite={canWriteCurrentView} canManageCodes={currentUser.role === "admin"} onOpenReport={openReport} onManageCodes={() => setView("vat-codes")} /> : view === "currencies" ? <CurrencyRateCenter key={activeCompanyId} company={activeCompany} currencies={currencies} onCompanyChanged={loadWorkspaces} onRatesChanged={loadExchangeRates} /> : view === "vat-codes" ? <VatCodeCenter key={activeCompanyId} companyId={activeCompanyId} company={companySetup} onChanged={loadVatCodes} onOpenDocument={openDetail} /> : view === "admin-controls" ? <AdminSettingsCenter key={activeCompanyId} companyId={activeCompanyId} companyName={activeCompany?.name ?? "Company"} currentUserEmail={currentUser.email} /> : managementView ? <WorkspaceCenter mode={view as "companies" | "inventories" | "invoice-series" | "currencies"} companies={companies} activeCompanyId={activeCompanyId} canDeleteCompanies={Boolean(currentUser.isAllAdmin)} onChanged={loadWorkspaces} /> : view === "dashboard" ? <Dashboard metrics={metrics} records={records} companyName={activeCompany?.name ?? "Company"} currency={baseCurrency} themeColor={themeColor} themeSaving={themeSaving} onThemeChange={changeTheme} onNavigate={(next) => { if (roleViews[currentUser.role].includes(next)) setView(next); else toast.error("Your role does not allow this action."); }} onWorkflow={(type, target) => { if (!roleViews[currentUser.role].includes(target) || !roleWriteViews[currentUser.role].includes(target)) return toast.error("Your role does not allow this action."); setView(target); openTransaction(type); }} onCreate={openCreate} onOpenDetail={openDetail} canCreate={roleWriteViews[currentUser.role].includes("sales")} canViewReports={roleViews[currentUser.role].includes("reports")} canManageBillAttachments={roleWriteViews[currentUser.role].includes("purchases")} /> : view === "reports" ? <ReportCenter key={activeCompanyId} canViewHr={currentUser.role === "admin"} companyId={activeCompanyId} locationId={activeLocationId} baseCurrency={baseCurrency} vendors={reportVendors} vendorCurrencies={reportVendorCurrencies} memorisedReports={memorisedReports} onOpen={(key, options) => openReport(key, undefined, { locationId: activeLocationId, currency: options?.currency || baseCurrency, supplierId: options?.supplierId })} onOpenMemorised={op