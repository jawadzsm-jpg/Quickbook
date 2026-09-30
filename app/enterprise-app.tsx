"use client";
import { FinancialReport } from "./financial-report";
import type { FinancialReportData } from "@/lib/financial-reports";
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
import { reportAttachmentId } from "@/lib/report-attachments";
import { bankingDetailTarget, bankingReportKeys, bankingSummary } from "@/lib/banking-report";
import { accountantDetailTarget, accountantReportKeys, accountantSummary } from "@/lib/accountant-report";
import { listDetailTarget, listReportKeys, listSummary } from "@/lib/list-report";
import { employeeDetailTarget, employeeReportKeys, employeeSummary as employeeReportSummary } from "@/lib/employee-report";
import { convertInvoiceLines, invoiceCurrencyAmount, validDocumentRate, type PricedInvoiceLine } from "@/lib/invoice-pricing";
import { dueDateForPaymentTerms } from "@/lib/payment-terms";
import { inferUaeChequeLayout, uaeChequeLayouts } from "@/lib/uae-cheque-layouts";
import { applyContactCurrency, customerReceivableAccount, vendorPayableAccount } from "@/lib/contact-currency";
import { countries } from "@/lib/countries";
import { generatedItemDescription, inventoryItemDetails, inventoryItemTitle, type ItemSpecification } from "@/lib/item-description";
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
import { ItemCustomizationCenter } from "@/app/item-customization-center";
import { UserRoleCenter } from "@/app/user-role-center";
import { VatCodeCenter, type VatCodeRecord } from "@/app/vat-code-center";
import { CurrencyRateCenter, type ExchangeRateRecord } from "@/app/currency-rate-center";
import { JournalEntryCenter } from "@/app/journal-entry-center";
import { VatManagementCenter } from "@/app/vat-management-center";
import { RcmDeclarationGenerator } from "@/app/rcm-declaration-generator";

import { SerialNumberSearch } from "./serial-number-search";

type View = "serial-search" | "stock-pricing" | "dashboard" | "inventory-overview" | "sales" | "receive-payment" | "purchases" | "write-cheque" | "customers" | "warranties" | "vendors" | "inventory" | "customization-details" | "item-logistics" | "inventory-check-reports" | "transfers" | "banking" | "journal-entries" | "accounts" | "vat-management" | "rcm-declaration" | "employees" | "reports" | "companies" | "company-setup" | "letterhead" | "inventories" | "invoice-series" | "currencies" | "vat-codes" | "admin-controls";
type AppRole = "admin" | "accountant" | "sales" | "purchasing" | "inventory" | "customization" | "viewer";
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
    { id: "customization-details", label: "Customization Details", icon: PackageCheck },
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
    { id: "rcm-declaration", label: "RCM Declaration", icon: ShieldCheck },
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
  customization: "Product Customization",
  viewer: "Viewer",
};

const roleViews: Record<AppRole, readonly View[]> = {
  admin: navGroups.flatMap((group) => group.items.map((item) => item.id)),
  accountant: ["serial-search", "dashboard", "inventory-overview", "inventory-check-reports", "sales", "receive-payment", "customers", "warranties", "purchases", "write-cheque", "vendors", "banking", "journal-entries", "accounts", "vat-management", "rcm-declaration", "reports"],
  sales: ["serial-search", "dashboard", "inventory-overview", "inventory-check-reports", "sales", "receive-payment", "customers", "warranties"],
  purchasing: ["serial-search", "dashboard", "inventory-overview", "inventory-check-reports", "purchases", "write-cheque", "vendors", "rcm-declaration"],
  inventory: ["serial-search", "dashboard", "inventory-overview", "inventory", "customization-details", "item-logistics", "inventory-check-reports", "transfers"],
  customization: ["dashboard", "inventory-overview", "customization-details"],
  viewer: ["serial-search", "dashboard", "inventory-overview", "inventory-check-reports", "reports"],
};

const roleWriteViews: Record<AppRole, readonly View[]> = {
  admin: ["sales", "receive-payment", "customers", "warranties", "purchases", "write-cheque", "vendors", "inventory", "customization-details", "item-logistics", "inventory-check-reports", "transfers", "banking", "journal-entries", "accounts", "employees", "companies", "inventories", "invoice-series", "currencies", "vat-codes", "admin-controls"],
  accountant: ["sales", "receive-payment", "customers", "warranties", "purchases", "write-cheque", "vendors", "banking", "journal-entries", "accounts", "vat-management"],
  sales: ["sales", "receive-payment", "customers", "warranties"],
  purchasing: ["purchases", "write-cheque", "vendors"],
  inventory: ["inventory", "customization-details", "item-logistics", "transfers"],
  customization: ["customization-details"],
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
  "customization-details": { title: "Customization Details", sub: "RAM, storage, product identifiers and user-facing details" },
  "item-logistics": { title: "HS Code, COO & Dimensions", sub: "Maintain customs classifications, country of origin, dimensions and weight" },
  "inventory-check-reports": { title: "Inventory Check Reports", sub: "Select in-stock items and compare quantities across your companies" },
  transfers: { title: "Stock Transfers", sub: "Move stock between companies and inventory locations" },
  banking: { title: "Banking", sub: "Deposits, cheques, transfers and account activity" },
  "journal-entries": { title: "General Journal Entries", sub: "Post balanced debits and credits directly to the ledger" },
  accounts: { title: "Chart of Accounts", sub: "Assets, liabilities, equity, income and expenses" },
  "vat-management": { title: "VAT Management", sub: "Review, adjust, report and file VAT" },
  "rcm-declaration": { title: "RCM Declaration Generator", sub: "Prepare UAE electronic-device reverse-charge declarations" },
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
  ["Inventory Stock Aging Report", "Current stock aged from its latest posted receipt or supplier bill", "Inventory", "inventory-stock-aging"],
  ["Negative Item List", "Active stock items below zero with shortage quantity and value", "Inventory", "negative-item-list"],
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
  { id: -1, companyId: 0, code: "STANDARD", name: "Standard rated", label: "STANDARD Â· Standard rated Â· 5%", rate: 5, description: "Standard UAE VAT rate", active: true, system: true },
  { id: -2, companyId: 0, code: "ZERO", name: "Zero rated", label: "ZERO Â· Zero rated Â· 0%", rate: 0, description: "Taxable supply charged at 0%", active: true, system: true },
  { id: -3, companyId: 0, code: "EXEMPT", name: "Exempt", label: "EXEMPT Â· Exempt Â· 0%", rate: 0, description: "Supply exempt from VAT", active: true, system: true },
  { id: -4, companyId: 0, code: "REVERSE_CHARGE", name: "Reverse charge", label: "REVERSE CHARGE Â· Reverse charge Â· 5%", rate: 5, description: "UAE reverse-charge supply reported in VAT201 Boxes 3 and 10", active: true, system: true },
  { id: -5, companyId: 0, code: "IMPORT_GOODS", name: "Goods imported into the UAE", label: "IMPORT GOODS Â· Goods imported into the UAE Â· 5%", rate: 5, description: "Requires Bill of Entry No., Airway Bill No. and supporting documents", active: true, system: true },
  { id: -6, companyId: 0, code: "OUT_OF_SCOPE", name: "Out of scope", label: "OUT OF SCOPE Â· Out of scope Â· 0%", rate: 0, description: "Transaction outside the scope of VAT", active: true, system: true },
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
const defaultPostingAccount = (type: string, accounts: DataRecord[], currency?: string) => {
  if (["bill", "purchase order"].includes(type)) return linkedAccountName(accounts, "AP", "Accounts Payable", currency);
  if (type === "bill payment") return linkedAccountName(accounts, "BANK", "Business Bank");
  if (["item receipt", "received item bill"].includes(type)) return linkedAccountName(accounts, "SUSPENSE", "Suspense");
  if (type === "cheque") return linkedAccountName(accounts, "AP", "Accounts Payable");
  if (type === "customer payment") return String(accounts.find((account) => account.active && (account.type === "Bank" || account.systemRole === "BANK"))?.name ?? "");
  if (["invoice", "estimate", "proforma invoice", "sales order"].includes(type)) return linkedAccountName(accounts, "AR", "Accounts Receivable", currency);
  if (["quotation", "sales receipt", "statement charge", "credit memo"].includes(type)) return linkedAccountName(accounts, "SALES", "Sales Revenue");
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
    if (specifications.length) return generatedItemDescription(specifications, item.name, item.sku, item.itemNumber);
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
  const usesImportGoodsVat = form.type === "bill" && lines.some((line) => line.vatCode === "IMPORT_GOODS");
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
      const activeCodes = (data.codes as VatCodeRecord[]).filter((code) => code.active).map((code) => ({ ...code, label: `${code.code} Â· ${code.name} Â· ${Number(code.rate).toLocaleString()}%` }));
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
  const managementView = view === "serial-search" || view === "inventory-overview" || view === "customization-details" || view === "item-logistics" || view === "inventory-check-reports" || view === "transfers" || view === "journal-entries" || view === "vat-management" || view === "rcm-declaration" || view === "companies" || view === "company-setup" || view === "letterhead" || view === "inventories" || view === "invoice-series" || view === "currencies" || view === "vat-codes" || view === "admin-controls";
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
    setForm({ type, number: `${prefix}-${String(records.transactions.length + 1).padStart(4, "0")}`, transactionDate: today(), dueDate: today(), terms: type === "cheque" ? "account-payee" : "Due on receipt", chequeBankKey: type === "cheque" ? "other-uae-bank" : "", status: "open", account: defaultPostingAccount(type, records.accounts, baseCurrency), vatRate: taxFree ? "0" : "5", currency: baseCurrency, exchangeRate: "1", billLocationId: String(activeLocationId), transactionLocationId: String(activeLocationId), salesman: "", isImport: "false", freightCharges: "0" });
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
      if (form.type === "vendor credit" && !form.billId)×N¶ãÛh‘éì¶»§q«^vU&FR"G—SÒ&çVÖ&W""f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò&WV—&VBóà¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃç¶—5G&ç6fW"ò%G&ç6fW"g&öÒ"¢—46&Bò$W‡Vç6R66÷VçB"¢—4÷&FW"ò$&æ²66÷VçB"¢$FW÷6—B6÷W&6R'Ò£ÂôÆ&VÃãÅ6VÆV7BfÇVS×¶f÷&Òæ66÷VçBÇÂVæFVf–æVGÒöåfÇVT6†ævS×²†66÷VçB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ66÷VçBÂâââ†—5G&ç6fW"bbf÷&Òç'G’ÓÓÒ66÷VçBò²'G“¢""Ò¢·Ò’Ò—ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRÆ6V†öÆFW#Ò%6VÆV7B66÷VçB"óãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCç·6VÆV7F&ÆT66÷VçG2æÖ‚†66÷VçB’ÓâÅ6VÆV7D—FVÒ¶W“×¶66÷VçBæ–GÒfÇVS×µ7G&–ær†66÷VçBææÖR—Óç¶—5G&ç6fW"òG&ç6fW$&æ´Æ&VÂ†66÷VçB’¢G¶66÷VçBæ6öFWÒ+rG¶66÷VçBææÖWÖÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7Cç¶—5G&ç6fW"bbÇ6Æ74æÖSÒ'&÷VæFVBÖÖB&÷&FW"&r×v†—FRÓ2FW‡B×6ÒföçB×6VÖ–&öÆB"&–ÖÆ—fSÒ'öÆ—FR#ç·G&ç6fW$&Ææ6R†g&öÔ&æ²—ÓÂ÷çÓÂöF—cà¢¶—5G&ç6fW"òÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃåG&ç6fW"Fò£ÂôÆ&VÃãÅ6VÆV7BfÇVS×¶f÷&Òç'G’ÇÂVæFVf–æVGÒöåfÇVT6†ævS×²‡'G’’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ'G’Ò—ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRÆ6V†öÆFW#Ò%6VÆV7BFW7F–æF–öâ&æ²"óãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCç¶&æ·2æf–ÇFW"‚†66÷VçB’Óâ7G&–ær†66÷VçBææÖR’ÓÒf÷&Òæ66÷VçB’æÖ‚†66÷VçB’ÓâÅ6VÆV7D—FVÒ¶W“×¶66÷VçBæ–GÒfÇVS×µ7G&–ær†66÷VçBææÖR—Óç·G&ç6fW$&æ´Æ&VÂ†66÷VçB—ÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÇ6Æ74æÖSÒ'&÷VæFVBÖÖB&÷&FW"&r×v†—FRÓ2FW‡B×6ÒföçB×6VÖ–&öÆB"&–ÖÆ—fSÒ'öÆ—FR#ç·G&ç6fW$&Ææ6R‡Fô&æ²—ÓÂ÷ãÂöF—câ¢—46&BÇÂ—4÷&FW"òÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃç¶—4÷&FW"ò%7WÆ–W""¢%fVæF÷"ò–VR'Ò£ÂôÆ&VÃãÅ6VÆV7BfÇVS×¶f÷&Òç'G’ÇÂVæFVf–æVGÒöåfÇVT6†ævS×·6VÆV7EfVæF÷'ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRÆ6V†öÆFW#Ò%6VÆV7BfVæF÷""óãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCç·fVæF÷'2æÖ‚‡fVæF÷"’ÓâÅ6VÆV7D—FVÒ¶W“×·fVæF÷"æ–GÒfÇVS×µ7G&–ær‡fVæF÷"ææÖR—Óçµ7G&–ær‡fVæF÷"æ6ö×ç’ÇÂfVæF÷"ææÖR—Ò+rµ7G&–ær‡fVæF÷"æ7W'&Væ7’—ÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÂöF—câ¢Äf–VÆBÆ&VÃÒ%&V6V—fVBg&öÒ"æÖSÒ''G’"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò&WV—&VBÆ6V†öÆFW#Ò$7W7FöÖW"Â÷væW"Â÷"÷F†W"6÷W&6R"óçĞ¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&w&–BvÓB&÷VæFVB×†Â&÷&FW"&r×v†—FRÓBÖC¦w&–BÖ6öÇ2Ó"†Ã¦w&–BÖ6öÇ2ÓB#à¢ÆF—b6Æ74æÖSÒ'76R×’Ó"†Ã¦6öÂ×7âÓ"#ãÄÆ&VÃç¶—4÷&FW"ò$÷&FW"FWF–Ç2"¢$FW67&—F–öâ'Ò£ÂôÆ&VÃãÄ–çWB&WV—&VBfÇVS×¶Æ–æRæFW67&—F–öçÒöä6†ævS×²†WfVçB’ÓâWFFTÆ–æR‡²FW67&—F–öã¢WfVçBçF&vWBçfÇVRÒ—ÒóãÂöF—cà¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃç¶—4÷&FW"ò$W7F–ÖFVB6÷7B"¢$Ö÷VçB'Ò¶—4÷&FW"ò""¢"¢'ÓÂôÆ&VÃãÄ–çWBG—SÒ&çVÖ&W""Ö–ã×¶—4÷&FW"ò#"¢#ã'Ò7FWÒ#ã"fÇVS×¶Æ–æRçVæ—E&–6WÒöä6†ævS×²†WfVçB’ÓâWFFTÆ–æR‡²Væ—E&–6S¢WfVçBçF&vWBçfÇVRÂVæ—D6÷7C¢WfVçBçF&vWBçfÇVRÒ—Ò&WV—&VBóãÂöF—cà¢¶—46&BòÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃådB6öFSÂôÆ&VÃãÅ6VÆV7BfÇVS×¶Æ–æRçfD6öFWÒöåfÇVT6†ævS×²‡fD6öFR’ÓâWFFTÆ–æR‡²fD6öFRÂfE&FS¢fE&FTf÷$6öFR‡fD6öFRÂfD6öFT÷F–öç2’Ò—ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRóãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCç·fD6öFT÷F–öç2æÖ‚†÷F–öâ’ÓâÅ6VÆV7D—FVÒ¶W“×¶÷F–öâæ6öFWÒfÇVS×¶÷F–öâæ6öFWÓç¶÷F–öâæÆ&VÇÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÂöF—câ¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃådB6öFSÂôÆ&VÃãÄ–çWB&VDöæÇ’fÇVSÒ%¤U$ò+rR"6Æ74æÖSÒ&&r×6ÆFRÓ"óãÂöF—cçĞ¢ÆF—b6Æ74æÖSÒ&ÖC¦6öÂ×7âÓ"†Ã¦6öÂ×7âÓ2#ãÄf–VÆBÆ&VÃÒ$ÖVÖò"æÖSÒ&ÖVÖò"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×ÒÆ6V†öÆFW#Ò$÷F–öæÂæ÷FR"óãÂöF—cà¢ÆF—b6Æ74æÖSÒ'&÷VæFVBÖÆr&r×6ÆFRÓ“Ó2FW‡B×&–v‡BFW‡B×v†—FR#ãÇ6Æ74æÖSÒ'FW‡B×‡2FW‡B×6ÆFRÓC#åF÷FÃÂ÷ãÇ6Æ74æÖSÒ&föçBÖ&öÆB#ç¶f÷&ÖDÖöæW’†Ö÷VçB²fBÂf÷&Òæ7W'&Væ7’—ÓÂ÷ãÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖS×¶&÷VæFVBÖÆr&÷&FW"ÓBFW‡B×6ÒG¶—46&Bbb†47&VF—D6&Bò&&÷&FW"ÖÖ&W"Ó#&rÖÖ&W"ÓSFW‡BÖÖ&W"Ó“"¢&&÷&FW"ÖVÖW&ÆBÓ#&rÖVÖW&ÆBÓSFW‡BÖVÖW&ÆBÓ“'ÖÓç¶—4÷&FW"ò%F†—2÷&FW"—26fVBf÷"G&6¶–æræBFöW2æ÷B÷7BFòF†RÆVFvW"â"¢—5G&ç6fW"ò%F†RÖ÷VçB—27&VF—FVBg&öÒF†R6÷W&6R&æ²æBFV&—FVBFòF†RFW7F–æF–öâ&æ²â"¢—46&Bbb†47&VF—D6&Bò$FBâ7F—fR7&VF—B6&B66÷VçB–â6†'Böb66÷VçG2&Vf÷&R6f–ærF†—26†&vRâ"¢—46&Bò%F†RW‡Vç6RæB&V6÷fW&&ÆRdB&R÷7FVBv–ç7BF†RÆ–æ¶VB7&VF—BÖ6&B66÷VçBâ"¢%F†RÆ–æ¶VB&æ²66÷VçB—2FV&—FVBæBF†R6VÆV7FVB6÷W&6R66÷VçB—27&VF—FVBâ'ÓÂöF—cà¢ÂöF—cã°§Ğ¦gVæ7F–öâG&ç67F–öäf–VÆG2‡²f÷&ÒÂ6WDf÷&ÒÂöå–&ÆU&W6öÇfVBÂG—W2Â—FV×2Â6öçF7G2Â66÷VçG2ÂÆö6F–öç2ÂÆ–æW2Â6WDÆ–æW2ÂfD6öFT÷F–öç2ÂW†6†ævU&FW2Â&6T7W'&Væ7’Ó¢²f÷&Ó¢&V6÷&CÇ7G&–ærÂ7G&–æsã²6WDf÷&Ó¢†f÷&Ó¢&V6÷&CÇ7G&–ærÂ7G&–æsâ’Óâfö–C²öå–&ÆU&W6öÇfVC¢‡'G“¢7G&–ærÂ7W'&Væ7“¢7G&–ærÂ66÷VçCó¢7G&–ær’Óâfö–C²G—W3¢7G&–æuµÓ²—FV×3¢FF&V6÷&EµÓ²6öçF7G3¢FF&V6÷&EµÓ²66÷VçG3¢FF&V6÷&EµÓ²Æö6F–öç3¢–çfVçF÷'”Æö6F–öåµÓ²Æ–æW3¢Æ–æTf÷&ÕµÓ²6WDÆ–æW3¢†Æ–æW3¢Æ–æTf÷&ÕµÒ’Óâfö–C²fD6öFT÷F–öç3¢fD6öFT÷F–öåµÓ²W†6†ævU&FW3¢W†6†ævU&FU&V6÷&EµÓ²&6T7W'&Væ7“¢7G&–ærÒ’°¢–b†f÷&ÒçG—RÓÓÒ&&–ÆÂ"’&WGW&âÄ&–ÆÄf–VÆG2f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò—FV×3×¶—FV×7ÒfVæF÷'3×¶6öçF7G2æf–ÇFW"‚†6öçF7B’Óâ6öçF7BçG—RÓÓÒ'fVæF÷""—Ò6ÆW6ÖVã×¶6öçF7G2æf–ÇFW"‚†6öçF7B’Óâ6öçF7BçG—RÓÓÒ&V×Æ÷–VR"—Ò66÷VçG3×¶66÷VçG7ÒÆö6F–öç3×¶Æö6F–öç7ÒÆ–æW3×¶Æ–æW7Ò6WDÆ–æW3×·6WDÆ–æW7ÒfD6öFT÷F–öç3×·fD6öFT÷F–öç7ÒW†6†ævU&FW3×¶W†6†ævU&FW7Ò&6T7W'&Væ7“×¶&6T7W'&Væ7—Òóã°¢–b…²&7W7FöÖW"–ÖVçB"Â&&–ÆÂ–ÖVçB"Â&6†WVR%Òæ–æ6ÇVFW2†f÷&ÒçG—R’’&WGW&âÄ66…G&ç67F–öäf–VÆG2f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò6öçF7G3×¶6öçF7G7Ò66÷VçG3×¶66÷VçG7ÒÆö6F–öç3×¶Æö6F–öç7ÒÆ–æW3×¶Æ–æW7Ò6WDÆ–æW3×·6WDÆ–æW7ÒfD6öFT÷F–öç3×·fD6öFT÷F–öç7ÒW†6†ævU&FW3×¶W†6†ævU&FW7Ò&6T7W'&Væ7“×¶&6T7W'&Væ7—Òóã°¢–b…²&FW÷6—B"Â'G&ç6fW""Â&7&VF—B6&B6†&vR"Â&6†WVR÷&FW"%Òæ–æ6ÇVFW2†f÷&ÒçG—R’’&WGW&âÄ&æµG&ç67F–öäf–VÆG2f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò6öçF7G3×¶6öçF7G7Ò66÷VçG3×¶66÷VçG7ÒÆö6F–öç3×¶Æö6F–öç7ÒÆ–æW3×¶Æ–æW7Ò6WDÆ–æW3×·6WDÆ–æW7ÒfD6öFT÷F–öç3×·fD6öFT÷F–öç7ÒW†6†ævU&FW3×¶W†6†ævU&FW7Ò&6T7W'&Væ7“×¶&6T7W'&Væ7—Òóã°¢6öç7BWFFRÒ†–æFWƒ¢çVÖ&W"Â6†ævW3¢'F–ÃÄÆ–æTf÷&Óâ’Óâ6WDÆ–æW2†Æ–æW2æÖ‚†Æ–æRÂ÷6—F–öâ’Óâ÷6—F–öâÓÓÒ–æFW‚ò²ââæÆ–æRÂâââ†6†ævW2çVæ—E&–6RÓÒVæFVf–æVBò²†öÖUVæ—E&–6S¢VæFVf–æVBÒ¢·Ò’Âââæ6†ævW2Ò¢Æ–æR’“°¢6öç7B7W7FöÖW$Fö7VÖVçBÒ²&–çfö–6R"Â'6ÆW2&V6V—B"Â'V÷FF–öâ"Â&W7F–ÖFR"Â'&öf÷&Ö–çfö–6R"Â'6ÆW2÷&FW""Â&7&VF—BÖVÖò"Â'7FFVÖVçB6†&vR"Â&f–ææ6R6†&vR%Òæ–æ6ÇVFW2†f÷&ÒçG—R“°¢6öç7BW&6†6TFö7VÖVçBÒ²&&–ÆÂ"Â'W&6†6R÷&FW""Â&—FVÒ&V6V—B"Â'&V6V—fVB—FVÒ&–ÆÂ"Â'fVæF÷"7&VF—B%Òæ–æ6ÇVFW2†f÷&ÒçG—R“°¢6öç7B&V6V—f&ÆTFö7VÖVçBÒ²&–çfö–6R"Â&W7F–ÖFR"Â'&öf÷&Ö–çfö–6R"Â'6ÆW2÷&FW"%Òæ–æ6ÇVFW2†f÷&ÒçG—R“°¢6öç7B–&ÆTFö7VÖVçBÒf÷&ÒçG—RÓÓÒ'W&6†6R÷&FW"#°¢6öç7B÷7F–æt66÷VçG2Ò66÷VçG2æf–ÇFW"‚†66÷VçB’Óâ66÷VçBæ7F—fRbb66÷VçBç7—7FVÕ&öÆRbb‡&V6V—f&ÆTFö7VÖVç@¢ò66÷VçBç7—7FVÕ&öÆRÓÓÒ$""bb7G&–ær†66÷VçBæ7W'&Væ7’’ÓÓÒf÷&Òæ7W'&Væ7¢¢–&ÆTFö7VÖVçBò66÷VçBç7—7FVÕ&öÆRÓÓÒ$"bb7G&–ær†66÷VçBæ7W'&Væ7’’ÓÓÒf÷&Òæ7W'&Væ7¢¢66÷VçBç7—7FVÕ&öÆRÓÒ$"ÇÂ66÷VçBæ7W'&Væ7’ÓÓÒf÷&Òæ7W'&Væ7’’“°¢6öç7B&W6öÇfUW&6†6T÷&FW$66÷VçBÒ†æW‡C¢&V6÷&CÇ7G&–ærÂ7G&–æsâ’Óâ°¢6öç7B66÷VçBÒfVæF÷%–&ÆT66÷VçB†6öçF7G2Â66÷VçG2ÂæW‡Bç'G’ÂæW‡Bæ7W'&Væ7’“°¢6†ævT–çfö–6Tf÷&Ò‡²ââææW‡BÂ66÷VçBÂ–&ÆT66÷VçE&W6öÇfVC¢""Â–&ÆT66÷VçEVæF–æs¢66÷VçBÇÂæW‡Bç'G’ò""¢'G'VR"Ò“°¢–b†66÷VçBÇÂæW‡Bç'G’’&WGW&ã°¢fö–B†7–æ2‚’Óâ°¢G'’°¢6öç7B&W7öç6RÒv—BfWF6‚‚"ö’÷&V6÷&G2"Â²ÖWF†öC¢%õ5B"Â†VFW'3¢²$6öçFVçBÕG—R#¢&Æ–6F–öâö§6öâ"ÒÂ&öG“¢¥4ôâç7G&–æv–g’‡²7F–öã¢'&W6öÇfR×fVæF÷"×–&ÆR"Â6ö×ç”–C¢Æö6F–öç5³Óòæ6ö×ç”–BÂ'G“¢æW‡Bç'G’Â7W'&Væ7“¢æW‡Bæ7W'&Væ7’Ò’Ò“°¢6öç7BFFÒv—B&W7öç6Ræ§6öâ‚“°¢–b‚&W7öç6Ræö²’F‡&÷ræWrW'&÷"†FFæW'&÷"ÇÂ$6÷VÆBæ÷Bf–æBF†RfVæF÷"–&ÆR66÷VçBâ"“°¢öå–&ÆU&W6öÇfVB†æW‡Bç'G’ÂæW‡Bæ7W'&Væ7’Â7G&–ær†FFæ66÷VçBææÖR’“°¢Ò6F6‚†W'&÷"’°¢öå–&ÆU&W6öÇfVB†æW‡Bç'G’ÂæW‡Bæ7W'&Væ7’“°¢Fö7BæW'&÷"†W'&÷"–ç7Fæ6VöbW'&÷"òW'&÷"æÖW76vR¢$6÷VÆBæ÷Bf–æBF†RfVæF÷"–&ÆR66÷VçBâ"“°¢Ğ¢Ò’‚“°¢Ó°¢6öç7B6VÆV7F&ÆT—FV×2Ò—FV×2æf–ÇFW"†—FVÔ6ä&TFö7VÖVçDÆ–æR“°¢6öç7BFö7VÖVçE&FRÒÖF‚æÖ‚„çVÖ&W"†f÷&ÒæW†6†ævU&FR’ÇÂÂçVÖ&W"äU4”Äôâ“°¢6öç7B6†ævT–çfö–6Tf÷&ÒÒ†æW‡C¢&V6÷&CÇ7G&–ærÂ7G&–æsâ’Óâ°¢6öç7BæW‡Df÷&ÒÒ&V6V—f&ÆTFö7VÖVçBò°¢ââææW‡BÀ¢66÷VçC¢7W7FöÖW%&V6V—f&ÆT66÷VçB†6öçF7G2Â66÷VçG2ÂæW‡Bç'G’ÂæW‡Bæ7W'&Væ7’¢ÇÂÆ–æ¶VD66÷VçDæÖR†66÷VçG2Â$""Â$66÷VçG2&V6V—f&ÆR"ÂæW‡Bæ7W'&Væ7’’À¢Ò¢æW‡C°¢–b‚7W7FöÖW$Fö7VÖVçBÇÂ†æW‡Df÷&Òæ7W'&Væ7’ÓÓÒf÷&Òæ7W'&Væ7’bbæW‡Df÷&ÒæW†6†ævU&FRÓÓÒf÷&ÒæW†6†ævU&FR’’²6WDf÷&Ò†æW‡Df÷&Ò“²&WGW&ã²Ğ¢G'’°¢6öç7BöÆE&FRÒf÷&Òæ7W'&Væ7’ÓÓÒ&6T7W'&Væ7’ò¢fÆ–DFö7VÖVçE&FR†f÷&ÒæW†6†ævU&FR“°¢6öç7BæWu&FRÒæW‡Df÷&Òæ7W'&Væ7’ÓÓÒ&6T7W'&Væ7’ò¢fÆ–DFö7VÖVçE&FR†æW‡Df÷&ÒæW†6†ævU&FR“°¢6WDÆ–æW2†6öçfW'D–çfö–6TÆ–æW2†Æ–æW2ÂöÆE&FRÂæWu&FR’“°¢6WDf÷&Ò‡²ââææW‡Df÷&ÒÂW†6†ævU&FS¢7G&–ær†æWu&FR’Ò“°¢Ò6F6‚†W'&÷"’°¢Fö7BæW'&÷"†W'&÷"–ç7Fæ6VöbW'&÷"òW'&÷"æÖW76vR¢%6WBF†R7W'&Væ7’W†6†ævR&FRf—'7Bâ"“°¢Ğ¢Ó°¢6öç7BFEG&ç67F–öäÆ–æRÒ‚’Óâ6WDÆ–æW2…²ââæÆ–æW2Â²—FVÔ–C¢""ÂFW67&—F–öã¢""ÂVçF—G“¢#"ÂVæ—E&–6S¢#"ÂVæ—D6÷7C¢#"ÂfD6öFS¢f÷&ÒçfE&FRÓÓÒ#"ò%¤U$ò"¢%5DäD$B"ÂfE&FS¢f÷&ÒçfE&FRóò#R"ÕÒ“°¢6öç7B7V'F÷FÂÒÆ–æW2ç&VGV6R‚‡7VÒÂÆ–æR’Óâ7VÒ²çVÖ&W"†Æ–æRçVçF—G’ÇÂ’¢çVÖ&W"†Æ–æRçVæ—E&–6RÇÂ’Â“°¢6öç7BfBÒÆ–æW2ç&VGV6R‚‡7VÒÂÆ–æR’Óâ7VÒ²çVÖ&W"†Æ–æRçVçF—G’ÇÂ’¢çVÖ&W"†Æ–æRçVæ—E&–6RÇÂ’¢çVÖ&W"†Æ–æRçfE&FRÇÂ’òÂ“°¢&WGW&âÆF—b6Æ74æÖSÒ&w&–BvÓB6Ó¦w&–BÖ6öÇ2Ó"#à¢¶f÷&Òç6÷W&6TFö7VÖVçDÆ&VÂòÆF—b6Æ74æÖSÒ'&÷VæFVBÖÆr&÷&FW"&÷&FW"×6·’Ó#&r×6·’ÓSÓ2FW‡B×6ÒföçBÖÖVF—VÒFW‡B×6·’Óƒ6Ó¦6öÂ×7âÓ"#ä7&VF–ær¶f÷&ÒçG—RÓÓÒ&&–ÆÂ"ò'7WÆ–W"&–ÆÂ"¢&–çfö–6R'Òg&öÒ¶f÷&Òç6÷W&6TFö7VÖVçDÆ&VÇÒâF†R÷&–v–æÂFö7VÖVçBv–ÆÂ&RÆ–æ¶VBæBÖ&¶VB6öçfW'FVBgFW"6f–ærãÂöF—câ¢çVÆÇĞ¢¶f÷&Òç&Wf—6–öâÇÂG—W2æÆVæwF‚ÓÓÒÇÂ7W7FöÖW$Fö7VÖVçBòÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÂ‡FÖÄf÷#Ò'G&ç67F–öâ×G—R#åG&ç67F–öâG—SÂôÆ&VÃãÄ–çWB–CÒ'G&ç67F–öâ×G—R"fÇVS×¶f÷&ÒçG—RÓÓÒ'fVæF÷"7&VF—B"ò%W&6†6R&WGW&â"¢f÷&ÒçG—WÒ&VDöæÇ’6Æ74æÖSÒ&6—FÆ—¦R&r×6ÆFRÓ"óãÂöF—câ¢Ä6†ö–6RÆ&VÃÒ%G&ç67F–öâG—R"æÖSÒ'G—R"fÇVW3×·G—W7Òf÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×ÒóçÓÄf–VÆBÆ&VÃÒ$Fö7VÖVçBçVÖ&W""æÖSÒ&çVÖ&W""f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò&WV—&VBóà¢ÆF—b6Æ74æÖSÒ'76R×’Ó"6Ó¦6öÂ×7âÓ"#ãÄÆ&VÃç¶7W7FöÖW$Fö7VÖVçBò$7W7FöÖW""¢%fVæF÷"ò–VR'Ò£ÂôÆ&VÃãÅ6VÆV7BfÇVS×¶f÷&Òç'G’ÇÂVæFVf–æVGÒöåfÇVT6†ævS×²‡fÇVR’Óâ²6öç7BæW‡BÒÇ”6öçF7D7W'&Væ7’†f÷&ÒÂ6öçF7G2ÂfÇVRÂ7W7FöÖW$Fö7VÖVçBò&7W7FöÖW""¢'fVæF÷""ÂW†6†ævU&FW2Â&6T7W'&Væ7’“²–b†f÷&ÒçG—RÓÓÒ'W&6†6R÷&FW""’&W6öÇfUW&6†6T÷&FW$66÷VçB†æW‡B“²VÇ6R6†ævT–çfö–6Tf÷&Ò†f÷&ÒçG—RÓÓÒ'fVæF÷"7&VF—B"ò²ââææW‡BÂ&–ÆÄ–C¢""Ò¢æW‡B“²–b†f÷&ÒçG—RÓÓÒ'fVæF÷"7&VF—B"’6WDÆ–æW2…·²—FVÔ–C¢""ÂFW67&—F–öã¢%W&6†6R&WGW&â"ÂVçF—G“¢#"ÂVæ—E&–6S¢#"ÂVæ—D6÷7C¢#"ÂfD6öFS¢%5DäD$B"ÂfE&FS¢#R"ÕÒ“²×ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRÆ6V†öÆFW#×¶7W7FöÖW$Fö7VÖVçBò%6VÆV7B7W7FöÖW""¢%6VÆV7BfVæF÷"÷"–VR'ÒóãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCç¶6öçF7G2æf–ÇFW"‚†6öçF7B’Óâ6öçF7BçG—RÓÓÒ†7W7FöÖW$Fö7VÖVçBò&7W7FöÖW""¢'fVæF÷""’’æÖ‚†6öçF7B’ÓâÅ6VÆV7D—FVÒ¶W“×¶6öçF7Bæ–GÒfÇVS×µ7G&–ær†6öçF7BææÖR—Óçµ7G&–ær†6öçF7Bæ6ö×ç’ÇÂ6öçF7BææÖR—Ò+rµ7G&–ær†6öçF7Bæ7W'&Væ7’—ÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÂöF—cà¢¶f÷&ÒçG—RÓÓÒ'fVæF÷"7&VF—B"òÅW&6†6U&WGW&å6÷W&6R6ö×ç”–C×´çVÖ&W"†Æö6F–öç5³Óòæ6ö×ç”–BÇÂ—ÒÆö6F–öä–C×´çVÖ&W"†f÷&Òæ&–ÆÄÆö6F–öä–BÇÂÆö6F–öç5³Óòæ–BÇÂ—Ò'G“×¶f÷&Òç'G’ÇÂ"'Ò7W'&Væ7“×¶f÷&Òæ7W'&Væ7’ÇÂ&6T7W'&Væ7—Ò6VÆV7FVD&–ÆÄ–C×¶f÷&Òæ&–ÆÄ–GÒF—6&ÆVC×´&ööÆVâ†f÷&Òç&Wf—6–öâ—Òöå6VÆV7C×²†&–ÆÂ’Óâ²–b‚&–ÆÂ’&WGW&ã²6WDf÷&Ò‡²ââæf÷&ÒÂ&–ÆÄ–C¢7G&–ær†&–ÆÂæ–B’Â7W'&Væ7“¢&–ÆÂæ7W'&Væ7’ÂÖVÖó¢W&6†6R&WGW&âv–ç7B&–ÆÂG¶&–ÆÂæçVÖ&W'ÖÒ“²6WDÆ–æW2†&–ÆÂæÆ–æW2æÖ‚†Æ–æR’Óâ‡²6÷W&6TÆ–æT–C¢Æ–æRç6÷W&6TÆ–æT–BÂ—FVÔ–C¢Æ–æRæ—FVÔ–Bò7G&–ær†Æ–æRæ—FVÔ–B’¢""ÂFW67&—F–öã¢Æ–æRæFW67&—F–öâÂVçF—G“¢7G&–ær†Æ–æRç&VÖ–æ–ær’ÂVæ—E&–6S¢7G&–ær†Æ–æRçVæ—E&–6R’ÂVæ—D6÷7C¢7G&–ær†Æ–æRçVæ—D6÷7B’ÂfD6öFS¢Æ–æRçfD6öFRÂfE&FS¢7G&–ær†Æ–æRçfE&FR’Ò’’“²×Òóâ¢çVÆÇĞ¢Äf–VÆBÆ&VÃÒ%G&ç67F–öâFFR"æÖSÒ'G&ç67F–öäFFR"G—SÒ&FFR"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò&WV—&VBóãÄf–VÆBÆ&VÃÒ$GVRFFR"æÖSÒ&GVTFFR"G—SÒ&FFR"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Òóà¢¶7W7FöÖW$Fö7VÖVçBbbÅ–ÖVçEFW&×5–6¶W"fÇVS×¶f÷&ÒçFW&×2ÇÂ"'Òöä6†ævS×²‡FW&×2’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂFW&×2Ò—ÒóçĞ¢µ²&–çfö–6R"Â&W7F–ÖFR"Â'&öf÷&Ö–çfö–6R"Â'6ÆW2÷&FW""Â'V÷FF–öâ%Òæ–æ6ÇVFW2†f÷&ÒçG—R’bbÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃä–çfVçF÷'’£ÂôÆ&VÃãÅ6VÆV7BF—6&ÆVC×´&ööÆVâ†f÷&Òç6÷W&6TFö7VÖVçDÆ&VÂ—ÒfÇVS×¶f÷&ÒçG&ç67F–öäÆö6F–öä–BÇÂ7G&–ær†Æö6F–öç5³Óòæ–Bóò""—ÒöåfÇVT6†ævS×²‡G&ç67F–öäÆö6F–öä–B’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂG&ç67F–öäÆö6F–öä–BÒ—ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRÆ6V†öÆFW#Ò%6VÆV7B–çfVçF÷'’"óãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCç¶Æö6F–öç2æÖ‚†Æö6F–öâ’ÓâÅ6VÆV7D—FVÒ¶W“×¶Æö6F–öâæ–GÒfÇVS×µ7G&–ær†Æö6F–öâæ–B—Óç¶Æö6F–öâææÖWÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÂöF—cçĞ¢µ²&–çfö–6R"Â&W7F–ÖFR"Â'&öf÷&Ö–çfö–6R"Â'6ÆW2÷&FW""Â'V÷FF–öâ%Òæ–æ6ÇVFW2†f÷&ÒçG—R’bbÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÂ‡FÖÄf÷#Ò&Fö7VÖVçB×6ÆW2×&W#å6ÆW2&WÂôÆ&VÃãÅ6VÆV7BfÇVS×¶f÷&Òç6ÆW6ÖâÇÂVæFVf–æVGÒöåfÇVT6†ævS×²‡6ÆW6Öâ’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ6ÆW6ÖâÒ—ÓãÅ6VÆV7EG&–vvW"–CÒ&Fö7VÖVçB×6ÆW2×&W"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRÆ6V†öÆFW#Ò%6VÆV7B6ÆW2&W"óãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCç¶6öçF7G2æf–ÇFW"‚†6öçF7B’Óâ6öçF7BçG—RÓÓÒ&V×Æ÷–VR"’æÖ‚‡6ÆW6Öâ’ÓâÅ6VÆV7D—FVÒ¶W“×·6ÆW6Öâæ–GÒfÇVS×µ7G&–ær‡6ÆW6ÖâææÖR—Óçµ7G&–ær‡6ÆW6ÖâææÖR—ÓÂõ6VÆV7D—FVÓâ—×²6öçF7G2ç6öÖR‚†6öçF7B’Óâ6öçF7BçG—RÓÓÒ&V×Æ÷–VR"’bbÅ6VÆV7D—FVÒfÇVSÒ&æò×6ÆW2×&W2"F—6&ÆVCäæò6ÆW2&W2f–Æ&ÆSÂõ6VÆV7D—FVÓçÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÂöF—cçĞ¢Ä7W'&Væ7”W†6†ævT6†ö–6Rf÷&Ó×¶f÷&×Ò6WDf÷&Ó×¶f÷&ÒçG—RÓÓÒ'W&6†6R÷&FW""ò&W6öÇfUW&6†6T÷&FW$66÷VçB¢6†ævT–çfö–6Tf÷&×ÒW†6†ævU&FW3×¶W†6†ævU&FW7Ò&6T7W'&Væ7“×¶&6T7W'&Væ7—Òóç¶7W7FöÖW$Fö7VÖVçBòÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÂ‡FÖÄf÷#Ò&–çfö–6RÖW†6†ævR×&FR#äW†6†ævR&FRFò¶&6T7W'&Væ7—ÓÂôÆ&VÃãÄ–çWB¶W“×¶G¶f÷&Òæ7W'&Væ7—ÒÒG¶f÷&ÒæW†6†ævU&FWÖÒ–CÒ&–çfö–6RÖW†6†ævR×&FR"G—SÒ&çVÖ&W""Ö–ãÒ#ã"7FWÒ&ç’"&WV—&VB&VDöæÇ“×¶f÷&Òæ7W'&Væ7’ÓÓÒ&6T7W'&Væ7—ÒFVfVÇEfÇVS×¶f÷&ÒæW†6†ævU&FWÒöä¶W”F÷vã×²†WfVçB’Óâ²–b†WfVçBæ¶W’ÓÓÒ$VçFW""’²WfVçBç&WfVçDFVfVÇB‚“²WfVçBæ7W'&VçEF&vWBæ&ÇW"‚“²Ò×Òöä&ÇW#×²†WfVçB’Óâ²6öç7BfÇVRÒWfVçBæ7W'&VçEF&vWBçfÇVS²6†ævT–çfö–6Tf÷&Ò‡²ââæf÷&ÒÂW†6†ævU&FS¢fÇVRÒ“²–b‚çVÖ&W"æ—4f–æ—FR„çVÖ&W"‡fÇVR’’ÇÂçVÖ&W"‡fÇVR’ÃÒ’WfVçBæ7W'&VçEF&vWBçfÇVRÒf÷&ÒæW†6†ævU&FS²×ÒóãÇ6Æ74æÖSÒ'FW‡B×‡2FW‡B×6ÆFRÓS#ã¶f÷&Òæ7W'&Væ7—ÒÒ¶f÷&ÒæW†6†ævU&FWÒ¶&6T7W'&Væ7—Òâ—FVÒ&–6W26öçfW'BWFöÖF–6ÆÇ’ãÂ÷ãÂöF—câ¢Äf–VÆBÆ&VÃ×¶W†6†ævR&FRFòG¶&6T7W'&Væ7—ÖÒæÖSÒ&W†6†ævU&FR"G—SÒ&çVÖ&W""f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò&WV—&VBóçĞ¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓ76R×’Ó2&÷VæFVB×†Â&÷&FW"&r×6ÆFRÓSÓ26Ó¦6öÂ×7âÓ"#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâ#ãÆF—cãÄÆ&VÃä—FV×2æB6W'f–6W3ÂôÆ&VÃãÇ6Æ74æÖSÒ'FW‡B×‡2FW‡B×6ÆFRÓS#å7Fö6²WFFW2v†Vâ–çfö–6W2Â&–ÆÇ2ÂæB—FVÒ&V6V—G2÷7BãÂ÷ãÂöF—cãÄ'WGFöâG—SÒ&'WGFöâ"f&–çCÒ&÷WFÆ–æR"6—¦SÒ'6Ò"6Æ74æÖSÒ&'&æB×&–Ö'’Ö'WGFöâ&÷&FW"×G&ç7&VçBföçB×6VÖ–&öÆB"öä6Æ–6³×¶FEG&ç67F–öäÆ–æWÓãÅÇW26Æ74æÖSÒ'6—¦RÓ2"óäÆ–æSÂô'WGFöããÂöF—cà¢ÆF—b6Æ74æÖSÒ'G&ç67F–öâÖÆ–æW2#ç¶Æ–æW2æÖ‚†Æ–æRÂ–æFW‚’ÓâÆF—b¶W“×¶–æFW‡Ò6Æ74æÖSÒ'G&ç67F–öâÖÆ–æR&÷VæFVBÖÆr&÷&FW"&r×v†—FRÓ2#à¢ÆF—b6Æ74æÖSÒ'G&ç67F–öâÖÆ–æRÖFW67&—F–öâ76R×’Ó"#ãÄÆ&VÂ‡FÖÄf÷#×¶Æ–æRÖFW67&—F–öâÒG¶–æFW‡ÖÓä—FVÒFW67&—F–öãÂôÆ&VÃà¢Å6VÆV7BfÇVS×¶Æ–æRæ—FVÔ–BÇÂ&7W7FöÒ'ÒöåfÇVT6†ævS×²‡fÇVR’Óâ²6öç7B—FVÒÒ6VÆV7F&ÆT—FV×2æf–æB‚†VçG'’’Óâ7G&–ær†VçG'’æ–B’ÓÓÒfÇVR“²6öç7B6VÆV7FVEfD6öFRÒ7G&–ær‡W&6†6TFö7VÖVçBò—FVÓòçW&6†6UfD6öFRÇÂÆ–æRçfD6öFR¢—FVÓòç6ÆW5fD6öFRÇÂÆ–æRçfD6öFR“²6öç7B6VÆV7FVEfE&FRÒçVÖ&W"‡fE&FTf÷$6öFR‡6VÆV7FVEfD6öFRÂfD6öFT÷F–öç2’“²6öç7BW&6†6T6÷7EfE&FRÒçVÖ&W"‡fE&FTf÷$6öFR…7G&–ær†—FVÓòçW&6†6UfD6öFRÇÂ%¤U$ò"’ÂfD6öFT÷F–öç2’“²6öç7B7F÷&VEW&6†6U&–6RÒçVÖ&W"†—FVÓòæÆ7EW&6†6U&–6Róò—FVÓòæ6÷7Bóò“²6öç7BæWEW&6†6U&–6RÒ—FVÓòæÖ÷VçG4–æ6ÇVFUfBÓÓÒG'VRbbW&6†6T6÷7EfE&FRâò7F÷&VEW&6†6U&–6Ròƒ²W&6†6T6÷7EfE&FRò’¢7F÷&VEW&6†6U&–6S²6öç7B7F÷&VE6ÆW5&–6RÒçVÖ&W"†—FVÓòç6ÆW5&–6Róò“²6öç7BæWE6ÆW5&–6RÒ—FVÓòæÖ÷VçG4–æ6ÇVFUfBÓÓÒG'VRbb6VÆV7FVEfE&FRâò7F÷&VE6ÆW5&–6Ròƒ²6VÆV7FVEfE&FRò’¢7F÷&VE6ÆW5&–6S²6öç7B7F÷&VD6÷7BÒçVÖ&W"†—FVÓòæ6÷7Bóò“²6öç7BæWD6÷7BÒ—FVÓòæÖ÷VçG4–æ6ÇVFUfBÓÓÒG'VRbbW&6†6T6÷7EfE&FRâò7F÷&VD6÷7Bòƒ²W&6†6T6÷7EfE&FRò’¢7F÷&VD6÷7C²6öç7B÷F†W%VçF—G’ÒÆ–æW2ç&VGV6R‚‡7VÒÂVçG'’Â÷6—F–öâ’Óâ÷6—F–öâÓÒ–æFW‚bbVçG'’æ—FVÔ–BÓÓÒfÇVRò7VÒ²ÖF‚æÖ‚ƒÂçVÖ&W"†VçG'’çVçF—G’’ÇÂ’¢7VÒÂ“²6öç7B–çfö–6UVçF—G’Òf÷&ÒçG—RÓÓÒ&–çfö–6R"bbf÷&Òç&Wf—6–öâbb—FVÒbb—FVÕG—Töb†—FVÒæ—FVÕG—R’ÓÓÒ'7Fö6²×'B"ò²VçF—G“¢7G&–ær„ÖF‚æÖ‚ƒÂçVÖ&W"†—FVÒçVçF—G’ÇÂ’Ò÷F†W%VçF—G’’’Ò¢·Ó²WFFR†–æFW‚ÂfÇVRÓÓÒ&7W7FöÒ"ò²—FVÔ–C¢""Ò¢²ââæ–çfö–6UVçF—G’Â—FVÔ–C¢fÇVRÂFW67&—F–öã¢—FVÒò—FVÔF—7Æ”FW67&—F–öâ†—FVÒ’ÇÂ7G&–ær†—FVÒææÖR’¢""ÂVæ—E&–6S¢W&6†6TFö7VÖVçBò7G&–ær„çVÖ&W"‚†æWEW&6†6U&–6RòFö7VÖVçE&FR’çFôf—†VBƒ"’’’¢–çfö–6T7W'&Væ7”Ö÷VçB†æWE6ÆW5&–6RÂFö7VÖVçE&FR’ÂVæ—D6÷7C¢7W7FöÖW$Fö7VÖVçBò–çfö–6T7W'&Væ7”Ö÷VçB†æWD6÷7BÂFö7VÖVçE&FR’¢7G&–ær†æWD6÷7B’Â†öÖUVæ—E&–6S¢7W7FöÖW$Fö7VÖVçBòæWE6ÆW5&–6R¢VæFVf–æVBÂ†öÖUVæ—D6÷7C¢7W7FöÖW$Fö7VÖVçBòæWD6÷7B¢VæFVf–æVBÂfD6öFS¢6VÆV7FVEfD6öFRÂfE&FS¢7G&–ær‡6VÆV7FVEfE&FR’Ò“²×ÓãÅ6VÆV7EG&–vvW"&–ÖÆ&VÃ×¶—FVÒG¶–æFW‚²ÖÒ6Æ74æÖSÒ'rÖgVÆÂÖ–â×rÓ²eõ¶FF×6Æ÷C×6VÆV7B×fÇVUÕÓ¦Ö–â×rÓ²eõ¶FF×6Æ÷C×6VÆV7B×fÇVUÕÓ§G'Væ6FR#ãÅ6VÆV7EfÇVRÆ6V†öÆFW#Ò$—FVÒ"óãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçB÷6—F–öãÒ'÷W""6Æ74æÖSÒ&Ö‚×rÕ¶6Æ2ƒgrÓ7&VÒ•Ò²eõ¶FF×6Æ÷C×6VÆV7BÖ—FVÕÕÓ§v†—FW76RÖæ÷&ÖÂ²eõ¶FF×6Æ÷C×6VÆV7BÖ—FVÕÕÓ¦'&V²×v÷&G2#ãÅ6VÆV7D—FVÒfÇVSÒ&7W7FöÒ#å6W'f–6Rò7W7FöÓÂõ6VÆV7D—FVÓç·6VÆV7F&ÆT—FV×2æÖ‚†—FVÒ’ÓâÅ6VÆV7D—FVÒ¶W“×¶—FVÒæ–GÒfÇVS×µ7G&–ær†—FVÒæ–B—Óçµ7G&–ær†—FVÒç6·R—Ò+rµ7G&–ær†—FVÒææÖR—Ò+r¶—FVÕG—TFWF–Ç5¶—FVÕG—Töb†—FVÒæ—FVÕG—R•ÒæÆ&VÇÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7Cà¢ÅFW‡F&V–C×¶Æ–æRÖFW67&—F–öâÒG¶–æFW‡ÖÒ&–ÖÆ&VÃ×¶—FVÒFW67&—F–öâG¶–æFW‚²ÖÒÆ6V†öÆFW#Ò$FW67&—F–öâ"&WV—&VB&÷w3×³'Ò6Æ74æÖSÒ&Ö–âÖ‚ÓbrÖgVÆÂÖ–â×rÓ&W6—¦R×’'&V²×v÷&G2"fÇVS×¶Æ–æRæFW67&—F–öçÒöä6†ævS×²†R’ÓâWFFR†–æFW‚Â²FW67&—F–öã¢RçF&vWBçfÇVRÒ—Òóà¢¶f÷&ÒçG—RÓÓÒ&–çfö–6R"bbÄFö7VÖVçDW‡G&f–VÆG2fÇVS×·²6öÖÖVçG3¢Æ–æRæ6öÖÖVçG2ÇÂ""Â6W&–ÄçVÖ&W#¢Æ–æRç6W&–ÄçVÖ&W"ÇÂ""×Òöä6†ævS×·fÇVRÓâWFFR†–æFW‚ÂfÇVR—ÒóçĞ¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓ76R×’Ó"#ãÄÆ&VÂ‡FÖÄf÷#×¶Æ–æR×VçF—G’ÒG¶–æFW‡ÖÓåG“ÂôÆ&VÃãÄ–çWB–C×¶Æ–æR×VçF—G’ÒG¶–æFW‡ÖÒ&–ÖÆ&VÃÒ%VçF—G’"F—FÆSÒ%VçF—G’"6Æ74æÖSÒ'rÖgVÆÂÖ–â×rÓ‚Ó""G—SÒ&çVÖ&W""Ö–ãÒ#ã"7FWÒ#ã"fÇVS×¶Æ–æRçVçF—G—Òöä6†ævS×²†R’ÓâWFFR†–æFW‚Â²VçF—G“¢RçF&vWBçfÇVRÒ—ÒóãÂöF—cà¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓ76R×’Ó"#ãÄÆ&VÂ‡FÖÄf÷#×¶Æ–æR×&FRÒG¶–æFW‡ÖÓå&FSÂôÆ&VÃãÄ–çWB–C×¶Æ–æR×&FRÒG¶–æFW‡ÖÒ&–ÖÆ&VÃÒ%Væ—B&–6R"F—FÆSÒ%Væ—B&FR&Vf÷&RdB"6Æ74æÖSÒ'rÖgVÆÂÖ–â×rÓ‚Ó""G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#ã"fÇVS×¶Æ–æRçVæ—E&–6WÒöä6†ævS×²†R’ÓâWFFR†–æFW‚Â²Væ—E&–6S¢RçF&vWBçfÇVRÒ—ÒóãÂöF—cà¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓ76R×’Ó"#ãÄÆ&VÂ‡FÖÄf÷#×¶Æ–æRÖ–æ6ÇW6—fRÒG¶–æFW‡ÖÓä–æ2dCÂôÆ&VÃãÄ–çWB–C×¶Æ–æRÖ–æ6ÇW6—fRÒG¶–æFW‡ÖÒ&–ÖÆ&VÃÒ%Væ—B&FR–æ6ÇVF–ærdB"F—FÆSÒ%Væ—B&FR–æ6ÇVF–ær6VÆV7FVBdB"6Æ74æÖSÒ'rÖgVÆÂÖ–â×rÓ&r×6ÆFRÓS‚Ó""&VDöæÇ’fÇVS×²„çVÖ&W"†Æ–æRçVæ—E&–6RÇÂ’¢ƒ²çVÖ&W"†Æ–æRçfE&FRÇÂ’ò’’çFôf—†VBƒ"—ÒóãÂöF—cà¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓ76R×’Ó"#ãÄÆ&VÂ‡FÖÄf÷#×¶Æ–æR×fBÒG¶–æFW‡ÖÓådCÂôÆ&VÃç¶f÷&ÒçG—RÓÓÒ&—FVÒ&V6V—B"òÄ–çWB–C×¶Æ–æR×fBÒG¶–æFW‡ÖÒ&VDöæÇ’fÇVSÒ#R"6Æ74æÖSÒ'rÖgVÆÂÖ–â×rÓ&r×6ÆFRÓ‚Ó""óâ¢Å6VÆV7BfÇVS×¶Æ–æRçfD6öFWÒöåfÇVT6†ævS×²‡fD6öFR’ÓâWFFR†–æFW‚Â²fD6öFRÂfE&FS¢fE&FTf÷$6öFR‡fD6öFRÂfD6öFT÷F–öç2’Ò—ÓãÅ6VÆV7EG&–vvW"–C×¶Æ–æR×fBÒG¶–æFW‡ÖÒ&–ÖÆ&VÃ×¶dB&FRf÷"Æ–æRG¶–æFW‚²ÖÒF—FÆS×·fD6öFT÷F–öç2æf–æB‚†÷F–öâ’Óâ÷F–öâæ6öFRÓÓÒÆ–æRçfD6öFR“òæÆ&VÇÒ6Æ74æÖSÒ'rÖgVÆÂÖ–â×rÓ‚Ó"#ãÅ6VÆV7EfÇVSç¶Æ–æRçfE&FWÒSÂõ6VÆV7EfÇVSãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçB÷6—F–öãÒ'÷W""Æ–vãÒ&VæB"6Æ74æÖSÒ&Ö‚×rÕ¶Ö–âƒ#&VÒÆ6Æ2ƒgrÓ7&VÒ’•Ò#ç·fD6öFT÷F–öç2æÖ‚†÷F–öâ’ÓâÅ6VÆV7D—FVÒ¶W“×¶÷F–öâæ6öFWÒfÇVS×¶÷F–öâæ6öFWÒ6Æ74æÖSÒ'v†—FW76RÖæ÷&ÖÂ'&V²×v÷&G2#ç¶÷F–öâæÆ&VÇÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CçÓÂöF—cà¢Ä'WGFöâG—SÒ&'WGFöâ"f&–çCÒ&v†÷7B"6—¦SÒ&–6öâ"&–ÖÆ&VÃ×¶&VÖ÷fRÆ–æRG¶–æFW‚²ÖÒF—6&ÆVC×¶Æ–æW2æÆVæwF‚ÓÓÒÒöä6Æ–6³×²‚’Óâ6WDÆ–æW2†Æ–æW2æf–ÇFW"‚…òÂ÷6—F–öâ’Óâ÷6—F–öâÓÒ–æFW‚’—Ò6Æ74æÖSÒ'G&ç67F–öâÖÆ–æR×&VÖ÷fRFW‡B×6ÆFRÓC†÷fW#§FW‡B×&÷6RÓc"F—FÆSÒ$FVÆWFR#ãÅG&6ƒ"6Æ74æÖSÒ'6—¦RÓB"óãÂô'WGFöãà¢ÂöF—câ—ÓÂöF—cà¢µ²'W&6†6R÷&FW""Â&W7F–ÖFR"Â'&öf÷&Ö–çfö–6R"Â'6ÆW2÷&FW""Â&–çfö–6R%Òæ–æ6ÇVFW2†f÷&ÒçG—R’bbÆF—b6Æ74æÖSÒ&fÆW‚§W7F–g’ÖVæBBÓ"#ãÄ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×¶FEG&ç67F–öäÆ–æWÒ6Æ74æÖSÒ&'&æB×&–Ö'’Ö'WGFöâ&÷&FW"×G&ç7&VçBföçB×6VÖ–&öÆB#ãÅÇW26Æ74æÖSÒ'6—¦RÓB"óäFBÆ–æSÂô'WGFöããÂöF—cçĞ¢ÆF—b6Æ74æÖSÒ&ÖÂÖWFòw&–BÖ‚×r×‡2vÓ"BÓ"FW‡B×6Ò#ãÆF—b6Æ74æÖSÒ&fÆW‚§W7F–g’Ö&WGvVVâFW‡B×6ÆFRÓS#ãÇ7ãå7V'F÷FÃÂ÷7ããÇ7ãç¶f÷&ÖDÖöæW’‡7V'F÷FÂÂf÷&Òæ7W'&Væ7’—ÓÂ÷7ããÂöF—cãÆF—b6Æ74æÖSÒ&fÆW‚§W7F–g’Ö&WGvVVâFW‡B×6ÆFRÓS#ãÇ7ãådCÂ÷7ããÇ7ãç¶f÷&ÖDÖöæW’‡fBÂf÷&Òæ7W'&Væ7’—ÓÂ÷7ããÂöF—cãÆF—b6Æ74æÖSÒ&fÆW‚§W7F–g’Ö&WGvVVâ&÷&FW"×BBÓ"FW‡BÖ&6RföçBÖ&öÆB#ãÇ7ãåF÷FÃÂ÷7ããÇ7ãç¶f÷&ÖDÖöæW’‡7V'F÷FÂ²fBÂf÷&Òæ7W'&Væ7’—ÓÂ÷7ããÂöF—cãÂöF—cà¢ÂöF—cà¢µ²&–çfö–6R"Â'6ÆW2&V6V—B%Òæ–æ6ÇVFW2†f÷&ÒçG—R’bbÆF—b6Æ74æÖSÒ'&÷VæFVB×†Â&÷&FW"&÷&FW"ÖÖ&W"Ó#&rÖÖ&W"ÓSÓB6Ó¦6öÂ×7âÓ"#à¢ÆÆ&VÂ6Æ74æÖSÒ&fÆW‚7W'6÷"×ö–çFW"—FV×2×7F'BvÓ2#ãÄ6†V6¶&÷‚6†V6¶VC×¶f÷&ÒæÆÆ÷tæVvF—fU7Fö6²ÓÓÒ'G'VR'Òöä6†V6¶VD6†ævS×²†6†V6¶VB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂÆÆ÷tæVvF—fU7Fö6³¢6†V6¶VBÓÓÒG'VRò'G'VR"¢&fÇ6R"ÂFÖ–ä÷fW'&–FU–ã¢6†V6¶VBÓÓÒG'VRòf÷&ÒæFÖ–ä÷fW'&–FU–âóò""¢""Ò—ÒóãÇ7ããÇ7â6Æ74æÖSÒ&&Æö6²FW‡B×6ÒföçB×6VÖ–&öÆBFW‡BÖÖ&W"Ó“S#äFÖ–â÷fW'&–FS¢ÆÆ÷ræVvF—fR7Fö6³Â÷7ããÇ7â6Æ74æÖSÒ&×BÓ&Æö6²FW‡B×‡2FW‡BÖÖ&W"Óƒ#äæ÷&ÖÆÇ’&Æö6¶VBv†Vâ7Fö6²—2–ç7Vff–6–VçBâ6öæf–wW&R÷"6†ævRF†R”â–âÖævVÖVçBfwC²FÖ–â6öçG&öÇ2ãÂ÷7ããÂ÷7ããÂöÆ&VÃà¢¶f÷&ÒæÆÆ÷tæVvF—fU7Fö6²ÓÓÒ'G'VR"bbÆF—b6Æ74æÖSÒ&×BÓ2Ö‚×r×6Ò76R×’Ó"#ãÄÆ&VÂ‡FÖÄf÷#Ò&FÖ–ä÷fW'&–FU–â#äFÖ–â”ãÂôÆ&VÃãÄ–çWB–CÒ&FÖ–ä÷fW'&–FU–â"æÖSÒ&FÖ–ä÷fW'&–FU–â"G—SÒ'77v÷&B"–çWDÖöFSÒ&çVÖW&–2"WFô6ö×ÆWFSÒ&öfb"&WV—&VBfÇVS×¶f÷&ÒæFÖ–ä÷fW'&–FU–âóò"'Òöä6†ævS×²†WfVçB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂFÖ–ä÷fW'&–FU–ã¢WfVçBçF&vWBçfÇVRÒ—ÒÆ6V†öÆFW#Ò$VçFW"FÖ–â”â"óãÂöF—cçĞ¢ÂöF—cçĞ¢¶f÷&Òç&Wf—6–öâòÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃå7FGW3ÂôÆ&VÃãÄ–çWB&VDöæÇ’fÇVS×¶f÷&Òç7FGW7ÒóãÂöF—câ¢Ä6†ö–6RÆ&VÃÒ%7FGW2"æÖSÒ'7FGW2"fÇVW3×µ²&÷Vâ"Â'–B"Â&÷fW&GVR"Â&6ÆV&VB%×Òf÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×ÒóçÓÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃç·&V6V—f&ÆTFö7VÖVçBò%÷7F–ær66÷VçB„66÷VçG2&V6V—f&ÆR’"¢–&ÆTFö7VÖVçBò%÷7F–ær66÷VçB„66÷VçG2–&ÆR’"¢%÷7F–ær66÷VçB'ÓÂôÆ&VÃãÅ6VÆV7BfÇVS×¶f÷&Òæ66÷VçGÒöåfÇVT6†ævS×²†66÷VçB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ66÷VçBÒ—ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRÆ6V†öÆFW#×¶f÷&Òç–&ÆT66÷VçEVæF–ærÓÓÒ'G'VR"òf–æF–ærG¶f÷&Òæ7W'&Væ7—Ò66÷VçG2–&Æ^(
f¢&V6V—f&ÆTFö7VÖVçBò6VÆV7BG¶f÷&Òæ7W'&Væ7—Ò66÷VçG2&V6V—f&ÆV¢–&ÆTFö7VÖVçBò6VÆV7BG¶f÷&Òæ7W'&Væ7—Ò66÷VçG2–&ÆV¢%6VÆV7BÆ–æ¶VB66÷VçB'ÒóãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCç·÷7F–æt66÷VçG2æÖ‚†66÷VçB’ÓâÅ6VÆV7D—FVÒ¶W“×¶66÷VçBæ–GÒfÇVS×µ7G&–ær†66÷VçBææÖR—Óçµ7G&–ær†66÷VçBææÖR—ÓÂõ6VÆV7D—FVÓâ—×¶f÷&ÒçG—RÓÓÒ'W&6†6R÷&FW""bbf÷&Òç–&ÆT66÷VçE&W6öÇfVBÓÓÒ'G'VR"bbf÷&Òæ66÷VçBbb÷7F–æt66÷VçG2ç6öÖR‚†66÷VçB’Óâ66÷VçBææÖRÓÓÒf÷&Òæ66÷VçB’bbÅ6VÆV7D—FVÒfÇVS×¶f÷&Òæ66÷VçGÓç¶f÷&Òæ66÷VçGÓÂõ6VÆV7D—FVÓçÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÂöF—cà¢ÆF—b6Æ74æÖSÒ'6Ó¦6öÂ×7âÓ"#ãÄf–VÆBÆ&VÃÒ$ÖVÖò"æÖSÒ&ÖVÖò"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×ÒóãÂöF—cà¢ÂöF—cã°§Ğ¦gVæ7F–öâ6öçF7Df–VÆG2‡²f÷&ÒÂ6WDf÷&ÒÂ66÷VçG2Ó¢²f÷&Ó¢&V6÷&CÇ7G&–ærÂ7G&–æsã²6WDf÷&Ó¢†c¢&V6÷&CÇ7G&–ærÂ7G&–æsâ’Óâfö–C²66÷VçG3¢FF&V6÷&EµÒÒ’°¢6öç7BÆVFvW%&öÆRÒf÷&ÒçG—RÓÓÒ&7W7FöÖW""ò$""¢f÷&ÒçG—RÓÓÒ'fVæF÷""ò$"¢çVÆÃ°¢6öç7BÖF6†–æt66÷VçG2ÒÆVFvW%&öÆRò66÷VçG2æf–ÇFW"‚†66÷VçB’Óâ66÷VçBæ7F—fRbb66÷VçBç7—7FVÕ&öÆRÓÓÒÆVFvW%&öÆRbb7G&–ær†66÷VçBæ7W'&Væ7’’ÓÓÒf÷&Òæ7W'&Væ7’’¢µÓ°¢6öç7B7W'&Væ7”æD66÷VçBÒÆVFvW%&öÆRòÃà¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃä7W'&Væ7’£ÂôÆ&VÃãÅ6VÆV7BfÇVS×¶f÷&Òæ7W'&Væ7—ÒöåfÇVT6†ævS×²†7W'&Væ7’’Óâ²6öç7BÖF6‚Ò6öçG&öÄ66÷VçDf÷"†66÷VçG2ÂÆVFvW%&öÆRÂ7W'&Væ7’“²6WDf÷&Ò‡²ââæf÷&ÒÂ7W'&Væ7’ÂÆVFvW$66÷VçD–C¢ÖF6‚ò7G&–ær†ÖF6‚æ–B’¢""Ò“²×ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRóãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCç¶7W'&Væ6–W2æÖ‚†7W'&Væ7’’ÓâÅ6VÆV7D—FVÒ¶W“×¶7W'&Væ7—ÒfÇVS×¶7W'&Væ7—Óç¶7W'&Væ7—ÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÂöF—cà¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃç¶ÆVFvW%&öÆRÓÓÒ$""ò$66÷VçG2&V6V—f&ÆR"¢$66÷VçG2–&ÆR'Ò66÷VçCÂôÆ&VÃç¶ÖF6†–æt66÷VçG2æÆVæwF‚òÅ6VÆV7BfÇVS×¶f÷&ÒæÆVFvW$66÷VçD–BÇÂ7G&–ær†ÖF6†–æt66÷VçG5³Òæ–B—ÒöåfÇVT6†ævS×²†ÆVFvW$66÷VçD–B’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂÆVFvW$66÷VçD–BÒ—ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRÆ6V†öÆFW#×¶6VÆV7BG¶f÷&Òæ7W'&Væ7—Ò66÷VçFÒóãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCç¶ÖF6†–æt66÷VçG2æÖ‚†66÷VçB’ÓâÅ6VÆV7D—FVÒ¶W“×¶66÷VçBæ–GÒfÇVS×µ7G&–ær†66÷VçBæ–B—Óçµ7G&–ær†66÷VçBæ6öFR—Ò+rµ7G&–ær†66÷VçBææÖR—ÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7Câ¢ÆF—b6Æ74æÖSÒ'&÷VæFVBÖÆr&÷&FW"&÷&FW"ÖF6†VB&÷&FW"ÖVÖW&ÆBÓ3&rÖVÖW&ÆBÓS‚Ó2’Ó"FW‡B×6ÒFW‡BÖVÖW&ÆBÓƒ#ç¶ÆVFvW%&öÆWÒ×¶f÷&Òæ7W'&Væ7—Òv–ÆÂ&R7&VFVBWFöÖF–6ÆÇ’ãÂöF—cçÓÇ6Æ74æÖSÒ'FW‡B×‡2FW‡B×6ÆFRÓS#åG&ç67F–öç2f÷"F†—26öçF7B÷7BFòF†RÖF6†–ær7W'&Væ7’6öçG&öÂ66÷VçBãÂ÷ãÂöF—cà¢Âóâ¢çVÆÃ°¢–b†f÷&ÒçG—RÓÓÒ'fVæF÷""’&WGW&âÆF—b6Æ74æÖSÒ'76R×’ÓR#à¢ÆF—b6Æ74æÖSÒ'&÷VæFVB×†Â&÷&FW"&÷&FW"×6ÆFRÓ#&r×6ÆFRÓSÓB#à¢Ç6Æ74æÖSÒ'FW‡B×6ÒföçBÖ&öÆBFW‡B×6ÆFRÓ“#åfVæF÷"FWF–Ç3Â÷à¢Ç6Æ74æÖSÒ&×BÓFW‡B×‡2FW‡B×6ÆFRÓS#äFB6ö×ç’Â6öçF7BÂ7W'&Væ7’æBF‚–æf÷&ÖF–öâf÷"F†—2fVæF÷"ãÂ÷à¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ'76R×’ÓB#à¢Äf–VÆBÆ&VÃÒ$6ö×ç’æÖR"æÖSÒ&6ö×ç’"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×²†æW‡B’Óâ6WDf÷&Ò‡²ââææW‡BÂæÖS¢æW‡Bæ6ö×ç’Ò—Ò&WV—&VBÆ6V†öÆFW#Ò$VçFW"6ö×ç’æÖR"óà¢Äf–VÆBÆ&VÃÒ%FVÆW†öæR"æÖSÒ'†öæR"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò&WV—&VBÆ6V†öÆFW#Ò$f÷&ÖB³“s3CScsƒ’"óà¢Äf–VÆBÆ&VÃÒ$Öö&–ÆRçVÖ&W""æÖSÒ'v†G6"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×ÒÆ6V†öÆFW#Ò$f÷&ÖB³“sS#3CScr"óà¢Äf–VÆBÆ&VÃÒ$VÖ–ÂFG&W72"æÖSÒ&VÖ–Â"G—SÒ&VÖ–Â"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×ÒÆ6V†öÆFW#Ò$VçFW"VÖ–ÂFG&W72"óà¢¶7W'&Væ7”æD66÷VçGĞ¢Å6V&6†&ÆT6÷VçG'”6†ö–6Rf÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Òóà¢Äf–VÆBÆ&VÃÒ%E$â"æÖSÒ'G&â"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×ÒÆ6V†öÆFW#Ò$VçFW"E$â"óà¢ÂöF—cà¢ÂöF—cã°¢–b†f÷&ÒçG—RÓÒ&7W7FöÖW""’&WGW&âÆF—b6Æ74æÖSÒ&w&–BvÓB6Ó¦w&–BÖ6öÇ2Ó"#ãÆF—b6Æ74æÖSÒ'6Ó¦6öÂ×7âÓ"#ãÄf–VÆBÆ&VÃÒ$æÖR"æÖSÒ&æÖR"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò&WV—&VBóãÂöF—cãÄf–VÆBÆ&VÃÒ$6ö×ç’"æÖSÒ&6ö×ç’"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×ÒóãÄf–VÆBÆ&VÃÒ$VÖ–Â"æÖSÒ&VÖ–Â"G—SÒ&VÖ–Â"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×ÒóãÄf–VÆBÆ&VÃÒ%†öæR"æÖSÒ'†öæR"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×ÒóãÂöF—cã° ¢&WGW&âÆF—b6Æ74æÖSÒ'76R×’ÓR#à¢ÆF—b6Æ74æÖSÒ'&÷VæFVB×†Â&÷&FW"&÷&FW"×6ÆFRÓ#&r×6ÆFRÓSÓB#à¢Ç6Æ74æÖSÒ'FW‡B×6ÒföçBÖ&öÆBFW‡B×6ÆFRÓ“#ä7W7FöÖW"FWF–Ç3Â÷à¢Ç6Æ74æÖSÒ&×BÓFW‡B×‡2FW‡B×6ÆFRÓS#äFB&–ÆÆ–ærÂ6öçF7BæBF‚–æf÷&ÖF–öâf÷"F†—27W7FöÖW"ãÂ÷à¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&w&–Bv×‚ÓRv×’ÓBÖC¦w&–BÖ6öÇ2Ó"#à¢Äf–VÆBÆ&VÃÒ$6ö×ç’æÖR"æÖSÒ&6ö×ç’"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò&WV—&VBÆ6V†öÆFW#Ò$VçFW"6ö×ç’æÖR"óà¢Å6V&6†&ÆT6÷VçG'”6†ö–6Rf÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Òóà¢Äf–VÆBÆ&VÃÒ$&–ÆÆ–æræÖR"æÖSÒ&æÖR"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×²†æW‡B’Óâ6WDf÷&Ò‡²ââææW‡BÂ&–ÆÆ–ætæÖS¢æW‡BææÖRÒ—Ò&WV—&VBÆ6V†öÆFW#Ò$VçFW"&–ÆÆ–æræÖR"óà¢Äf–VÆBÆ&VÃÒ%E$âƒRF–v—G2’"æÖSÒ'G&â"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×ÒÆ6V†öÆFW#Ò#RF–v—G2Â–b&Vv—7FW&VB"óà¢Äf–VÆBÆ&VÃÒ$6öçF7BçVÖ&W""æÖSÒ'†öæR"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò&WV—&VBÆ6V†öÆFW#Ò$f÷&ÖB³“s3CScsƒ’"óà¢Ä6†ö–6RÆ&VÃÒ%&W6VÆÆW"¢"æÖSÒ'&W6VÆÆW""fÇVW3×µ²%&W6VÆÆW""Â$VæBW6W"%×Òf÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Òóà¢Äf–VÆBÆ&VÃÒ$Öö&–ÆRòv†G4‚²6÷VçG'’6öFR’"æÖSÒ'v†G6"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò&WV—&VBÆ6V†öÆFW#Ò$f÷&ÖB³“sS#3CScr"óà¢Ä6†ö–6RÆ&VÃÒ%ÆæWB¢"æÖSÒ'ÆæWB"fÇVW3×µ²$æò"Â%–W2%×Òf÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Òóà¢Äf–VÆBÆ&VÃÒ$VÖ–ÂFG&W72"æÖSÒ&VÖ–Â"G—SÒ&VÖ–Â"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×ÒÆ6V†öÆFW#Ò$VçFW"VÖ–ÂFG&W72"óà¢Äf–VÆBÆ&VÃÒ%77÷'B2"æÖSÒ'77÷'B"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×ÒÆ6V†öÆFW#Ò$VçFW"77÷'B2"óà¢¶7W'&Væ7”æD66÷VçGĞ¢ ¢ÆF—b6Æ74æÖSÒ'76R×’Ó"ÖC¦6öÂ×7âÓ"#ãÄÆ&VÂ‡FÖÄf÷#Ò&FW67&—F–öâ#äFW67&—F–öãÂôÆ&VÃãÅFW‡F&V–CÒ&FW67&—F–öâ"æÖSÒ&FW67&—F–öâ"&÷w3×³GÒÆ6V†öÆFW#Ò$FB7W7FöÖW"æ÷FW2"fÇVS×¶f÷&ÒæFW67&—F–öâóò"'Òöä6†ævS×²†WfVçB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂFW67&—F–öã¢WfVçBçF&vWBçfÇVRÒ—ÒóãÂöF—cà¢ÂöF—cà¢ÂöF—cã°§Ğ¦gVæ7F–öâ—FVÔf–VÆG2‡²f÷&ÒÂ6WDf÷&ÒÂ—FV×2Â66÷VçG2Â6öçF7G2ÂfD6öFT÷F–öç2Â7W'&Væ7’ÂVF—F–ærÓ¢²f÷&Ó¢&V6÷&CÇ7G&–ærÂ7G&–æsã²6WDf÷&Ó¢†c¢&V6÷&CÇ7G&–ærÂ7G&–æsâ’Óâfö–C²—FV×3¢FF&V6÷&EµÓ²66÷VçG3¢FF&V6÷&EµÓ²6öçF7G3¢FF&V6÷&EµÓ²fD6öFT÷F–öç3¢fD6öFT÷F–öåµÓ²7W'&Væ7“¢7G&–æs²VF—F–æs¢&ööÆVâÒ’°¢6öç7B6÷VçBÒÖF‚æÖ–âƒ3ÂÖF‚æÖ‚ƒÂçVÖ&W"†f÷&Òç7V46÷VçBóò‚’’“°¢6öç7B¶÷F–öäFFÂ6WD÷F–öäFFÒÒW6U7FFSÇ²÷F–öç3¢&V6÷&CÇ7G&–ærÂ7G&–æuµÓã²F—6&ÆVC¢&V6÷&CÇ7G&–ærÂ7G&–æuµÓã²Æ&VÇ3¢7G&–æuµÓ²F—6&ÆVDÆ&VÇ3¢7G&–æuµÓ²6FVv÷&–W3¢7G&–æuµÓ²F—6&ÆVD6FVv÷&–W3¢7G&–æuµÒÓâ‡²÷F–öç3¢·ÒÂF—6&ÆVC¢·ÒÂÆ&VÇ3¢²ââç7V6–f–6F–öäf–VÆG5ÒÂF—6&ÆVDÆ&VÇ3¢µÒÂ6FVv÷&–W3¢²$ÄDõ%ÒÂF—6&ÆVD6FVv÷&–W3¢µÒÒ“°¢6öç7BÆöD÷F–öç2ÒW6T6ÆÆ&6²†7–æ2‚’Óâ°¢G'’°¢6öç7B&W7öç6RÒv—BfWF6‚‚"ö’÷7V2Ö÷F–öç2"“°¢6öç7BFFÒv—B&W7öç6Ræ§6öâ‚“°¢–b‚&W7öç6Ræö²’F‡&÷ræWrW'&÷"†FFæW'&÷"ÇÂ$6÷VÆBæ÷BÆöB6†ö–6W2"“°¢6WD÷F–öäFF†FF“°¢Ò6F6‚†W'&÷"’²Fö7BæW'&÷"†W'&÷"–ç7Fæ6VöbW'&÷"òW'&÷"æÖW76vR¢$6÷VÆBæ÷BÆöB6†ö–6W2"“²Ğ¢ÒÂµÒ“°¢òòW6Æ–çBÖF—6&ÆRÖæW‡BÖÆ–æR&V7BÖ†öö·2÷6WB×7FFRÖ–âÖVffV7@¢W6TVffV7B‚‚’Óâ²ÆöD÷F–öç2‚“²ÒÂ¶ÆöD÷F–öç5Ò“° ¢6öç7B6†ævT÷F–öâÒ7–æ2†ÖWF†öC¢%õ5B"Â%D4‚"Â$DTÄUDR"Â–ÆöC¢&V6÷&CÇ7G&–ærÂ7G&–æsâ’Óâ°¢6öç7B&W7öç6RÒv—BfWF6‚‚"ö’÷7V2Ö÷F–öç2"Â²ÖWF†öBÂ†VFW'3¢²$6öçFVçBÕG—R#¢&Æ–6F–öâö§6öâ"ÒÂ&öG“¢¥4ôâç7G&–æv–g’‡–ÆöB’Ò“°¢6öç7BFFÒv—B&W7öç6Ræ§6öâ‚“°¢–b‚&W7öç6Ræö²’F‡&÷ræWrW'&÷"†FFæW'&÷"ÇÂ$6÷VÆBæ÷BWFFRF†R6†ö–6R"“°¢v—BÆöD÷F–öç2‚“°¢Ó°¢6öç7B6fVDÆ&VÇ2Ò—FV×2æfÆDÖ‚†—FVÒ’Óâ°¢G'’°¢6öç7B'6VBÒ¥4ôâç'6R…7G&–ær†—FVÒç7V6–f–6F–öç2óò%µÒ"’’2'&“Ç²Æ&VÃó¢7G&–ærÓã°¢&WGW&â'6VBæÖ‚‡7V6–f–6F–öâ’Óâ7V6–f–6F–öâæÆ&VÃòçG&–Ò‚’’æf–ÇFW"‚†Æ&VÂ“¢Æ&VÂ—27G&–ærÓâ&ööÆVâ†Æ&VÂ’“°¢Ò6F6‚²&WGW&âµÓ²Ğ¢Ò“°¢6öç7BF—6&ÆVDÆ&VÇ2ÒæWr6WB†÷F–öäFFæF—6&ÆVDÆ&VÇ2“°¢6öç7BÆ&VÄ÷F–öç2Ò²ââææWr6WB…²ââæ÷F–öäFFæÆ&VÇ2Âââç6fVDÆ&VÇ2Âââäö&¦V7Bæ¶W—2†÷F–öäFFæ÷F–öç2•Ò•Òæf–ÇFW"‚†Æ&VÂ’ÓâF—6&ÆVDÆ&VÇ2æ†2†Æ&VÂ’“°¢6öç7B6ö×&&ÆT6†ö–6RÒ‡fÇVS¢7G&–ær’ÓâfÇVRææ÷&ÖÆ—¦R‚$äd´2"’çFôÆ÷vW$66R‚’ç&WÆ6R‚õµåÇ´ÇÕÇ´çÕÒöwRÂ""“°¢6öç7BF—6&ÆVD6FVv÷&–W2ÒæWr6WB†÷F–öäFFæF—6&ÆVD6FVv÷&–W2æÖ†6ö×&&ÆT6†ö–6R’“°¢6öç7B6fVD6FVv÷&–W2Ò—FV×2æÖ‚†—FVÒ’Óâ7G&–ær†—FVÒæ6FVv÷'’óò""’çG&–Ò‚’çFôÆö6ÆUWW$66R‚&Vâ"’’æf–ÇFW"„&ööÆVâ“°¢6öç7B6FVv÷'”÷F–öç2Ò²ââææWrÖ…²ââæ÷F–öäFFæ6FVv÷&–W2Âââç6fVD6FVv÷&–W5ÒæÖ‚†6FVv÷'’’Óâ¶6ö×&&ÆT6†ö–6R†6FVv÷'’’Â6FVv÷'’çFôÆö6ÆUWW$66R‚&Vâ"•Ò’’çfÇVW2‚•Òæf–ÇFW"‚†6FVv÷'’’ÓâF—6&ÆVD6FVv÷&–W2æ†2†6ö×&&ÆT6†ö–6R†6FVv÷'’’’“°¢6öç7BG&gE7V6–f–6F–öç2Ò'&’æg&öÒ‡²ÆVæwFƒ¢6÷VçBÒÂ…òÂ–æFW‚’Óâ‡°¢Æ&VÃ¢f÷&Õ¶7V4Æ&VÂG¶–æFW‡ÖÒóò7V6–f–6F–öäf–VÆG5¶–æFW…ÒÀ¢fÇVS¢f÷&Õ¶7V5fÇVRG¶–æFW‡ÖÒóò""À¢Ò’“°¢6öç7BFW67&—F–öâÒvVæW&FVD—FVÔFW67&—F–öâ†G&gE7V6–f–6F–öç2Âf÷&ÒææÖRÂf÷&Òç6·RÂf÷&Òæ—FVÔçVÖ&W"“°¢6öç7B—FVÕG—RÒ—FVÕG—Töb†f÷&Òæ—FVÕG—R“°¢6öç7BG—T–æfòÒ—FVÕG—TFWF–Ç5¶—FVÕG—UÓ°¢6öç7B7FæF&DÆ–æT—FVÒÒFö7VÖVçDÆ–æT—FVÕG—W2æ†2†—FVÕG—R“°¢6öç7B7Fö6µ'BÒ—FVÕG—RÓÓÒ'7Fö6²×'B#°¢6öç7B7F—fT66÷VçG2Ò66÷VçG2æf–ÇFW"‚†66÷VçB’Óâ66÷VçBæ7F—fRÓÒfÇ6Rbb7G&–ær†66÷VçBæ7F—fR’ÓÒ&fÇ6R"“°¢6öç7Bæ÷&ÖÆ—¦VD66÷VçEfÇVRÒ‡fÇVS¢Væ¶æ÷vâ’Óâ7G&–ær‡fÇVRóò""’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢6öç7B7Fö6´6öw466÷VçG2Ò7F—fT66÷VçG2æf–ÇFW"‚†66÷VçB’Óâ°¢6öç7B&öÆRÒæ÷&ÖÆ—¦VD66÷VçEfÇVR†66÷VçBç7—7FVÕ&öÆR“°¢6öç7BG—RÒæ÷&ÖÆ—¦VD66÷VçEfÇVR†66÷VçBçG—R“°¢6öç7BæÖRÒæ÷&ÖÆ—¦VD66÷VçEfÇVR†66÷VçBææÖR“°¢&WGW&â&öÆRÓÓÒ&6öw2"ÇÂG—RÓÓÒ&6÷7BöbvööG26öÆB"ÇÂæÖRæ–æ6ÇVFW2‚&6÷7BöbvööG2"“°¢Ò“°¢6öç7BW&6†6T66÷VçG2Ò7F—fT66÷VçG2æf–ÇFW"‚†66÷VçB’Óâ°¢6öç7B&öÆRÒæ÷&ÖÆ—¦VD66÷VçEfÇVR†66÷VçBç7—7FVÕ&öÆR“°¢6öç7BG—RÒæ÷&ÖÆ—¦VD66÷VçEfÇVR†66÷VçBçG—R“°¢6öç7BæÖRÒæ÷&ÖÆ—¦VD66÷VçEfÇVR†66÷VçBææÖR“°¢&WGW&â²&6öw2"Â'W&6†6W2"Â&W‡Vç6R%Òæ–æ6ÇVFW2‡&öÆR¢ÇÂ²&6÷7BöbvööG26öÆB"Â&W‡Vç6R"Â&÷F†W"W‡Vç6R%Òæ–æ6ÇVFW2‡G—R¢ÇÂæÖRæ–æ6ÇVFW2‚&6÷7BöbvööG2"¢ÇÂæÖRæ–æ6ÇVFW2‚'W&6†6W2"“°¢Ò“°¢6öç7B–æ6öÖT66÷VçG2Ò7F—fT66÷VçG2æf–ÇFW"‚†66÷VçB’Óâ°¢6öç7B&öÆRÒæ÷&ÖÆ—¦VD66÷VçEfÇVR†66÷VçBç7—7FVÕ&öÆR“°¢6öç7BG—RÒæ÷&ÖÆ—¦VD66÷VçEfÇVR†66÷VçBçG—R“°¢&WGW&â²'6ÆW2"Â&÷F†W%ö–æ6öÖR%Òæ–æ6ÇVFW2‡&öÆR’ÇÂ²&–æ6öÖR"Â&÷F†W"–æ6öÖR%Òæ–æ6ÇVFW2‡G—R“°¢Ò“°¢6öç7B76WD66÷VçG2Ò7F—fT66÷VçG2æf–ÇFW"‚†66÷VçB’Óâ°¢6öç7B&öÆRÒæ÷&ÖÆ—¦VD66÷VçEfÇVR†66÷VçBç7—7FVÕ&öÆR“°¢6öç7BæÖRÒæ÷&ÖÆ—¦VD66÷VçEfÇVR†66÷VçBææÖR“°¢&WGW&â&öÆRÓÓÒ&–çfVçF÷'’"ÇÂæÖRæ–æ6ÇVFW2‚&–çfVçF÷'’76WB"“°¢Ò“°¢6öç7BfVæF÷'2Ò6öçF7G2æf–ÇFW"‚†6öçF7B’Óâ6öçF7BçG—RÓÓÒ'fVæF÷""bb7G&–ær†6öçF7Bç7FGW2ÇÂ&7F—fR"’ÓÒ&–æ7F—fR"“°¢6öç7B6VÆV7FVEW&6†6UfBÒf÷&ÒçW&6†6UfD6öFRÇÂfD6öFT÷F–öç2æf–æB‚†6öFR’Óâ6öFRæ6öFRÓÓÒ%5DäD$B"“òæ6öFRÇÂfD6öFT÷F–öç5³Óòæ6öFRÇÂ%¤U$ò#°¢6öç7B6VÆV7FVE6ÆW5fBÒf÷&Òç6ÆW5fD6öFRÇÂfD6öFT÷F–öç2æf–æB‚†6öFR’Óâ6öFRæ6öFRÓÓÒ%5DäD$B"“òæ6öFRÇÂfD6öFT÷F–öç5³Óòæ6öFRÇÂ%¤U$ò#°¢6öç7BFE7V6–f–6F–öâÒ‚’Óâ°¢–b†6÷VçBãÒ3’&WGW&ã°¢6WDf÷&Ò‡²ââæf÷&ÒÂ7V46÷VçC¢7G&–ær†6÷VçB²’Â¶7V4Æ&VÂG¶6÷VçGÖÓ¢7V6–f–6F–öäf–VÆG5¶6÷VçEÒÂ¶7V5fÇVRG¶6÷VçGÖÓ¢""Ò“°¢Ó°¢6öç7B&VÖ÷fU7V6–f–6F–öâÒ†–æFWƒ¢çVÖ&W"’Óâ°¢–b†6÷VçBÃÒ’&WGW&ã°¢6öç7BæW‡Df÷&ÒÒ²ââæf÷&ÒÓ°¢f÷"†ÆWB÷6—F–öâÒ–æFWƒ²÷6—F–öâÂ6÷VçBÒ²÷6—F–öâ³Ò’°¢æW‡Df÷&Õ¶7V4Æ&VÂG·÷6—F–öçÖÒÒæW‡Df÷&Õ¶7V4Æ&VÂG·÷6—F–öâ²ÖÒóò7V6–f–6F–öäf–VÆG5·÷6—F–öåÓ°¢æW‡Df÷&Õ¶7V5fÇVRG·÷6—F–öçÖÒÒæW‡Df÷&Õ¶7V5fÇVRG·÷6—F–öâ²ÖÒóò"#°¢Ğ¢FVÆWFRæW‡Df÷&Õ¶7V4Æ&VÂG¶6÷VçBÒÖÓ°¢FVÆWFRæW‡Df÷&Õ¶7V5fÇVRG¶6÷VçBÒÖÓ°¢æW‡Df÷&Òç7V46÷VçBÒ7G&–ær†6÷VçBÒ“°¢6WDf÷&Ò†æW‡Df÷&Ò“°¢Ó°¢6öç7BfÇVW4f÷"Ò†Æ&VÃ¢7G&–ær’Óâ°¢6öç7B6fVBÒ—FV×2æfÆDÖ‚†—FVÒ’Óâ°¢G'’°¢6öç7B'6VBÒ¥4ôâç'6R…7G&–ær†—FVÒç7V6–f–6F–öç2óò%µÒ"’’2'&“Ç²Æ&VÃó¢7G&–æs²fÇVSó¢7G&–ærÓã°¢&WGW&â'6VBæf–ÇFW"‚‡7V6–f–6F–öâ’Óâ7V6–f–6F–öâæÆ&VÂÓÓÒÆ&VÂbb7V6–f–6F–öâçfÇVR’æÖ‚‡7V6–f–6F–öâ’Óâ7V6–f–6F–öâçfÇVR“°¢Ò6F6‚²&WGW&âµÓ²Ğ¢Ò“°¢6öç7BF—6&ÆVBÒæWr6WB†÷F–öäFFæF—6&ÆVE¶Æ&VÅÒóòµÒ“°¢&WGW&â²ââææWr6WB…²âââ†÷F–öäFFæ÷F–öç5¶Æ&VÅÒóòµÒ’Âââç6fVEÒ•Òæf–ÇFW"‚‡fÇVR’ÓâF—6&ÆVBæ†2‡fÇVR’“°¢Ó°¢6öç7B66÷VçE–6¶W"Ò†Æ&VÃ¢7G&–ærÂæÖS¢&6öw466÷VçD–B"Â&–æ6öÖT66÷VçD–B"Â&76WD66÷VçD–B"Â6†ö–6W3¢FF&V6÷&EµÒ’ÓâÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃç¶Æ&VÇÓÂôÆ&VÃãÅ6VÆV7BfÇVS×¶f÷&Õ¶æÖUÒÇÂ&æöæR'ÒöåfÇVT6†ævS×²‡fÇVR’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ¶æÖUÓ¢fÇVRÓÓÒ&æöæR"ò""¢fÇVRÒ—ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRÆ6V†öÆFW#Ò%6VÆV7B66÷VçB"óãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCãÅ6VÆV7D—FVÒfÇVSÒ&æöæR#äæ÷BÆ–æ¶VCÂõ6VÆV7D—FVÓç¶6†ö–6W2æÖ‚†66÷VçB’ÓâÅ6VÆV7D—FVÒ¶W“×¶66÷VçBæ–GÒfÇVS×µ7G&–ær†66÷VçBæ–B—Óçµ7G&–ær†66÷VçBæ6öFRÇÂ""—Ò+rµ7G&–ær†66÷VçBææÖR—ÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÇ6Æ74æÖSÒ'FW‡B×‡2FW‡B×6ÆFRÓS#äÆ–æ¶VBFò6†'Böb66÷VçG2ãÂ÷ãÂöF—cã°¢6öç7BfE–6¶W"Ò†Æ&VÃ¢7G&–ærÂæÖS¢'W&6†6UfD6öFR"Â'6ÆW5fD6öFR"ÂfÇVS¢7G&–ær’ÓâÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃç¶Æ&VÇÓÂôÆ&VÃãÅ6VÆV7BfÇVS×·fÇVWÒöåfÇVT6†ævS×²†æW‡B’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ¶æÖUÓ¢æW‡BÒ—ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRÆ6V†öÆFW#Ò%6VÆV7BdB6öFR"óãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCç·fD6öFT÷F–öç2æÖ‚†÷F–öâ’ÓâÅ6VÆV7D—FVÒ¶W“×¶÷F–öâæ6öFWÒfÇVS×¶÷F–öâæ6öFWÓç¶÷F–öâæÆ&VÇÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÇ6Æ74æÖSÒ'FW‡B×‡2FW‡B×6ÆFRÓS#äÆ–æ¶VBFòÖævVÖVçBfwC²dB6öFW2ãÂ÷ãÂöF—cã°¢&WGW&âÆF—bFFÖGF6†ÖVçG2ÖW†6ÇVFVCÒ'G'VR"6Æ74æÖSÒ&w&–BvÓB6Ó¦w&–BÖ6öÇ2Ó"#à¢Ç6V7F–öâ6Æ74æÖSÒ'76R×’ÓB&÷VæFVB×†Â&÷&FW"&r×v†—FRÓB6Ó¦6öÂ×7âÓ"#à¢ÆF—b6Æ74æÖSÒ&w&–BvÓBÆs¦w&–BÖ6öÇ2Õ³#ƒ…óg%Ò#à¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃåG—R£ÂôÆ&VÃãÅ6VÆV7BfÇVS×¶—FVÕG—WÒöåfÇVT6†ævS×²‡fÇVR’Óâ²6öç7BæW‡EG—RÒ—FVÕG—Töb‡fÇVR“²6WDf÷&Ò‡²ââæf÷&ÒÂ—FVÕG—S¢æW‡EG—RÂâââ†æW‡EG—RÓÓÒ'7Fö6²×'B"ò·Ò¢²VçF—G“¢#"Â&V÷&FW%ö–çC¢#"Â76WD66÷VçD–C¢""Ò’Ò“²×ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRóãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCç¶—FVÕG—UfÇVW2æÖ‚‡fÇVR’ÓâÅ6VÆV7D—FVÒ¶W“×·fÇVWÒfÇVS×·fÇVWÓç¶—FVÕG—TFWF–Ç5·fÇVUÒæÆ&VÇÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÂöF—cà¢ÆF—b6Æ74æÖSÒ'&÷VæFVBÖÆr&÷&FW"&r×6ÆFRÓSÓ2#ãÇ6Æ74æÖSÒ&föçB×6VÖ–&öÆBFW‡B×6ÆFRÓ“#ç·G—T–æfòæÆ&VÇÓÂ÷ãÇ6Æ74æÖSÒ&×BÓFW‡B×6ÒÆVF–ærÓbFW‡B×6ÆFRÓc#ç·G—T–æfòæFW67&—F–öçÓÂ÷ãÇ6Æ74æÖSÒ&×BÓ"FW‡B×‡2föçB×6VÖ–&öÆBFW‡BÖVÖW&ÆBÓs#äÆ–æ¶VB&V¢·G—T–æfòæÆ–æ¶VD&VÓÂ÷ãÂöF—cà¢ÂöF—cà¢Â÷6V7F–öãà ¢·7FæF&DÆ–æT—FVÒbbÃãÇ6V7F–öâ6Æ74æÖSÒ'76R×’ÓB&÷VæFVB×†Â&÷&FW"&r×6ÆFRÓSÓB#à¢ÆF—cãÆƒ26Æ74æÖSÒ&föçBÖ&öÆBFW‡B×6ÆFRÓ“#åW&6†6R–æf÷&ÖF–öãÂöƒ3ãÇ6Æ74æÖSÒ&×BÓFW‡B×‡2FW‡B×6ÆFRÓS#äFVfVÇG2W6VBv†VâF†—2—FVÒ—26VÆV7FVBöâW&6†6RFö7VÖVçG2ãÂ÷ãÂöF—cà¢Äf–VÆBÆ&VÃ×·7Fö6µ'Bò6÷7B‚G¶7W'&Væ7—Ò–¢W&6†6R6÷7Bò&FR‚G¶7W'&Væ7—Ò–ÒæÖSÒ&6÷7B"G—SÒ&çVÖ&W""f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Òóà¢·fE–6¶W"‚%W&6‚dB6öFR"Â'W&6†6UfD6öFR"Â6VÆV7FVEW&6†6UfB—Ğ¢¶66÷VçE–6¶W"‡7Fö6µ'Bò$4ôu266÷VçB"¢$W‡Vç6Rò4ôu266÷VçB"Â&6öw466÷VçD–B"Â7Fö6µ'Bò7Fö6´6öw466÷VçG2¢W&6†6T66÷VçG2—Ğ¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃå&VfW'&VB7WÆ–W#ÂôÆ&VÃãÅ6VÆV7BfÇVS×¶f÷&Òç&VfW'&VE7WÆ–W$–BÇÂ&æöæR'ÒöåfÇVT6†ævS×²‡fÇVR’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ&VfW'&VE7WÆ–W$–C¢fÇVRÓÓÒ&æöæR"ò""¢fÇVRÒ—ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRÆ6V†öÆFW#Ò%6VÆV7B7WÆ–W""óãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCãÅ6VÆV7D—FVÒfÇVSÒ&æöæR#äæò&VfW'&VB7WÆ–W#Âõ6VÆV7D—FVÓç·fVæF÷'2æÖ‚‡fVæF÷"’ÓâÅ6VÆV7D—FVÒ¶W“×·fVæF÷"æ–GÒfÇVS×µ7G&–ær‡fVæF÷"æ–B—Óçµ7G&–ær‡fVæF÷"æ6ö×ç’ÇÂfVæF÷"ææÖR—ÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÇ6Æ74æÖSÒ'FW‡B×‡2FW‡B×6ÆFRÓS#äÆ–æ¶VBFòfVæF÷"6VçFW"ãÂ÷ãÂöF—cà¢Â÷6V7F–öãà¢Ç6V7F–öâ6Æ74æÖSÒ'76R×’ÓB&÷VæFVB×†Â&÷&FW"&r×6ÆFRÓSÓB#à¢ÆF—cãÆƒ26Æ74æÖSÒ&föçBÖ&öÆBFW‡B×6ÆFRÓ“#å6ÆW2–æf÷&ÖF–öãÂöƒ3ãÇ6Æ74æÖSÒ&×BÓFW‡B×‡2FW‡B×6ÆFRÓS#äFVfVÇG2W6VBv†VâF†—2—FVÒ—26VÆV7FVBöâ6ÆW2Fö7VÖVçG2ãÂ÷ãÂöF—cà¢Äf–VÆBÆ&VÃ×¶—FVÕG—RÓÓÒ'6W'f–6R"ò&FR‚G¶7W'&Væ7—Ò–¢6ÆW2&–6R‚G¶7W'&Væ7—Ò–ÒæÖSÒ'6ÆW5&–6R"G—SÒ&çVÖ&W""f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Òóà¢·fE–6¶W"‚%6ÆW2dB6öFR"Â'6ÆW5fD6öFR"Â6VÆV7FVE6ÆW5fB—Ğ¢¶66÷VçE–6¶W"‚$–æ6öÖR66÷VçB"Â&–æ6öÖT66÷VçD–B"Â–æ6öÖT66÷VçG2—Ğ¢Â÷6V7F–öããÂóçĞ ¢·7Fö6µ'BbbÇ6V7F–öâ6Æ74æÖSÒ'76R×’ÓB&÷VæFVB×†Â&÷&FW"&r×v†—FRÓB6Ó¦6öÂ×7âÓ"#à¢ÆF—cãÆƒ26Æ74æÖSÒ&föçBÖ&öÆBFW‡B×6ÆFRÓ“#å7Fö6²–æf÷&ÖF–öãÂöƒ3ãÇ6Æ74æÖSÒ&×BÓFW‡B×‡2FW‡B×6ÆFRÓS#äöâÖ†æB7Fö6²6†ævW2öæÇ’g&öÒ7Fö6²Fö7VÖVçG2gFW"F†R÷Væ–ærVçF—G’—26fVBãÂ÷ãÂöF—cà¢ÆF—b6Æ74æÖSÒ&w&–BvÓBÖC¦w&–BÖ6öÇ2Ó"†Ã¦w&–BÖ6öÇ2ÓR#à¢ÆF—b6Æ74æÖSÒ'†Ã¦6öÂ×7âÓ#ç¶66÷VçE–6¶W"‚$76WB66÷VçB"Â&76WD66÷VçD–B"Â76WD66÷VçG2—ÓÂöF—cà¢Äf–VÆBÆ&VÃÒ%&V÷&FW"ö–çB„Ö–â’"æÖSÒ'&V÷&FW%ö–çB"G—SÒ&çVÖ&W""f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Òóà¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃäöâ†æCÂôÆ&VÃãÄ–çWBG—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#ã"&VDöæÇ“×¶VF—F–æwÒfÇVS×¶f÷&ÒçVçF—G’ÇÂ#'Òöä6†ævS×²†WfVçB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂVçF—G“¢WfVçBçF&vWBçfÇVRÒ—Ò6Æ74æÖS×¶VF—F–ærò&&r×6ÆFRÓ"¢"'ÒóãÇ6Æ74æÖSÒ'FW‡B×‡2FW‡B×6ÆFRÓS#ç¶VF—F–ærò%WFFVB'’÷7FVB7Fö6²Fö7VÖVçG2â"¢$÷Væ–ærVçF—G’f÷"F†—2–çfVçF÷'’â'ÓÂ÷ãÂöF—cà¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃäfW&vR6÷7CÂôÆ&VÃãÄ–çWB&VDöæÇ’fÇVS×´çVÖ&W"†f÷&Òæ6÷7BÇÂ’çFôÆö6ÆU7G&–ær‡VæFVf–æVBÂ²Ö†–×VÔg&7F–öäF–v—G3¢BÒ—Ò6Æ74æÖSÒ&&r×6ÆFRÓ"óãÇ6Æ74æÖSÒ'FW‡B×‡2FW‡B×6ÆFRÓS#ä6Æ7VÆFVBg&öÒ÷7FVB7Fö6²W&6†6W2–â†öÖR7W'&Væ7’ãÂ÷ãÂöF—cà¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃäöâäòãÂôÆ&VÃãÄ–çWB&VDöæÇ’fÇVS×´çVÖ&W"†f÷&ÒæöåòÇÂ’çFôÆö6ÆU7G&–ær‡VæFVf–æVBÂ²Ö†–×VÔg&7F–öäF–v—G3¢BÒ—Ò6Æ74æÖSÒ&&r×6ÆFRÓ"óãÇ6Æ74æÖSÒ'FW‡B×‡2FW‡B×6ÆFRÓS#ä÷VâW&6†6R÷&FW"VçF—G’ãÂ÷ãÂöF—cà¢ÂöF—cà¢Â÷6V7F–öãçĞ ¢²7FæF&DÆ–æT—FVÒbbÇ6V7F–öâ6Æ74æÖSÒ'&÷VæFVB×†Â&÷&FW"&÷&FW"×6·’Ó#&r×6·’ÓSÓB6Ó¦6öÂ×7âÓ"#ãÆƒ26Æ74æÖSÒ&föçBÖ&öÆBFW‡B×6·’Ó“S#äFö7VÖVçB6öçG&öÂ—FVÓÂöƒ3ãÇ6Æ74æÖSÒ&×BÓFW‡B×6ÒÆVF–ærÓbFW‡B×6·’Ó“#ç·G—T–æfòæÆ&VÇÒ—2Æ–æ¶VBFòÇ7G&öæsç·G—T–æfòæÆ–æ¶VD&VÓÂ÷7G&öæsâ&F†W"F†âF†Ræ÷&ÖÂ7Fö6²÷6W'f–6R—FVÒ6VÆV7F÷"Â6ò—Bv–ÆÂæ÷B6†ævR–çfVçF÷'’VçF—G’ãÂ÷ãÂ÷6V7F–öãçĞ ¢Ç6V7F–öâ6Æ74æÖSÒ&w&–BvÓB&÷VæFVB×†Â&÷&FW"&r×v†—FRÓB6Ó¦6öÂ×7âÓ"ÖC¦w&–BÖ6öÇ2Ó"#à¢ÆÆ&VÂ6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ2FW‡B×6ÒföçBÖÖVF—VÒ#ãÄ6†V6¶&÷‚6†V6¶VC×¶f÷&Òç7FGW2ÓÓÒ&–æ7F—fR'Òöä6†V6¶VD6†ævS×²†6†V6¶VB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ7FGW3¢6†V6¶VBÓÓÒG'VRò&–æ7F—fR"¢&7F—fR"Ò—Òóä—FVÒ—2–æ7F—fSÂöÆ&VÃà¢ÆÆ&VÂ6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ2FW‡B×6ÒföçBÖÖVF—VÒ#ãÄ6†V6¶&÷‚6†V6¶VC×¶f÷&ÒæÖ÷VçG4–æ6ÇVFUfBÓÓÒ'G'VR'Òöä6†V6¶VD6†ævS×²†6†V6¶VB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂÖ÷VçG4–æ6ÇVFUfC¢6†V6¶VBÓÓÒG'VRò'G'VR"¢&fÇ6R"Ò—ÒóäÖ÷VçG2–æ2dCÂöÆ&VÃà¢¶f÷&ÒæÖ÷VçG4–æ6ÇVFUfBÓÓÒ'G'VR"bbÇ6Æ74æÖSÒ'FW‡B×‡2FW‡B×6ÆFRÓSÖC¦6öÂ×7âÓ"#å6fVB6÷7BæB6ÆW2&–6Rõ&FR&RG&VFVB2dBÖ–æ6ÇW6—fRâFö7VÖVçBÆ–æW26öçfW'BF†VÒFòæWBfÇVW2W6–ærF†RÆ–æ¶VBdB6öFRãÂ÷çĞ¢Â÷6V7F–öãà ¢ÆF—b6Æ74æÖSÒ'76R×’Ó"6Ó¦6öÂ×7âÓ"#ãÆF—cãÄÆ&VÃä6FVv÷'“ÂôÆ&VÃãÇ6Æ74æÖSÒ&×BÓFW‡B×‡2FW‡B×6ÆFRÓS#å4µRæB—FVÒæòâ&RvVæW&FVBWFöÖF–6ÆÇ’f÷"WfW'’æWr—FVÒãÂ÷ãÂöF—cãÅ7V6–f–6F–öåfÇVU–6¶W ¢Æ&VÃÒ$—FVÒ6FVv÷'’ ¢Æ6V†öÆFW#Ò%6VÆV7B÷"G—R6FVv÷'’ ¢fÇVS×¶f÷&Òæ6FVv÷'’óò"'Ğ¢÷F–öç3×¶6FVv÷'”÷F–öç7Ğ¢WW&66P¢öä6†ævS×²‡fÇVR’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ6FVv÷'“¢fÇVRÒ—Ğ¢öäFC×²‡fÇVR’Óâ6†ævT÷F–öâ‚%õ5B"Â²G—S¢&6FVv÷'’"ÂfÇVRÒ—Ğ¢öå&VæÖS×²†öÆEfÇVRÂæWufÇVR’Óâ6†ævT÷F–öâ‚%D4‚"Â²G—S¢&6FVv÷'’"ÂöÆEfÇVRÂæWufÇVRÒ—Ğ¢öäFVÆWFS×²‡fÇVR’Óâ6†ævT÷F–öâ‚$DTÄUDR"Â²G—S¢&6FVv÷'’"ÂfÇVRÒ—Ğ¢óãÂöF—cà¢Ç6V7F–öâ6Æ74æÖSÒ'76R×’Ó2&÷VæFVB×†Â&÷&FW"&r×6ÆFRÓSÓB6Ó¦6öÂ×7âÓ"#à¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâvÓ2#ãÆF—cãÄÆ&VÃä—FVÒFW67&—F–öâ7V6–f–6F–öç3ÂôÆ&VÃãÇ6Æ74æÖSÒ&×BÓFW‡B×‡2FW‡B×6ÆFRÓS#å6VÆV7B÷"G—Rç’FWF–ÂÂF†VâVçFW"—G2fÇVRâFB÷"&VÖ÷fRWFò3f–VÆG2ãÂ÷ãÂöF—cãÄ'WGFöâG—SÒ&'WGFöâ"f&–çCÒ&÷WFÆ–æR"6—¦SÒ'6Ò"F—6&ÆVC×¶6÷VçBãÒ3Òöä6Æ–6³×¶FE7V6–f–6F–öçÓãÅÇW26Æ74æÖSÒ'6—¦RÓ2"óäFBFWF–Â‡¶6÷VçGÒó3“Âô'WGFöããÂöF—cà¢ÆF—b6Æ74æÖSÒ&w&–BvÓ2†Ã¦w&–BÖ6öÇ2Ó"#ç´'&’æg&öÒ‡²ÆVæwFƒ¢6÷VçBÒÂ…òÂ–æFW‚’ÓâÆF—b¶W“×¶–æFW‡Ò6Æ74æÖSÒ&w&–BÖ–â×rÓw&–BÖ6öÇ2Õ¶Ö–æÖ‚ƒÃg"•öWFõÒvÓ"&÷VæFVBÖÆr&÷&FW"&r×v†—FRÓ"6Ó¦w&–BÖ6öÇ2Õ¶Ö–æÖ‚ƒÃg"•öÖ–æÖ‚ƒÃã#Vg"•öWFõÒ#à¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓ#à¢Å7V6–f–6F–öåfÇVU–6¶W ¢Æ&VÃÒ%7V6–f–6F–öâFWF–Â ¢Æ6V†öÆFW#Ò%6VÆV7B÷"G—RFWF–Â ¢fÇVS×¶f÷&Õ¶7V4Æ&VÂG¶–æFW‡ÖÒóò7V6–f–6F–öäf–VÆG5¶–æFW…×Ğ¢÷F–öç3×¶Æ&VÄ÷F–öç7Ğ¢öä6†ævS×²‡fÇVR’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ¶7V4Æ&VÂG¶–æFW‡ÖÓ¢fÇVRÒ—Ğ¢öäFC×²‡fÇVR’Óâ6†ævT÷F–öâ‚%õ5B"Â²G—S¢&Æ&VÂ"ÂfÇVRÒ—Ğ¢öå&VæÖS×²†öÆEfÇVRÂæWufÇVR’Óâ6†ævT÷F–öâ‚%D4‚"Â²G—S¢&Æ&VÂ"ÂöÆEfÇVRÂæWufÇVRÒ—Ğ¢öäFVÆWFS×²‡fÇVR’Óâ6†ævT÷F–öâ‚$DTÄUDR"Â²G—S¢&Æ&VÂ"ÂfÇVRÒ—Ğ¢óà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓÖ‚×6Ó¦6öÂ×7F'BÓÖ‚×6Ó§&÷r×7F'BÓ"#à¢Å7V6–f–6F–öåfÇVU–6¶W ¢Æ&VÃ×¶f÷&Õ¶7V4Æ&VÂG¶–æFW‡ÖÒóò7V6–f–6F–öäf–VÆG5¶–æFW…×Ğ¢fÇVS×¶f÷&Õ¶7V5fÇVRG¶–æFW‡ÖÒóò"'Ğ¢÷F–öç3×·fÇVW4f÷"†f÷&Õ¶7V4Æ&VÂG¶–æFW‡ÖÒóò7V6–f–6F–öäf–VÆG5¶–æFW…Ò—Ğ¢WW&66P¢öä6†ævS×²‡fÇVR’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ¶7V5fÇVRG¶–æFW‡ÖÓ¢fÇVRÒ—Ğ¢öäFC×²‡fÇVR’Óâ6†ævT÷F–öâ‚%õ5B"Â²Æ&VÃ¢f÷&Õ¶7V4Æ&VÂG¶–æFW‡ÖÒóò7V6–f–6F–öäf–VÆG5¶–æFW…ÒÂfÇVRÒ—Ğ¢öå&VæÖS×²†öÆEfÇVRÂæWufÇVR’Óâ6†ævT÷F–öâ‚%D4‚"Â²Æ&VÃ¢f÷&Õ¶7V4Æ&VÂG¶–æFW‡ÖÒóò7V6–f–6F–öäf–VÆG5¶–æFW…ÒÂöÆEfÇVRÂæWufÇVRÒ—Ğ¢öäFVÆWFS×²‡fÇVR’Óâ6†ævT÷F–öâ‚$DTÄUDR"Â²Æ&VÃ¢f÷&Õ¶7V4Æ&VÂG¶–æFW‡ÖÒóò7V6–f–6F–öäf–VÆG5¶–æFW…ÒÂfÇVRÒ—Ğ¢óà¢²†f÷&Õ¶7V4Æ&VÂG¶–æFW‡ÖÒóò7V6–f–6F–öäf–VÆG5¶–æFW…Ò’çG&–Ò‚’çFôÆ÷vW$66R‚’ÓÓÒ&ÖöFVÂ"bbÆF—b6Æ74æÖSÒ&×BÓ"fÆW‚fÆW‚×w&—FV×2Ö6VçFW"vÓ"&÷VæFVBÖÖB&÷&FW"&÷&FW"×f–öÆWBÓ#&r×f–öÆWBÓS‚Ó2’Ó"FW‡B×‡2#ãÇ7â6Æ74æÖSÒ&föçB×6VÖ–&öÆBWW&66RG&6¶–ær×v–FRFW‡B×f–öÆWBÓs#ävVæW&FVB4µSÂ÷7ããÆ6öFR6Æ74æÖSÒ&föçBÖ&öÆBFW‡B×f–öÆWBÓ“S#ç¶f÷&Òç6·RÇÂ$vVæW&F–æ~(
b'ÓÂö6öFSãÂöF—cçĞ¢ÂöF—cà¢Ä'WGFöâG—SÒ&'WGFöâ"f&–çCÒ&v†÷7B"6—¦SÒ&–6öâ"F—6&ÆVC×¶6÷VçBÃÒÒ&–ÖÆ&VÃ×¶&VÖ÷fRG¶f÷&Õ¶7V4Æ&VÂG¶–æFW‡ÖÒóò'7V6–f–6F–öâ'ÖÒF—FÆSÒ%&VÖ÷fRFWF–Â"öä6Æ–6³×²‚’Óâ&VÖ÷fU7V6–f–6F–öâ†–æFW‚—Ò6Æ74æÖSÒ'FW‡B×6ÆFRÓC†÷fW#§FW‡B×&÷6RÓcÖ‚×6Ó¦6öÂ×7F'BÓ"Ö‚×6Ó§&÷r×7F'BÓ#ãÅG&6ƒ"6Æ74æÖSÒ'6—¦RÓB"óãÂô'WGFöãà¢ÂöF—câ—ÓÂöF—cà¢ÆF—b6Æ74æÖSÒ'&÷VæFVBÖÆr&÷&FW"&÷&FW"ÖVÖW&ÆBÓ&rÖVÖW&ÆBÓSÓ2#ãÇ6Æ74æÖSÒ'FW‡B×‡2föçB×6VÖ–&öÆBWW&66RG&6¶–ær×v–FW"FW‡BÖVÖW&ÆBÓs#ävVæW&FVBFW67&—F–öãÂ÷ãÇ6Æ74æÖSÒ&×BÓ"Ö–âÖ‚ÓbFW‡B×6ÒÆVF–ærÓbFW‡B×6ÆFRÓs#ç¶FW67&—F–öâÇÂ$VçFW"7V6–f–6F–öâfÇVW2Fò'V–ÆBF†R—FVÒFW67&—F–öââ'ÓÂ÷ãÂöF—cà¢Â÷6V7F–öãà¢ÂöF—cã°§Ğ¦gVæ7F–öâ7V6–f–6F–öåfÇVU–6¶W"‡²Æ&VÂÂfÇVRÂ÷F–öç2Âöä6†ævRÂöäFBÂöå&VæÖRÂöäFVÆWFRÂÆ6V†öÆFW"Ò%6VÆV7B÷"VçFW"fÇVR"ÂWW&66RÒfÇ6RÓ¢²Æ&VÃ¢7G&–æs²fÇVS¢7G&–æs²÷F–öç3¢7G&–æuµÓ²öä6†ævS¢‡fÇVS¢7G&–ær’Óâfö–C²öäFC¢‡fÇVS¢7G&–ær’Óâ&öÖ—6SÇfö–Cã²öå&VæÖS¢†öÆEfÇVS¢7G&–ærÂæWufÇVS¢7G&–ær’Óâ&öÖ—6SÇfö–Cã²öäFVÆWFS¢‡fÇVS¢7G&–ær’Óâ&öÖ—6SÇfö–Cã²Æ6V†öÆFW#ó¢7G&–æs²WW&66Só¢&ööÆVâÒ’°¢6öç7Bæ÷&ÖÆ—¦VD–çWBÒ†–çWC¢7G&–ær’ÓâWW&66Rò–çWBçFôÆö6ÆUWW$66R‚&Vâ"’¢–çWC°¢6öç7B¶÷VâÂ6WD÷VåÒÒW6U7FFR†fÇ6R“°¢6öç7B¶6†ö–6U6V&6‚Â6WD6†ö–6U6V&6…ÒÒW6U7FFR‚""“°¢6öç7Bf–ÇFW&VD÷F–öç2Ò÷F–öç2æf–ÇFW"‚†÷F–öâ’Óâ÷F–öâçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†6†ö–6U6V&6‚çG&–Ò‚’çFôÆ÷vW$66R‚’’“°¢6öç7B¶æWufÇVRÂ6WDæWufÇVUÒÒW6U7FFR‚""“°¢6öç7B¶VF—F–ærÂ6WDVF—F–æuÒÒW6U7FFSÇ7G&–ærÂçVÆÃâ†çVÆÂ“°¢6öç7B¶VF—FVEfÇVRÂ6WDVF—FVEfÇVUÒÒW6U7FFR‚""“°¢6öç7B¶'W7’Â6WD'W7•ÒÒW6U7FFR†fÇ6R“° ¢6öç7B'VâÒ7–æ2†7F–öã¢‚’Óâ&öÖ—6SÇfö–CâÂ7V66W73¢7G&–ær’Óâ°¢6WD'W7’‡G'VR“°¢G'’²v—B7F–öâ‚“²Fö7Bç7V66W72‡7V66W72“²Ğ¢6F6‚†W'&÷"’²Fö7BæW'&÷"†W'&÷"–ç7Fæ6VöbW'&÷"òW'&÷"æÖW76vR¢$6÷VÆBæ÷BWFFRF†R6†ö–6R"“²Ğ¢f–æÆÇ’²6WD'W7’†fÇ6R“²Ğ¢Ó° ¢6öç7BFBÒ‚’Óâ°¢6öç7BæW‡BÒæ÷&ÖÆ—¦VD–çWB†æWufÇVRçG&–Ò‚’“°¢–b‚æW‡B’&WGW&ã°¢'Vâ†7–æ2‚’Óâ²v—BöäFB†æW‡B“²6WDæWufÇVR‚""“²ÒÂ$6†ö–6RFFVB"“°¢Ó°¢6öç7B&VæÖRÒ†öÆEfÇVS¢7G&–ær’Óâ°¢6öç7BæW‡BÒæ÷&ÖÆ—¦VD–çWB†VF—FVEfÇVRçG&–Ò‚’“°¢–b‚æW‡B’&WGW&ã°¢'Vâ†7–æ2‚’Óâ°¢v—Böå&VæÖR†öÆEfÇVRÂæW‡B“°¢–b‡fÇVRÓÓÒöÆEfÇVR’öä6†ævR†æW‡B“°¢6WDVF—F–ær†çVÆÂ“°¢ÒÂ$6†ö–6R&VæÖVB"“°¢Ó°¢6öç7B&VÖ÷fRÒ†÷F–öã¢7G&–ær’Óâ'Vâ†7–æ2‚’Óâ°¢v—BöäFVÆWFR†÷F–öâ“°¢–b‡fÇVRÓÓÒ÷F–öâ’öä6†ævR‚""“°¢ÒÂ$6†ö–6R&VÖ÷fVB"“° ¢&WGW&âÅ÷÷fW"ÖöFÂ÷Vã×¶÷VçÒöä÷Vä6†ævS×²†æW‡D÷Vâ’Óâ²6WD÷Vâ†æW‡D÷Vâ“²–b†æW‡D÷Vâ’6WD6†ö–6U6V&6‚‚""“²×Óà¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö–â×rÓ#à¢ÅFW‡F&V&÷w3×³Ò&Vc×²†VÆVÖVçB’Óâ²–b†VÆVÖVçB’²VÆVÖVçBç7G–ÆRæ†V–v‡BÒ&WFò#²VÆVÖVçBç7G–ÆRæ†V–v‡BÒG¶VÆVÖVçBç67&öÆÄ†V–v‡G×†²Ò×Ò&–ÖÆ&VÃ×¶G¶Æ&VÂÇÂ%7V6–f–6F–öâ'ÒfÇVVÒÆ6V†öÆFW#×·Æ6V†öÆFW'ÒfÇVS×·fÇVWÒöä6†ævS×²†WfVçB’Óâöä6†ævR†æ÷&ÖÆ—¦VD–çWB†WfVçBçF&vWBçfÇVR’—Ò6Æ74æÖSÒ&Ö–âÖ‚Ó’Ö–â×rÓ&W6—¦RÖæöæR÷fW&fÆ÷rÖ†–FFVâ&÷VæFVB×"ÖæöæR'&V²×v÷&G2"óà¢Å÷÷fW%G&–vvW"46†–ÆCãÄ'WGFöâG—SÒ&'WGFöâ"f&–çCÒ&÷WFÆ–æR"6—¦SÒ&–6öâ"F—FÆS×¶ÖævRG¶Æ&VÂÇÂ&FWF–Â'Ò6†ö–6W6Ò&–ÖÆ&VÃ×¶ÖævRG¶Æ&VÂÇÂ&FWF–Â'Ò6†ö–6W6Ò6Æ74æÖSÒ&‚ÖWFòÖ–âÖ‚Ó’6‡&–æ²Ó6VÆb×7G&WF6‚&÷VæFVBÖÂÖæöæR&÷&FW"ÖÂÓ#ãÄ6†Wg&öäF÷vâ6Æ74æÖSÒ'6—¦RÓB"óãÂô'WGFöããÂõ÷÷fW%G&–vvW#à¢ÂöF—cà¢Å÷÷fW$6öçFVçBFFÖGF6†ÖVçG2ÖW†6ÇVFVCÒ'G'VR"Æ–vãÒ'7F'B"6Æ74æÖSÒ&fÆW‚Ö‚Ö‚Õ·f"‚Ò×&F—‚×÷÷fW"Ö6öçFVçBÖf–Æ&ÆRÖ†V–v‡B•ÒrÕ¶Ö–âƒ3g&VÒÆ6Æ2ƒgrÓ'&VÒ’•ÒfÆW‚Ö6öÂvÓ2÷fW&fÆ÷r×’ÖWFòÓ2#à¢ÆF—cãÇ6Æ74æÖSÒ'FW‡B×6ÒföçBÖ&öÆBFW‡B×6ÆFRÓ“#ç¶Æ&VÂÇÂ$FWF–Â'Ò6†ö–6W3Â÷ãÇ6Æ74æÖSÒ'FW‡B×‡2FW‡B×6ÆFRÓS#å6VÆV7BÂFBÂ&VæÖR÷"&VÖ÷fR6†ö–6RãÂ÷ãÂöF—cà¢Ä–çWB&–ÖÆ&VÃ×¶6V&6‚G¶Æ&VÂÇÂ&FWF–Â'Ò6†ö–6W6ÒÆ6V†öÆFW#Ò%6V&6‚6†ö–6W>(
b"fÇVS×¶6†ö–6U6V&6‡Òöä6†ævS×²†WfVçB’Óâ6WD6†ö–6U6V&6‚†WfVçBçF&vWBçfÇVR—Òöä¶W”F÷vã×²†WfVçB’Óâ²–b†WfVçBæ¶W’ÓÓÒ$VçFW""’WfVçBç&WfVçDFVfVÇB‚“²×Ò6Æ74æÖSÒ'6‡&–æ²Ó"óà¢ÆF—b6Æ74æÖSÒ&Ö–âÖ‚ÓÖ‚Ö‚ÓcB76R×’Ó÷fW&fÆ÷r×’ÖWFò÷fW'67&öÆÂÖ6öçF–â"Ó"F$–æFWƒ×³Ò&öÆSÒ'&Vv–öâ"&–ÖÆ&VÃ×¶G¶Æ&VÂÇÂ$FWF–Â'Ò6†ö–6W6Óà¢¶f–ÇFW&VD÷F–öç2æÆVæwF‚ÓÓÒòÇ6Æ74æÖSÒ'&÷VæFVBÖÖB&r×6ÆFRÓSÓ2FW‡B×‡2FW‡B×6ÆFRÓS#ç¶÷F–öç2æÆVæwF‚ò$æòÖF6†–ær6†ö–6W2â"¢$æò6fVB6†ö–6W2–WBâ'ÓÂ÷â¢f–ÇFW&VD÷F–öç2æÖ‚†÷F–öâ’ÓâVF—F–ærÓÓÒ÷F–öâòÆF—b¶W“×¶÷F–öçÒ6Æ74æÖSÒ&fÆW‚vÓ#à¢Ä–çWBWFôfö7W2fÇVS×¶VF—FVEfÇVWÒöä6†ævS×²†WfVçB’Óâ6WDVF—FVEfÇVR†æ÷&ÖÆ—¦VD–çWB†WfVçBçF&vWBçfÇVR’—Òöä¶W”F÷vã×²†WfVçB’Óâ²–b†WfVçBæ¶W’ÓÓÒ$VçFW""’²WfVçBç&WfVçDFVfVÇB‚“²&VæÖR†÷F–öâ“²Ò×Ò6Æ74æÖSÒ&‚Ó‚"óà¢Ä'WGFöâG—SÒ&'WGFöâ"6—¦SÒ&–6öâ"f&–çCÒ&v†÷7B"F—6&ÆVC×¶'W7—Òöä6Æ–6³×²‚’Óâ&VæÖR†÷F–öâ—Ò&–ÖÆ&VÃÒ%6fR&VæÖVB6†ö–6R"6Æ74æÖSÒ'6—¦RÓ‚FW‡BÖVÖW&ÆBÓc#ãÄ6†V6²6Æ74æÖSÒ'6—¦RÓB"óãÂô'WGFöãà¢ÂöF—câ¢ÆF—b¶W“×¶÷F–öçÒ6Æ74æÖSÒ&w&÷WfÆW‚—FV×2Ö6VçFW"vÓ&÷VæFVBÖÖB†÷fW#¦&r×6ÆFRÓS#à¢Æ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×²‚’Óâ²öä6†ævR†÷F–öâ“²6WD÷Vâ†fÇ6R“²×Ò6Æ74æÖSÒ&Ö–â×rÓfÆW‚Óv†—FW76RÖæ÷&ÖÂ'&V²×v÷&G2¶÷fW&fÆ÷r×w&¦ç—v†W&UÒ‚Ó"’Ó"FW‡BÖÆVgBFW‡B×6Ò#ç¶÷F–öçÓÂö'WGFöãà¢Ä'WGFöâG—SÒ&'WGFöâ"6—¦SÒ&–6öâ"f&–çCÒ&v†÷7B"F—6&ÆVC×¶'W7—Òöä6Æ–6³×²‚’Óâ²6WDVF—F–ær†÷F–öâ“²6WDVF—FVEfÇVR†÷F–öâ“²×Ò&–ÖÆ&VÃ×¶&VæÖRG¶÷F–öçÖÒ6Æ74æÖSÒ'6—¦RÓ‚6‡&–æ²ÓFW‡B×6ÆFRÓC†÷fW#§FW‡B×6·’Óc#ãÅVæ6–Â6Æ74æÖSÒ'6—¦RÓ2ãR"óãÂô'WGFöãà¢Ä'WGFöâG—SÒ&'WGFöâ"6—¦SÒ&–6öâ"f&–çCÒ&v†÷7B"F—6&ÆVC×¶'W7—Òöä6Æ–6³×²‚’Óâ&VÖ÷fR†÷F–öâ—Ò&–ÖÆ&VÃ×¶&VÖ÷fRG¶÷F–öçÖÒ6Æ74æÖSÒ'6—¦RÓ‚6‡&–æ²ÓFW‡B×6ÆFRÓC†÷fW#§FW‡B×&÷6RÓc"F—FÆSÒ$FVÆWFR#ãÅG&6ƒ"6Æ74æÖSÒ'6—¦RÓ2ãR"óãÂô'WGFöãà¢ÂöF—câ—Ğ¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚6‡&–æ²ÓvÓ"&÷&FW"×BBÓ2#ãÄ–çWBfÇVS×¶æWufÇVWÒöä6†ævS×²†WfVçB’Óâ6WDæWufÇVR†æ÷&ÖÆ—¦VD–çWB†WfVçBçF&vWBçfÇVR’—Òöä¶W”F÷vã×²†WfVçB’Óâ²–b†WfVçBæ¶W’ÓÓÒ$VçFW""’²WfVçBç&WfVçDFVfVÇB‚“²FB‚“²Ò×ÒÆ6V†öÆFW#Ò$FBæWr6†ö–6R"6Æ74æÖSÒ&‚Ó’"óãÄ'WGFöâG—SÒ&'WGFöâ"6—¦SÒ'6Ò"F—6&ÆVC×¶'W7’ÇÂæWufÇVRçG&–Ò‚—Òöä6Æ–6³×¶FGÓãÅÇW26Æ74æÖSÒ'6—¦RÓB"óäFCÂô'WGFöããÂöF—cà¢Âõ÷÷fW$6öçFVçCà¢Âõ÷÷fW#ã°§Ğ¦gVæ7F–öâ66÷VçDf–VÆG2‡²f÷&ÒÂ6WDf÷&ÒÂ66÷VçG2Ó¢²f÷&Ó¢&V6÷&CÇ7G&–ærÂ7G&–æsã²6WDf÷&Ó¢†c¢&V6÷&CÇ7G&–ærÂ7G&–æsâ’Óâfö–C²66÷VçG3¢FF&V6÷&EµÒÒ’°¢6öç7B×VÇF”7W'&Væ7•&öÆRÒf÷&Òç7—7FVÕ&öÆRÓÓÒ$""ÇÂf÷&Òç7—7FVÕ&öÆRÓÓÒ$#°¢6öç7BfE&öÆRÒ²$”åUEõdB"Â$õUEUEõdB%Òæ–æ6ÇVFW2†f÷&Òç7—7FVÕ&öÆR’òf÷&Òç7—7FVÕ&öÆR¢&æöæR#°¢6öç7Bf–Æ&ÆU&öÆW2Ò66÷VçE&öÆT÷F–öç2æf–ÇFW"‚…·&öÆUÒ’Óâ²$”åUEõdB"Â$õUEUEõdB%Òæ–æ6ÇVFW2‡&öÆR’bb‡&öÆRÓÓÒ$""ÇÂ&öÆRÓÓÒ$"ÇÂ66÷VçG2ç6öÖR‚†66÷VçB’Óâ66÷VçBç7—7FVÕ&öÆRÓÓÒ&öÆR’’“°¢6öç7B6†ævU7—7FVÕ&öÆRÒ‡fÇVS¢7G&–ær’Óâ°¢6öç7B7—7FVÕ&öÆRÒfÇVRÓÓÒ&æöæR"ò""¢fÇVS°¢6öç7BG—RÒ7—7FVÕ&öÆRÓÓÒ$""ò$66÷VçG2&V6V—f&ÆR"¢7—7FVÕ&öÆRÓÓÒ$"ò$66÷VçG2–&ÆR"¢f÷&ÒçG—S°¢6WDf÷&Ò‡²ââæf÷&ÒÂ7—7FVÕ&öÆRÂG—RÒ“°¢Ó°¢&WGW&âÆF—b6Æ74æÖSÒ&w&–BvÓB6Ó¦w&–BÖ6öÇ2Ó"#à¢Äf–VÆBÆ&VÃÒ$66÷VçB6öFR"æÖSÒ&6öFR"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò&WV—&VBóà¢Äf–VÆBÆ&VÃÒ$66÷VçBæÖR"æÖSÒ&æÖR"f÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Ò&WV—&VBóà¢Ä6†ö–6RÆ&VÃÒ$66÷VçBG—R"æÖSÒ'G—R"fÇVW3×¶66÷VçEG—W4f÷%&öÆR†f÷&Òç7—7FVÕ&öÆRÇÂ""—Òf÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Òóà¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃäÆ–æ¶VB7—7FVÒW6SÂôÆ&VÃãÅ6VÆV7BfÇVS×·fE&öÆRÓÒ&æöæR"ò&æöæR"¢f÷&Òç7—7FVÕ&öÆRÇÂ&æöæR'ÒöåfÇVT6†ævS×¶6†ævU7—7FVÕ&öÆWÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRóãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCãÅ6VÆV7D—FVÒfÇVSÒ&æöæR#äæò7—7FVÒÆ–æ³Âõ6VÆV7D—FVÓç¶f–Æ&ÆU&öÆW2æÖ‚…·&öÆRÂÆ&VÅÒ’ÓâÅ6VÆV7D—FVÒ¶W“×·&öÆWÒfÇVS×·&öÆWÓç¶Æ&VÇÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÇ6Æ74æÖSÒ'FW‡B×‡2FW‡B×6ÆFRÓS#ç¶×VÇF”7W'&Væ7•&öÆRò$FBöæR6öçG&öÂ66÷VçBf÷"V6‚7W'&Væ7’W6VB'’7W7FöÖW'2÷"fVæF÷'2â"¢$Æ–æ¶VB66÷VçG2V"–â–çfö–6W2Â&–ÆÇ2Â&æ¶–ærÂdBæB–çfVçF÷'’÷7F–æw2â'ÓÂ÷ãÂöF—cà¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃåTRdB6öçG&öÃÂôÆ&VÃãÅ6VÆV7BfÇVS×·fE&öÆWÒöåfÇVT6†ævS×²‡fÇVR’Óâ²–b‡fÇVRÓÓÒ&æöæR"’²–b‡fE&öÆRÓÒ&æöæR"’6WDf÷&Ò‡²ââæf÷&ÒÂ7—7FVÕ&öÆS¢""ÂG—S¢$÷F†W"7W'&VçB76WB"Ò“²&WGW&ã²Ò6WDf÷&Ò‡²ââæf÷&ÒÂ7—7FVÕ&öÆS¢fÇVRÂG—S¢fÇVRÓÓÒ$”åUEõdB"ò$÷F†W"7W'&VçB76WB"¢$÷F†W"7W'&VçBÆ–&–Æ—G’"Ò“²×ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRóãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCãÅ6VÆV7D—FVÒfÇVSÒ&æöæR#äæ÷BdB6öçG&öÂ66÷VçCÂõ6VÆV7D—FVÓãÅ6VÆV7D—FVÒfÇVSÒ$”åUEõdB"F—6&ÆVC×¶66÷VçG2ç6öÖR‚†66÷VçB’Óâ66÷VçBç7—7FVÕ&öÆRÓÓÒ$”åUEõdB"—Óå&V6÷fW&&ÆR–çWBdCÂõ6VÆV7D—FVÓãÅ6VÆV7D—FVÒfÇVSÒ$õUEUEõdB"F—6&ÆVC×¶66÷VçG2ç6öÖR‚†66÷VçB’Óâ66÷VçBç7—7FVÕ&öÆRÓÓÒ$õUEUEõdB"—Óä÷WGWBdB–&ÆSÂõ6VÆV7D—FVÓãÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÇ6Æ74æÖSÒ'FW‡B×‡2FW‡B×6ÆFRÓS#ådB6öFW2æB&FW2&RÖævVB–âdBÖævVÖVçC²F†—2÷F–öâÆ–æ·2F†RÆVFvW"6öçG&öÂ66÷VçBãÂ÷ãÂöF—cà¢Ä6†ö–6RÆ&VÃ×¶×VÇF”7W'&Væ7•&öÆRò$6öçG&öÂ66÷VçB7W'&Væ7’¢"¢$66÷VçB7W'&Væ7’¢'ÒæÖSÒ&7W'&Væ7’"fÇVW3×¶7W'&Væ6–W7Òf÷&Ó×¶f÷&×Ò6WDf÷&Ó×·6WDf÷&×Òóà¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#ãÄÆ&VÃå7V"Ö66÷VçBöcÂôÆ&VÃãÅ6VÆV7BfÇVS×¶f÷&Òç&VçD66÷VçD–BÇÂ&æöæR'ÒöåfÇVT6†ævS×²‡fÇVR’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ&VçD66÷VçD–C¢fÇVRÓÓÒ&æöæR"ò""¢fÇVRÒ—ÓãÅ6VÆV7EG&–vvW"6Æ74æÖSÒ'rÖgVÆÂ#ãÅ6VÆV7EfÇVRóãÂõ6VÆV7EG&–vvW#ãÅ6VÆV7D6öçFVçCãÅ6VÆV7D—FVÒfÇVSÒ&æöæR#äæ÷B7V"Ö66÷VçCÂõ6VÆV7D—FVÓç¶66÷VçG2æÖ‚†66÷VçB’ÓâÅ6VÆV7D—FVÒ¶W“×¶66÷VçBæ–GÒfÇVS×µ7G&–ær†66÷VçBæ–B—Óçµ7G&–ær†66÷VçBæ6öFR—Ò+rµ7G&–ær†66÷VçBææÖR—ÓÂõ6VÆV7D—FVÓâ—ÓÂõ6VÆV7D6öçFVçCãÂõ6VÆV7CãÂöF—cà¢ ¢ÂöF—cã°§Ğ