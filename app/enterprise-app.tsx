"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle, ArrowRightLeft, BadgeDollarSign, Bell, BookOpen, BookOpenCheck, Boxes, Building2, CheckCircle2, Copy,
  Check, ChevronDown, ChevronRight, CircleDollarSign, Clock3, Download, FileBarChart2, Landmark,
  Eye, KeyRound, LayoutDashboard, LogOut, PackageCheck, PackageSearch, PackageX, Palette, Pencil, Plus, Printer, ReceiptText, RefreshCw,
  Search, Settings, ShieldCheck, ShoppingCart, Sun, Moon, Trash2, Users, WalletCards, Percent,
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
import { UserRoleCenter } from "@/app/user-role-center";
import { VatCodeCenter, type VatCodeRecord } from "@/app/vat-code-center";
import { CurrencyRateCenter, type ExchangeRateRecord } from "@/app/currency-rate-center";
import { JournalEntryCenter } from "@/app/journal-entry-center";

type View = "dashboard" | "inventory-overview" | "sales" | "receive-payment" | "purchases" | "write-cheque" | "customers" | "vendors" | "inventory" | "transfers" | "banking" | "journal-entries" | "accounts" | "employees" | "reports" | "companies" | "inventories" | "invoice-series" | "currencies" | "vat-codes" | "admin-controls";
type AppRole = "admin" | "accountant" | "sales" | "purchasing" | "inventory" | "viewer";
type UserTheme = "emerald" | "ocean" | "indigo" | "violet" | "rose" | "amber";
type AppearanceMode = "light" | "dark";
type CurrentUser = { id: number; fullName: string; email: string; avatarData: string; themeColor: string; appearanceMode: AppearanceMode; role: AppRole; mustChangePassword: boolean };
type Kind = "transactions" | "contacts" | "items" | "accounts";
type DataRecord = Record<string, string | number | boolean> & { id: number };
type LineForm = { itemId: string; description: string; quantity: string; unitPrice: string; unitCost: string; vatCode: string; vatRate: string };
type InventoryLocation = { id: number; companyId: number; name: string; code: string; invoicePrefix: string; nextInvoiceNumber: number; receivable?: number; payable?: number };
type CompanyWorkspace = { id: number; name: string; baseCurrency: string; locations: InventoryLocation[] };
type ReportData = { title: string; generatedAt: string; currency: string; columns: Array<{ key: string; label: string; type?: "money" }>; rows: Array<Record<string, string | number>> };
type TransactionDetail = { record: DataRecord; lines: DataRecord[]; journal: DataRecord[] };

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
    { id: "transfers", label: "Stock Transfers", icon: ArrowRightLeft },
    { id: "banking", label: "Banking", icon: Landmark },
    { id: "journal-entries", label: "General Journal", icon: BookOpenCheck },
    { id: "accounts", label: "Chart of Accounts", icon: BookOpen },
    { id: "employees", label: "Employees & HR", icon: WalletCards },
    { id: "reports", label: "Reports", icon: FileBarChart2 },
  ] },
  { label: "MANAGEMENT", items: [
    { id: "companies", label: "Companies", icon: Building2 },
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
  accountant: ["dashboard", "inventory-overview", "sales", "receive-payment", "customers", "purchases", "write-cheque", "vendors", "banking", "journal-entries", "accounts", "reports"],
  sales: ["dashboard", "inventory-overview", "sales", "receive-payment", "customers"],
  purchasing: ["dashboard", "inventory-overview", "purchases", "write-cheque", "vendors"],
  inventory: ["dashboard", "inventory-overview", "inventory", "transfers"],
  viewer: ["dashboard", "inventory-overview", "reports"],
};

const roleWriteViews: Record<AppRole, readonly View[]> = {
  admin: ["sales", "receive-payment", "customers", "purchases", "write-cheque", "vendors", "inventory", "transfers", "banking", "journal-entries", "accounts", "employees", "companies", "inventories", "invoice-series", "currencies", "vat-codes", "admin-controls"],
  accountant: ["sales", "receive-payment", "customers", "purchases", "write-cheque", "vendors", "banking", "journal-entries", "accounts"],
  sales: ["sales", "receive-payment", "customers"],
  purchasing: ["purchases", "write-cheque", "vendors"],
  inventory: ["inventory", "transfers"],
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
  transfers: { title: "Stock Transfers", sub: "Move stock between companies and inventory locations" },
  banking: { title: "Banking", sub: "Deposits, cheques, transfers and account activity" },
  "journal-entries": { title: "General Journal Entries", sub: "Post balanced debits and credits directly to the ledger" },
  accounts: { title: "Chart of Accounts", sub: "Assets, liabilities, equity, income and expenses" },
  employees: { title: "Employees & HR", sub: "Employee records and balances" },
  reports: { title: "Report Center", sub: "Financial, sales, purchasing and inventory analysis" },
  companies: { title: "Companies", sub: "Create and switch between separate company files" },
  inventories: { title: "Inventories", sub: "Manage warehouses, showrooms and stock locations" },
  "invoice-series": { title: "Invoice Series", sub: "Customize invoice numbering for every company inventory" },
  currencies: { title: "Currencies", sub: "Set company currency and transaction currencies" },
  "vat-codes": { title: "VAT Codes", sub: "Manage tax rates and usage details for transaction dropdowns" },
  "admin-controls": { title: "Admin Controls", sub: "Protect restricted inventory operations for this company" },
};

const transactionTypes: Record<string, string[]> = {
  sales: ["invoice", "estimate", "sales order", "sales receipt", "credit memo", "customer payment"],
  "receive-payment": ["customer payment"],
  purchases: ["bill", "purchase order", "expense", "vendor credit", "bill payment"],
  "write-cheque": ["cheque"],
  banking: ["deposit", "cheque", "transfer", "opening balance"],
  dashboard: ["invoice", "bill", "expense", "deposit", "cheque", "journal entry"],
};

const allReports = [
  ["Profit & Loss Standard", "Income and expenses by period", "Financial", "profit-loss"],
  ["Balance Sheet Standard", "Assets, liabilities and equity", "Financial", "balance-sheet"],
  ["Statement of Cash Flows", "Operating cash movement", "Financial", "cash-flow"],
  ["Trial Balance", "Debit and credit balances by account", "Accountant", "trial-balance"],
  ["General Ledger", "Complete account transaction detail", "Accountant", "general-ledger"],
  ["Journal", "Posted debits and credits", "Accountant", "journal"],
  ["A/R Aging Summary", "Outstanding customer balances by age", "Customers", "ar-aging-summary"],
  ["A/R Aging Detail", "Open invoices and credit detail", "Customers", "ar-aging-detail"],
  ["Sales by Customer", "Revenue grouped by customer", "Sales", "sales-by-customer"],
  ["Sales by Item", "Quantity and revenue by product", "Sales", "sales-by-item"],
  ["Open Invoices", "Unpaid and partially paid invoices", "Sales", "open-invoices"],
  ["Sales Order Fulfilment", "Open and fulfilled orders", "Sales", "sales-orders"],
  ["A/P Aging Summary", "Outstanding vendor balances by age", "Vendors", "ap-aging-summary"],
  ["A/P Aging Detail", "Open bills and credits", "Vendors", "ap-aging-detail"],
  ["Purchases by Vendor", "Spending grouped by supplier", "Purchases", "purchases-by-vendor"],
  ["Purchases by Item", "Purchased quantity and cost by item", "Purchases", "purchases-by-item"],
  ["Open Purchase Orders", "Committed purchases not received", "Purchases", "open-purchase-orders"],
  ["Inventory Valuation", "Quantity, average cost and stock value", "Inventory", "inventory-valuation"],
  ["Inventory Stock Status", "Available and reorder position", "Inventory", "inventory-status"],
  ["Physical Inventory Worksheet", "Count sheet for stock verification", "Inventory", "physical-inventory"],
  ["Item Profitability", "Gross profit by inventory item", "Inventory", "item-profitability"],
  ["Customer Balance Summary", "Balance totals by customer", "Customers", "customer-balances"],
  ["Vendor Balance Summary", "Balance totals by vendor", "Vendors", "vendor-balances"],
  ["Transaction List by Date", "All activity in chronological order", "Company", "transactions"],
] as const;

const currencies = ["AED", "USD", "EUR", "GBP", "SAR", "OMR", "QAR", "BHD", "KWD", "INR", "CNY", "HKD", "JPY", "CAD", "AUD"];
const formatMoney = (value: unknown, currency = "AED") => new Intl.NumberFormat("en-AE", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value ?? 0));
const today = () => new Date().toISOString().slice(0, 10);
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
const linkedAccountName = (accounts: DataRecord[], role: string, fallback: string) => String(accounts.find((account) => account.active && account.systemRole === role)?.name ?? fallback);
const defaultPostingAccount = (type: string, accounts: DataRecord[]) => {
  if (type === "bill") return linkedAccountName(accounts, "PURCHASES", "Purchases");
  if (type === "cheque") return linkedAccountName(accounts, "AP", "Accounts Payable");
  if (type === "customer payment") return linkedAccountName(accounts, "BANK", "Business Bank");
  if (["invoice", "sales receipt"].includes(type)) return linkedAccountName(accounts, "SALES", "Sales Revenue");
  if (type === "expense") return linkedAccountName(accounts, "EXPENSE", "Operating Expenses");
  if (type === "deposit") return linkedAccountName(accounts, "OTHER_INCOME", "Other Income");
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
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<LineForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [companies, setCompanies] = useState<CompanyWorkspace[]>([]);
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

  const metrics = useMemo(() => {
    const tx = records.transactions;
    const sales = tx.filter((r) => ["invoice", "sales receipt", "customer payment", "deposit"].includes(String(r.type))).reduce((n, r) => n + Number(r.baseTotal ?? r.total), 0);
    const expenses = tx.filter((r) => ["bill", "expense", "cheque", "bill payment"].includes(String(r.type))).reduce((n, r) => n + Number(r.baseTotal ?? r.total), 0);
    const receivable = tx.reduce((balance, transaction) => transaction.type === "invoice" ? balance + Number(transaction.baseTotal ?? transaction.total) : ["customer payment", "credit memo"].includes(String(transaction.type)) ? balance - Number(transaction.baseTotal ?? transaction.total) : balance, 0);
    const payableAccount = linkedAccountName(records.accounts, "AP", "Accounts Payable");
    const payable = tx.reduce((balance, transaction) => transaction.type === "bill" ? balance + Number(transaction.baseTotal ?? transaction.total) : ["bill payment", "vendor payment", "vendor credit"].includes(String(transaction.type)) || (transaction.type === "cheque" && transaction.account === payableAccount) ? balance - Number(transaction.baseTotal ?? transaction.total) : balance, 0);
    return { sales, expenses, receivable, payable, cash: sales - expenses };
  }, [records.accounts, records.transactions]);

  const currentKind: Kind = view === "customers" || view === "vendors" || view === "employees" ? "contacts" : view === "inventory" ? "items" : view === "accounts" ? "accounts" : "transactions";
  const managementView = view === "inventory-overview" || view === "transfers" || view === "journal-entries" || view === "companies" || view === "inventories" || view === "invoice-series" || view === "currencies" || view === "vat-codes" || view === "admin-controls";
  const visibleNavGroups = navGroups.map((group) => ({ ...group, items: group.items.filter((item) => roleViews[currentUser.role].includes(item.id)) })).filter((group) => group.items.length > 0);
  const canWriteCurrentView = roleWriteViews[currentUser.role].includes(view);

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

  function openCreate() {
    setEditingItemId(null);
    if (currentKind === "transactions") {
      const type = transactionTypes[view]?.[0] ?? "invoice";
      if (type === "invoice") {
        setInvoiceInventoryOpen(true);
        return;
      }
      const prefix = type === "customer payment" ? "PAY" : type === "cheque" ? "CHQ" : type.slice(0, 3).toUpperCase();
      const taxFree = ["bill", "customer payment", "bill payment"].includes(type);
      const description = type === "customer payment" ? "Payment received" : type === "cheque" ? "Cheque payment" : "";
      setForm({ type, number: `${prefix}-${String(records.transactions.length + 1).padStart(4, "0")}`, transactionDate: today(), dueDate: today(), status: "open", account: defaultPostingAccount(type, records.accounts), vatRate: taxFree ? "0" : "5", currency: baseCurrency, exchangeRate: "1", billLocationId: String(activeLocationId), transactionLocationId: String(activeLocationId), salesman: "", isImport: "false", freightCharges: "0" });
      setLines([{ itemId: "", description, quantity: "1", unitPrice: "0", unitCost: "0", vatCode: taxFree ? "ZERO" : "STANDARD", vatRate: taxFree ? "0" : "5" }]);
    } else if (currentKind === "contacts") {
      const type = view === "customers" ? "customer" : view === "vendors" ? "vendor" : "employee";
      setForm(type === "customer" ? { type, currency: baseCurrency, reseller: "Reseller", planet: "No", balance: "0" } : { type, currency: baseCurrency, balance: "0" });
    }
    else if (currentKind === "items") {
      const initialFields = specificationFields.filter((label) => label !== "Product Category").slice(0, 8);
      const itemForm: Record<string, string> = { category: "Laptop", quantity: "0", reorderPoint: "0", salesPrice: "0", cost: "0", specCount: String(initialFields.length) };
      initialFields.forEach((label, index) => { itemForm[`specLabel${index}`] = label; itemForm[`specValue${index}`] = ""; });
      setForm(itemForm);
    }
    else setForm({ type: "Expense", balance: "0", parentAccountId: "" });
    setDialogOpen(true);
  }

  function startInvoice(location: InventoryLocation) {
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
    setForm(itemForm);
    setDialogOpen(true);
  }

  async function saveRecord(event: FormEvent) {
    event.preventDefault();
    if (currentKind === "contacts" && form.type === "customer") {
      const required = [form.company, form.name, form.phone, form.whatsapp, form.country, form.reseller, form.planet, form.currency];
      if (required.some((value) => !value?.trim())) return toast.error("Complete all required customer fields.");
    }
    if (currentKind === "contacts" && form.type === "vendor") {
      const required = [form.company, form.name, form.phone, form.country, form.currency];
      if (required.some((value) => !value?.trim())) return toast.error("Complete all required vendor fields.");
    }
    if (currentKind === "transactions" && form.type === "bill") {
      const required = [form.party, form.number, form.transactionDate, form.currency, form.exchangeRate, form.billLocationId];
      if (required.some((value) => !value?.trim()) || Number(form.exchangeRate) <= 0) return toast.error("Complete the vendor, reference, date, inventory, currency and exchange rate.");
      if (Number(form.freightCharges ?? 0) < 0) return toast.error("Freight charges cannot be negative.");
      if (lines.some((line) => !line.description.trim() || Number(line.quantity) <= 0 || Number(line.unitPrice) < 0)) return toast.error("Complete every bill line with a description, positive quantity and valid rate.");
    }
    if (currentKind === "transactions" && ["customer payment", "cheque"].includes(form.type)) {
      const required = [form.party, form.number, form.transactionDate, form.currency, form.transactionLocationId];
      if (required.some((value) => !value?.trim())) return toast.error("Complete the party, reference, date, inventory and currency.");
      if (Number(lines[0]?.unitPrice ?? 0) <= 0) return toast.error("Enter an amount greater than zero.");
    }
    setSaving(true);
    try {
      const editingItem = currentKind === "items" && editingItemId !== null;
      const billFreightCharge = currentKind === "transactions" && form.type === "bill" ? Number(form.freightCharges ?? 0) : 0;
      const billVatRate = form.isImport === "true" ? "5" : "0";
      const submittedLines = billFreightCharge > 0 ? [...lines, { itemId: "", description: "Freight Charges", quantity: "1", unitPrice: String(billFreightCharge), unitCost: String(billFreightCharge), vatCode: billVatRate === "5" ? "STANDARD" : "ZERO", vatRate: billVatRate }] : lines;
      const selectedLocationId = currentKind === "transactions" && form.type === "bill" ? Number(form.billLocationId || activeLocationId) : currentKind === "transactions" ? Number(form.transactionLocationId || activeLocationId) : activeLocationId;
      const response = await fetch("/api/records", { method: editingItem ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: currentKind, companyId: activeCompanyId, locationId: selectedLocationId, ...(editingItem ? { id: editingItemId } : {}), ...form, ...(currentKind === "transactions" ? { lines: submittedLines } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save record");
      setRecords((old) => ({ ...old, [currentKind]: editingItem ? old[currentKind].map((record) => record.id === data.record.id ? data.record : record) : [data.record, ...old[currentKind]] }));
      setDialogOpen(false); setEditingItemId(null); toast.success(editingItem ? "Item updated" : "Record saved and posted");
      if (currentKind === "transactions" && selectedLocationId !== activeLocationId) setActiveLocationId(selectedLocationId);
      else await loadData();
      if (currentKind === "transactions" && form.type === "invoice") await loadWorkspaces();
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

  async function openReport(key: string) {
    setReportLoading(true);
    try {
      const response = await fetch(`/api/reports?type=${key}&companyId=${activeCompanyId}&locationId=${activeLocationId}&currency=${baseCurrency}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate report");
      setReport(data.report);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not generate report"); }
    finally { setReportLoading(false); }
  }

  const heading = viewTitles[view];
  const createLabel = currentKind === "contacts" ? `New ${view === "employees" ? "Employee" : view === "vendors" ? "Vendor" : "Customer"}` : currentKind === "items" ? "New Item" : currentKind === "accounts" ? "New Account" : view === "purchases" ? "Enter Bill" : view === "receive-payment" ? "Receive Payment" : view === "write-cheque" ? "Write Cheque" : `New ${transactionTypes[view]?.[0] ?? "Transaction"}`;

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
          {view === "inventory-overview" ? <InventoryOverview /> : view === "transfers" ? <MultiLineTransferCenter key={`${activeCompanyId}-${activeLocationId}`} companies={companies} activeLocationId={activeLocationId} onTransferred={loadData} /> : view === "journal-entries" ? <JournalEntryCenter key={`${activeCompanyId}-${activeLocationId}`} companyId={activeCompanyId} companyName={activeCompany?.name ?? "Company"} locationId={activeLocationId} locationName={activeLocations.find((location) => location.id === activeLocationId)?.name ?? "Inventory"} currency={baseCurrency} accounts={records.accounts.map((account) => ({ id: account.id, code: String(account.code), name: String(account.name), type: String(account.type), active: Boolean(account.active) }))} onPosted={loadData} /> : view === "currencies" ? <CurrencyRateCenter key={activeCompanyId} company={activeCompany} currencies={currencies} onCompanyChanged={loadWorkspaces} onRatesChanged={loadExchangeRates} /> : view === "vat-codes" ? <VatCodeCenter key={activeCompanyId} companyId={activeCompanyId} companyName={activeCompany?.name ?? "Company"} onChanged={loadVatCodes} /> : view === "admin-controls" ? <AdminSettingsCenter key={activeCompanyId} companyId={activeCompanyId} companyName={activeCompany?.name ?? "Company"} currentUserEmail={currentUser.email} /> : managementView ? <WorkspaceCenter mode={view as "companies" | "inventories" | "invoice-series" | "currencies"} companies={companies} activeCompanyId={activeCompanyId} onChanged={loadWorkspaces} /> : view === "dashboard" ? <Dashboard metrics={metrics} records={records} companyName={activeCompany?.name ?? "Company"} currency={baseCurrency} themeColor={themeColor} themeSaving={themeSaving} onThemeChange={changeTheme} onNavigate={(next) => { if (roleViews[currentUser.role].includes(next)) setView(next); }} onCreate={openCreate} onOpenDetail={openDetail} canCreate={roleWriteViews[currentUser.role].includes("sales")} canViewReports={roleViews[currentUser.role].includes("reports")} /> : view === "reports" ? <ReportCenter metrics={metrics} currency={baseCurrency} onOpen={openReport} loading={reportLoading} /> : (
            <RecordView view={view} kind={currentKind} records={filteredRecords} currency={baseCurrency} loading={loading} search={search} setSearch={setSearch} onRefresh={loadData} onCreate={openCreate} onDelete={removeRecord} onEditItem={openItemEdit} onDuplicateItem={duplicateItem} onOpenDetail={openDetail} canWrite={canWriteCurrentView} canDelete={currentUser.role === "admin"} />
          )}
        </div>
      </SidebarInset>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingItemId(null); }}>
        <DialogContent className={`max-h-[90vh] overflow-y-auto ${currentKind === "transactions" || currentKind === "items" || (currentKind === "contacts" && view === "customers") ? "sm:max-w-5xl" : "sm:max-w-xl"}`}>
          <DialogHeader><DialogTitle>{editingItemId !== null && currentKind === "items" ? "Edit Item" : createLabel}</DialogTitle><DialogDescription>{editingItemId !== null && currentKind === "items" ? "Update the category and item description details." : currentKind === "transactions" && form.type === "bill" ? "Select the vendor and enter the bill items below." : "Enter the record details below. Required fields are marked."}</DialogDescription></DialogHeader>
          <form onSubmit={saveRecord} className="space-y-5">
            {currentKind === "transactions" && <TransactionFields form={form} setForm={setForm} types={transactionTypes[view] ?? transactionTypes.dashboard} items={records.items} contacts={records.contacts} accounts={records.accounts} locations={activeLocations} lines={lines} setLines={setLines} vatCodeOptions={vatCodeOptions} exchangeRates={exchangeRates} baseCurrency={baseCurrency} />}
            {currentKind === "contacts" && <ContactFields form={form} setForm={setForm} />}
            {currentKind === "items" && <ItemFields form={form} setForm={setForm} items={records.items} />}
            {currentKind === "accounts" && <AccountFields form={form} setForm={setForm} accounts={records.accounts} />}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saving} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">{saving ? "Saving…" : editingItemId !== null && currentKind === "items" ? "Save changes" : "Save record"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={invoiceInventoryOpen} onOpenChange={setInvoiceInventoryOpen}>
        <DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>Select Inventory</DialogTitle><DialogDescription>Choose which company inventory will issue this invoice. Every company and inventory combination has its own invoice-number series.</DialogDescription></DialogHeader><div className="grid gap-3 py-3 sm:grid-cols-2 lg:grid-cols-3">{activeLocations.map((location) => <button type="button" key={location.id} onClick={() => startInvoice(location)} className="rounded-xl border-2 border-slate-200 bg-white p-5 text-left transition hover:border-emerald-400 hover:bg-emerald-50"><p className="font-semibold text-slate-900">{location.name}</p><p className="mt-2 font-mono text-xs text-slate-500">Next: {invoiceNumberPreview(activeCompanyId, location)}</p></button>)}</div>{activeLocations.length === 0 && <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Add an inventory location before creating an invoice.</p>}</DialogContent>
      </Dialog>
      <DocumentDialog detail={detail} companyName={activeCompany?.name ?? "Company"} baseCurrency={baseCurrency} onClose={() => setDetail(null)} />
      <ReportDialog report={report} companyName={activeCompany?.name ?? "Company"} onClose={() => setReport(null)} />
      <WorkspaceDialog open={workspaceOpen} companies={companies} activeCompanyId={activeCompanyId} onClose={() => setWorkspaceOpen(false)} onChanged={loadWorkspaces} />
      <Toaster richColors position="bottom-right" />
    </SidebarProvider>
  );
}

function Dashboard({ metrics, records, companyName, currency, themeColor, themeSaving, onThemeChange, onNavigate, onCreate, onOpenDetail, canCreate, canViewReports }: { metrics: Record<string, number>; records: Record<Kind, DataRecord[]>; companyName: string; currency: string; themeColor: UserTheme; themeSaving: boolean; onThemeChange: (theme: UserTheme) => void; onNavigate: (v: View) => void; onCreate: () => void; onOpenDetail: (id: number) => void; canCreate: boolean; canViewReports: boolean }) {
  const recent = records.transactions.slice(0, 6);
  const cards = [
    ["Cash position", metrics.cash, CircleDollarSign, "Available net cash", "emerald"],
    ["Accounts receivable", metrics.receivable, Clock3, "Open customer invoices", "blue"],
    ["Accounts payable", metrics.payable, BadgeDollarSign, "Open vendor bills", "amber"],
    ["Inventory value", records.items.reduce((n, i) => n + Number(i.quantity) * Number(i.cost), 0), PackageSearch, `${records.items.length} active items`, "violet"],
  ] as const;
  const max = Math.max(metrics.sales, metrics.expenses, 1);
  return <div className="space-y-6">
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
  </div>;
}

function StatusLine({ label, value, action }: { label: string; value: number; action: () => void }) { return <button onClick={action} className="brand-status-line flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left"><span className="text-sm text-slate-600">{label}</span><span className="flex items-center gap-2 font-bold text-slate-900">{value}<ChevronRight className="size-4 text-slate-400" /></span></button>; }

function RecordView({ view, kind, records, currency, loading, search, setSearch, onRefresh, onCreate, onDelete, onEditItem, onDuplicateItem, onOpenDetail, canWrite, canDelete }: { view: View; kind: Kind; records: DataRecord[]; currency: string; loading: boolean; search: string; setSearch: (v: string) => void; onRefresh: () => void; onCreate: () => void; onDelete: (id: number) => void; onEditItem: (item: DataRecord) => void; onDuplicateItem: (id: number) => void; onOpenDetail: (id: number) => void; canWrite: boolean; canDelete: boolean }) {
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
    {kind === "transactions" ? <TransactionTable records={visibleRecords} empty={loading ? "Loading records…" : "No transactions found."} onDelete={canDelete ? onDelete : undefined} onOpen={onOpenDetail} /> : kind === "contacts" ? <ContactTable records={visibleRecords} empty={loading ? "Loading records…" : "No contacts found."} onDelete={canDelete ? onDelete : undefined} /> : kind === "items" ? <ItemTable records={visibleRecords} currency={currency} empty={loading ? "Loading records…" : stockFilter === "out" ? "No out-of-stock items found." : "No inventory items found."} onDelete={canDelete ? onDelete : undefined} onEdit={canWrite ? onEditItem : undefined} onDuplicate={canWrite ? onDuplicateItem : undefined} /> : <AccountTable records={visibleRecords} currency={currency} empty={loading ? "Loading records…" : "No accounts found."} onDelete={canDelete ? onDelete : undefined} />}
  </section>;
}

function EmptyRow({ text, columns }: { text: string; columns: number }) { return <TableRow><TableCell colSpan={columns} className="h-40 text-center text-sm text-slate-500">{text}</TableCell></TableRow>; }
function DeleteButton({ id, onDelete }: { id: number; onDelete?: (id: number) => void }) { return onDelete ? <Button variant="ghost" size="icon" onClick={() => onDelete(id)} aria-label="Delete record" className="text-slate-400 hover:text-rose-600"><Trash2 className="size-4" /></Button> : null; }
function TransactionTable({ records, empty, onDelete, onOpen }: { records: DataRecord[]; empty: string; onDelete?: (id: number) => void; onOpen?: (id: number) => void }) { return <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>No.</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-24" /></TableRow></TableHeader><TableBody>{records.length === 0 ? <EmptyRow text={empty} columns={7} /> : records.map((r) => <TableRow key={r.id} className="cursor-pointer" onDoubleClick={() => onOpen?.(r.id)}><TableCell className="text-slate-500">{String(r.transactionDate)}</TableCell><TableCell className="font-medium capitalize">{String(r.type)}</TableCell><TableCell className="font-mono text-xs text-slate-500">{String(r.number)}</TableCell><TableCell>{String(r.party)}</TableCell><TableCell><StatusBadge value={String(r.status)} /></TableCell><TableCell className="text-right font-semibold">{formatMoney(r.total, String(r.currency || "AED"))}</TableCell><TableCell><div className="flex"><Button variant="ghost" size="icon" onClick={() => onOpen?.(r.id)} aria-label="Open document" className="text-slate-400 hover:text-emerald-600"><Eye className="size-4" /></Button><DeleteButton id={r.id} onDelete={onDelete} /></div></TableCell></TableRow>)}</TableBody></Table>; }
function ContactTable({ records, empty, onDelete }: { records: DataRecord[]; empty: string; onDelete?: (id: number) => void }) { return <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Company</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{records.length === 0 ? <EmptyRow text={empty} columns={7} /> : records.map((r) => <TableRow key={r.id}><TableCell className="font-semibold">{String(r.name)}</TableCell><TableCell>{String(r.company || "—")}</TableCell><TableCell>{String(r.email || "—")}</TableCell><TableCell>{String(r.phone || "—")}</TableCell><TableCell><StatusBadge value={String(r.status)} /></TableCell><TableCell className="text-right font-semibold">{formatMoney(r.balance, String(r.currency || "AED"))}</TableCell><TableCell><DeleteButton id={r.id} onDelete={onDelete} /></TableCell></TableRow>)}</TableBody></Table>; }
function ItemTable({ records, currency, empty, onDelete, onEdit, onDuplicate }: { records: DataRecord[]; currency: string; empty: string; onDelete?: (id: number) => void; onEdit?: (item: DataRecord) => void; onDuplicate?: (id: number) => void }) { return <Table><TableHeader><TableRow><TableHead>Item No.</TableHead><TableHead>SKU</TableHead><TableHead>Item & description</TableHead><TableHead>Category</TableHead><TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Reorder</TableHead><TableHead className="text-right">Sales price</TableHead><TableHead className="text-right">Avg. cost</TableHead><TableHead className="w-32" /></TableRow></TableHeader><TableBody>{records.length === 0 ? <EmptyRow text={empty} columns={9} /> : records.map((r) => { const description = itemDisplayDescription(r); const out = Number(r.quantity) <= 0; return <TableRow key={r.id}><TableCell className="font-mono text-xs">{String(r.itemNumber || 13000 + r.id)}</TableCell><TableCell className="font-mono text-xs">{String(r.sku)}</TableCell><TableCell><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{String(r.name)}</p>{out ? <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">Out of stock</Badge> : null}</div>{description ? <p className="mt-1 max-w-lg truncate text-xs text-slate-500" title={description}>{description}</p> : null}</TableCell><TableCell>{String(r.category)}</TableCell><TableCell className={`text-right font-semibold ${out ? "text-rose-600" : ""}`}>{String(r.quantity)}</TableCell><TableCell className="text-right">{String(r.reorderPoint)}</TableCell><TableCell className="text-right">{formatMoney(r.salesPrice, currency)}</TableCell><TableCell className="text-right">{formatMoney(r.cost, currency)}</TableCell><TableCell><div className="flex">{onDuplicate && <Button type="button" variant="ghost" size="icon" onClick={() => onDuplicate(r.id)} aria-label={`Duplicate ${String(r.name)}`} title="Duplicate item" className="text-slate-400 hover:text-violet-600"><Copy className="size-4" /></Button>}{onEdit && <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(r)} aria-label={`Edit ${String(r.name)}`} className="text-slate-400 hover:text-sky-600"><Pencil className="size-4" /></Button>}<DeleteButton id={r.id} onDelete={onDelete} /></div></TableCell></TableRow>; })}</TableBody></Table>; }
function AccountTable({ records, currency, empty, onDelete }: { records: DataRecord[]; currency: string; empty: string; onDelete?: (id: number) => void }) { return <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Account name</TableHead><TableHead>Linked use</TableHead><TableHead>Sub-account of</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{records.length === 0 ? <EmptyRow text={empty} columns={8} /> : records.map((r) => { const parent = records.find((candidate) => candidate.id === Number(r.parentAccountId)); const role = accountRoleOptions.find(([value]) => value === r.systemRole); return <TableRow key={r.id}><TableCell className="font-mono text-xs">{String(r.code)}</TableCell><TableCell className="font-semibold">{String(r.name)}</TableCell><TableCell>{role ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{role[1]}</Badge> : <span className="text-slate-400">Unlinked</span>}</TableCell><TableCell className="text-slate-500">{parent ? String(parent.name) : "—"}</TableCell><TableCell>{String(r.type)}</TableCell><TableCell><Badge variant="outline">{r.active ? "Active" : "Inactive"}</Badge></TableCell><TableCell className="text-right font-semibold">{formatMoney(r.balance, currency)}</TableCell><TableCell><DeleteButton id={r.id} onDelete={onDelete} /></TableCell></TableRow>; })}</TableBody></Table>; }
function StatusBadge({ value }: { value: string }) { const good = value === "paid" || value === "active" || value === "cleared"; return <Badge variant="outline" className={good ? "border-emerald-200 bg-emerald-50 text-emerald-700" : value === "overdue" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700"}>{value}</Badge>; }

function ReportCenter({ metrics, currency, onOpen, loading }: { metrics: Record<string, number>; currency: string; onOpen: (key: string) => void; loading: boolean }) {
  const [reportSearch, setReportSearch] = useState("");
  const normalizedSearch = reportSearch.trim().toLowerCase();
  const reports = allReports.filter(([name, description, category]) =>
    !normalizedSearch || [name, description, category].some((value) => value.toLowerCase().includes(normalizedSearch)),
  );
  return <div className="grid gap-6 xl:grid-cols-[1fr_320px]"><section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Available reports</h2><p className="text-sm text-slate-500">{reports.length === allReports.length ? "Every report opens with live data from the posted ledger." : `Showing ${reports.length} of ${allReports.length} reports.`}</p></div><div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder="Search reports..." aria-label="Search reports" className="bg-white pl-9" /></div></div><div className="grid gap-px bg-slate-200 sm:grid-cols-2">{reports.length > 0 ? reports.map(([name, description, category, key]) => <button key={name} disabled={loading} onClick={() => onOpen(key)} className="group bg-white p-5 text-left hover:bg-emerald-50 disabled:opacity-60"><div className="flex items-start justify-between"><div className="grid size-9 place-items-center rounded-lg bg-slate-100 text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-700"><FileBarChart2 className="size-4" /></div><ChevronRight className="size-4 text-slate-300 group-hover:text-emerald-500" /></div><h3 className="mt-4 text-sm font-bold text-slate-900">{name}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p><Badge variant="outline" className="mt-3">{category}</Badge></button>) : <div className="bg-white p-10 text-center sm:col-span-2"><Search className="mx-auto size-6 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No reports found</p><p className="mt-1 text-xs text-slate-500">Try another name, description, or category.</p><Button variant="outline" size="sm" className="mt-4" onClick={() => setReportSearch("")}>Clear search</Button></div>}</div></section><aside className="space-y-4"><article className="rounded-xl bg-[#102033] p-5 text-white"><p className="text-xs font-semibold tracking-widest text-emerald-300">LIVE SUMMARY</p><h3 className="mt-3 text-lg font-bold">Profit & Loss</h3><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between text-slate-300"><span>Income</span><span>{formatMoney(metrics.sales, currency)}</span></div><div className="flex justify-between text-slate-300"><span>Expenses</span><span>({formatMoney(metrics.expenses, currency)})</span></div><div className="flex justify-between border-t border-white/15 pt-3 font-bold"><span>Net income</span><span className="text-emerald-300">{formatMoney(metrics.sales - metrics.expenses, currency)}</span></div></div></article><article className="rounded-xl border border-slate-200 bg-white p-5"><CheckCircle2 className="size-5 text-emerald-500" /><h3 className="mt-3 font-bold">Live reporting</h3><p className="mt-2 text-sm leading-6 text-slate-500">Financial statements, aging, sales, purchasing, inventory and accountant reports calculate from the company database and can be printed.</p></article></aside></div>;
}

function DocumentDialog({ detail, companyName, baseCurrency, onClose }: { detail: TransactionDetail | null; companyName: string; baseCurrency: string; onClose: () => void }) {
  if (!detail) return null;
  const record = detail.record;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
    <DialogHeader><div className="flex items-start justify-between gap-4 pr-8"><div><p className="text-xs font-bold tracking-[.18em] text-emerald-600">{companyName.toUpperCase()}</p><DialogTitle className="mt-2 capitalize">{String(record.type)} {String(record.number)}</DialogTitle><DialogDescription>{String(record.party)} · {String(record.transactionDate)}</DialogDescription></div><Button variant="outline" onClick={() => window.print()}><Printer className="size-4" />Print</Button></div></DialogHeader>
    <div className="grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-4"><div><p className="text-slate-500">Status</p><StatusBadge value={String(record.status)} /></div><div><p className="text-slate-500">Due date</p><strong>{String(record.dueDate || "—")}</strong></div><div><p className="text-slate-500">Account</p><strong>{String(record.account)}</strong></div><div><p className="text-slate-500">Currency</p><strong>{String(record.currency)}</strong></div></div>
    <div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead><TableHead>VAT code</TableHead><TableHead className="text-right">VAT</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{detail.lines.map((line, index) => <TableRow key={index}><TableCell className="font-medium">{String(line.description)}</TableCell><TableCell className="text-right">{String(line.quantity)}</TableCell><TableCell className="text-right">{formatMoney(line.unitPrice, String(record.currency))}</TableCell><TableCell>{String(line.vatCode || (Number(line.vatRate) === 5 ? "STANDARD" : "ZERO"))}</TableCell><TableCell className="text-right">{formatMoney(line.vatAmount, String(record.currency))}</TableCell><TableCell className="text-right font-semibold">{formatMoney(line.total, String(record.currency))}</TableCell></TableRow>)}</TableBody></Table></div>
    <div className="ml-auto grid w-full max-w-sm gap-2 text-sm"><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{formatMoney(record.subtotal, String(record.currency))}</span></div><div className="flex justify-between"><span className="text-slate-500">VAT</span><span>{formatMoney(record.vatAmount, String(record.currency))}</span></div><div className="flex justify-between border-t pt-3 text-lg font-bold"><span>Total</span><span>{formatMoney(record.total, String(record.currency))}</span></div></div>
    {detail.journal.length > 0 && <div><h3 className="mb-2 text-sm font-bold">Accounting entry ({baseCurrency})</h3><div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader><TableBody>{detail.journal.map((line, index) => <TableRow key={index}><TableCell>{String(line.accountName)}</TableCell><TableCell className="text-right">{Number(line.debit) ? formatMoney(line.debit, baseCurrency) : "—"}</TableCell><TableCell className="text-right">{Number(line.credit) ? formatMoney(line.credit, baseCurrency) : "—"}</TableCell></TableRow>)}</TableBody></Table></div></div>}
    {record.memo && <p className="rounded-lg border p-3 text-sm text-slate-600"><strong>Memo:</strong> {String(record.memo)}</p>}
  </DialogContent></Dialog>;
}

function ReportDialog({ report, companyName, onClose }: { report: ReportData | null; companyName: string; onClose: () => void }) {
  if (!report) return null;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
    <DialogHeader><div className="flex items-start justify-between gap-4 pr-8"><div><p className="text-xs font-bold tracking-[.18em] text-emerald-600">{companyName.toUpperCase()}</p><DialogTitle className="mt-2">{report.title}</DialogTitle><DialogDescription>Generated {new Date(report.generatedAt).toLocaleString("en-AE")} · {report.currency} accrual basis</DialogDescription></div><Button variant="outline" onClick={() => window.print()}><Printer className="size-4" />Print / PDF</Button></div></DialogHeader>
    <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow>{report.columns.map((column) => <TableHead key={column.key} className={column.type === "money" ? "text-right" : ""}>{column.label}</TableHead>)}</TableRow></TableHeader><TableBody>{report.rows.length ? report.rows.map((row, index) => <TableRow key={index}>{report.columns.map((column) => <TableCell key={column.key} className={column.type === "money" ? "text-right font-medium" : ""}>{column.type === "money" ? formatMoney(row[column.key], report.currency) : String(row[column.key] ?? "—")}</TableCell>)}</TableRow>) : <EmptyRow text="No posted data is available for this report." columns={report.columns.length} />}</TableBody></Table></div>
  </DialogContent></Dialog>;
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
      <div className="space-y-2"><Label>Vendor *</Label><Select value={form.party} onValueChange={(value) => setForm({ ...form, party: value })}><SelectTrigger className="w-full"><SelectValue placeholder="Select vendor" /></SelectTrigger><SelectContent>{vendors.length ? vendors.map((vendor) => <SelectItem key={vendor.id} value={String(vendor.name)}>{String(vendor.company || vendor.name)}</SelectItem>) : <SelectItem value="no-vendors" disabled>No vendors available</SelectItem>}</SelectContent></Select></div>
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
function CashTransactionFields({ form, setForm, contacts, accounts, locations, lines, setLines, vatCodeOptions }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void; contacts: DataRecord[]; accounts: DataRecord[]; locations: InventoryLocation[]; lines: LineForm[]; setLines: (lines: LineForm[]) => void; vatCodeOptions: VatCodeOption[] }) {
  const receivePayment = form.type === "customer payment";
  const parties = contacts.filter((contact) => contact.type === (receivePayment ? "customer" : "vendor"));
  const line = lines[0] ?? { itemId: "", description: receivePayment ? "Payment received" : "Cheque payment", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: "ZERO", vatRate: "0" };
  const updateLine = (changes: Partial<LineForm>) => setLines([{ ...line, ...changes }]);
  const amount = Number(line.unitPrice || 0);
  const vat = amount * Number(line.vatRate || 0) / 100;
  const bankName = linkedAccountName(accounts, "BANK", "Business Bank");
  const apName = linkedAccountName(accounts, "AP", "Accounts Payable");
  const chequeAccounts = accounts.filter((account) => account.active && ["AP", "EXPENSE", "PURCHASES"].includes(String(account.systemRole)));
  const isAccountsPayable = form.account === apName;
  return <div className="space-y-5">
    <div className="grid gap-4 rounded-xl border bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-3">
      <div className="space-y-2"><Label>{receivePayment ? "Customer" : "Vendor / Payee"} *</Label><Select value={form.party || undefined} onValueChange={(value) => setForm({ ...form, party: value })}><SelectTrigger className="w-full"><SelectValue placeholder={receivePayment ? "Select customer" : "Select vendor"} /></SelectTrigger><SelectContent>{parties.length ? parties.map((party) => <SelectItem key={party.id} value={String(party.name)}>{String(party.company || party.name)}</SelectItem>) : <SelectItem value="no-parties" disabled>No {receivePayment ? "customers" : "vendors"} available</SelectItem>}</SelectContent></Select></div>
      <Field label={receivePayment ? "Payment Reference" : "Cheque Number"} name="number" form={form} setForm={setForm} required placeholder={receivePayment ? "Enter payment reference" : "Enter cheque number"} />
      <Field label={receivePayment ? "Payment Date" : "Cheque Date"} name="transactionDate" type="date" form={form} setForm={setForm} required />
      <div className="space-y-2"><Label>Inventory *</Label><Select value={form.transactionLocationId || String(locations[0]?.id ?? "")} onValueChange={(value) => setForm({ ...form, transactionLocationId: value })}><SelectTrigger className="w-full"><SelectValue placeholder="Select inventory" /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}</SelectContent></Select></div>
      <Choice label="Currency" name="currency" values={currencies} form={form} setForm={setForm} />
      {receivePayment ? <div className="space-y-2"><Label>Deposit To</Label><Input readOnly value={bankName} className="bg-slate-100" /></div> : <div className="space-y-2"><Label>Posting account</Label><Select value={form.account || apName} onValueChange={(value) => { const isPayable = value === apName; setForm({ ...form, account: value, ...(isPayable ? { vatRate: "0" } : {}) }); if (isPayable) updateLine({ vatCode: "ZERO", vatRate: "0" }); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{chequeAccounts.map((account) => <SelectItem key={account.id} value={String(account.name)}>{String(account.name)}</SelectItem>)}</SelectContent></Select></div>}
    </div>
    <div className="grid gap-4 rounded-xl border bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-2"><Label>Amount *</Label><Input type="number" min="0.01" step="0.01" value={line.unitPrice} onChange={(event) => updateLine({ unitPrice: event.target.value, unitCost: event.target.value })} required /></div>
      {receivePayment || isAccountsPayable ? <div className="space-y-2"><Label>VAT code</Label><Input readOnly value={vatCodeOptions.find((option) => option.code === "ZERO")?.label ?? "ZERO · 0%"} className="bg-slate-100" /></div> : <div className="space-y-2"><Label>VAT code</Label><Select value={line.vatCode} onValueChange={(vatCode) => { const vatRate = vatRateForCode(vatCode, vatCodeOptions); updateLine({ vatCode, vatRate }); setForm({ ...form, vatRate }); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{vatCodeOptions.map((option) => <SelectItem key={option.code} value={option.code}><span className="flex flex-col"><span>{option.label}</span>{option.description ? <span className="text-xs text-slate-500">{option.description}</span> : null}</span></SelectItem>)}</SelectContent></Select></div>}
      <div className="space-y-2"><Label>VAT Amount</Label><Input readOnly value={formatMoney(vat, form.currency)} className="bg-slate-100" /></div>
      <div className="space-y-2"><Label>Total</Label><Input readOnly value={formatMoney(amount + vat, form.currency)} className="bg-slate-100 font-bold" /></div>
      <div className="md:col-span-2 xl:col-span-4"><Field label="Memo" name="memo" form={form} setForm={setForm} placeholder="Optional note" /></div>
    </div>
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">This {receivePayment ? "payment reduces Accounts Receivable" : isAccountsPayable ? "cheque reduces Accounts Payable" : "cheque posts to the selected expense account"} for the selected inventory.</div>
  </div>;
}
function TransactionFields({ form, setForm, types, items, contacts, accounts, locations, lines, setLines, vatCodeOptions, exchangeRates, baseCurrency }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void; types: string[]; items: DataRecord[]; contacts: DataRecord[]; accounts: DataRecord[]; locations: InventoryLocation[]; lines: LineForm[]; setLines: (lines: LineForm[]) => void; vatCodeOptions: VatCodeOption[]; exchangeRates: ExchangeRateRecord[]; baseCurrency: string }) {
  if (form.type === "bill") return <BillFields form={form} setForm={setForm} items={items} vendors={contacts.filter((contact) => contact.type === "vendor")} salesmen={contacts.filter((contact) => contact.type === "employee")} accounts={accounts} locations={locations} lines={lines} setLines={setLines} vatCodeOptions={vatCodeOptions} exchangeRates={exchangeRates} baseCurrency={baseCurrency} />;
  if (["customer payment", "cheque"].includes(form.type)) return <CashTransactionFields form={form} setForm={setForm} contacts={contacts} accounts={accounts} locations={locations} lines={lines} setLines={setLines} vatCodeOptions={vatCodeOptions} />;
  const update = (index: number, changes: Partial<LineForm>) => setLines(lines.map((line, position) => position === index ? { ...line, ...changes } : line));
  const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
  const vat = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(line.vatRate || 0) / 100, 0);
  return <div className="grid gap-4 sm:grid-cols-2">
    <Choice label="Transaction type" name="type" values={types} form={form} setForm={setForm} /><Field label="Document number" name="number" form={form} setForm={setForm} required />
    <div className="sm:col-span-2"><Field label="Customer / vendor / payee" name="party" form={form} setForm={setForm} required /></div>
    <Field label="Transaction date" name="transactionDate" type="date" form={form} setForm={setForm} required /><Field label="Due date" name="dueDate" type="date" form={form} setForm={setForm} />
    <CurrencyExchangeChoice form={form} setForm={setForm} exchangeRates={exchangeRates} baseCurrency={baseCurrency} /><Field label={`Exchange rate to ${baseCurrency}`} name="exchangeRate" type="number" form={form} setForm={setForm} required />
    <div className="space-y-3 rounded-xl border bg-slate-50 p-3 sm:col-span-2">
      <div className="flex items-center justify-between"><div><Label>Items and services</Label><p className="text-xs text-slate-500">Stock quantities update when invoices and bills post.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, { itemId: "", description: "", quantity: "1", unitPrice: "0", unitCost: "0", vatCode: form.vatRate === "0" ? "ZERO" : "STANDARD", vatRate: form.vatRate ?? "5" }])}><Plus className="size-3" />Line</Button></div>
      {lines.map((line, index) => <div key={index} className="grid gap-2 rounded-lg border bg-white p-3 sm:grid-cols-[1.15fr_1.6fr_.55fr_.75fr_.55fr_auto]">
        <Select value={line.itemId || "custom"} onValueChange={(value) => { const item = items.find((entry) => String(entry.id) === value); update(index, value === "custom" ? { itemId: "" } : { itemId: value, description: String(item?.name ?? ""), unitPrice: String(form.type === "bill" ? item?.cost ?? 0 : item?.salesPrice ?? 0), unitCost: String(item?.cost ?? 0) }); }}><SelectTrigger className="w-full"><SelectValue placeholder="Item" /></SelectTrigger><SelectContent><SelectItem value="custom">Service / custom</SelectItem>{items.map((item) => <SelectItem key={item.id} value={String(item.id)}>{String(item.sku)} · {String(item.name)}</SelectItem>)}</SelectContent></Select>
        <Input placeholder="Description" required value={line.description} onChange={(e) => update(index, { description: e.target.value })} />
        <Input aria-label="Quantity" title="Quantity" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => update(index, { quantity: e.target.value })} />
        <Input aria-label="Unit price" title="Unit price" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => update(index, { unitPrice: e.target.value })} />
        <Select value={line.vatCode} onValueChange={(vatCode) => update(index, { vatCode, vatRate: vatRateForCode(vatCode, vatCodeOptions) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{vatCodeOptions.map((option) => <SelectItem key={option.code} value={option.code}><span className="flex flex-col"><span>{option.label}</span>{option.description ? <span className="text-xs text-slate-500">{option.description}</span> : null}</span></SelectItem>)}</SelectContent></Select>
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
function ContactFields({ form, setForm }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void }) {
  const countries = ["United Arab Emirates", "Saudi Arabia", "Oman", "Qatar", "Bahrain", "Kuwait", "India", "Pakistan", "China", "Hong Kong", "United Kingdom", "United States", "Other"];
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
      <Choice label="Currency *" name="currency" values={currencies} form={form} setForm={setForm} />
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
      <Choice label="Currency *" name="currency" values={currencies} form={form} setForm={setForm} />
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
  return <div className="grid gap-4 sm:grid-cols-2">
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
    <PopoverContent align="start" className="w-80 space-y-3 p-3">
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
function AccountFields({ form, setForm, accounts }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void; accounts: DataRecord[] }) { const availableRoles = accountRoleOptions.filter(([role]) => !accounts.some((account) => account.systemRole === role)); return <div className="grid gap-4 sm:grid-cols-2"><Field label="Account code" name="code" form={form} setForm={setForm} required /><Field label="Account name" name="name" form={form} setForm={setForm} required /><Choice label="Account type" name="type" values={["Income", "Expense", "Cost of Goods Sold", "Other Income", "Other Expense", "Fixed Asset", "Bank", "Loan", "Credit Card", "Equity", "Accounts Receivable", "Other Current Asset", "Other Asset", "Accounts Payable", "Other Current Liability", "Long Term Liability"]} form={form} setForm={setForm} /><div className="space-y-2"><Label>Linked system use</Label><Select value={form.systemRole || "none"} onValueChange={(value) => setForm({ ...form, systemRole: value === "none" ? "" : value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No system link</SelectItem>{availableRoles.map(([role, label]) => <SelectItem key={role} value={role}>{label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">Linked accounts appear in invoices, bills, banking, VAT and inventory postings.</p></div><div className="space-y-2"><Label>Sub-account of</Label><Select value={form.parentAccountId || "none"} onValueChange={(value) => setForm({ ...form, parentAccountId: value === "none" ? "" : value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not a sub-account</SelectItem>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{String(account.code)} · {String(account.name)}</SelectItem>)}</SelectContent></Select></div><Field label="Opening balance" name="balance" type="number" form={form} setForm={setForm} /></div>; }
