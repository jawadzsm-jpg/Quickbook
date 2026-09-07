"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign, Bell, BookOpen, Building2, CheckCircle2,
  Check, ChevronDown, ChevronRight, CircleDollarSign, Clock3, Download, FileBarChart2, Landmark,
  Eye, LayoutDashboard, PackageSearch, Pencil, Plus, Printer, ReceiptText, RefreshCw,
  Search, Settings, ShoppingCart, Trash2, Users, WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type View = "dashboard" | "sales" | "purchases" | "customers" | "vendors" | "inventory" | "banking" | "accounts" | "employees" | "reports";
type Kind = "transactions" | "contacts" | "items" | "accounts";
type DataRecord = Record<string, string | number | boolean> & { id: number };
type LineForm = { itemId: string; description: string; quantity: string; unitPrice: string; unitCost: string; vatRate: string };
type ReportData = { title: string; generatedAt: string; columns: Array<{ key: string; label: string; type?: "money" }>; rows: Array<Record<string, string | number>> };
type TransactionDetail = { record: DataRecord; lines: DataRecord[]; journal: DataRecord[] };

const navGroups = [
  { label: "OVERVIEW", items: [{ id: "dashboard", label: "Company Home", icon: LayoutDashboard }] },
  { label: "CUSTOMERS", items: [
    { id: "sales", label: "Sales & Invoicing", icon: ReceiptText },
    { id: "customers", label: "Customer Center", icon: Users },
  ] },
  { label: "VENDORS", items: [
    { id: "purchases", label: "Purchases & Bills", icon: ShoppingCart },
    { id: "vendors", label: "Vendor Center", icon: Building2 },
  ] },
  { label: "COMPANY", items: [
    { id: "inventory", label: "Inventory", icon: PackageSearch },
    { id: "banking", label: "Banking", icon: Landmark },
    { id: "accounts", label: "Chart of Accounts", icon: BookOpen },
    { id: "employees", label: "Employees & HR", icon: WalletCards },
    { id: "reports", label: "Reports", icon: FileBarChart2 },
  ] },
] as const;

const viewTitles: Record<View, { title: string; sub: string }> = {
  dashboard: { title: "Company Home", sub: "Your financial position at a glance" },
  sales: { title: "Sales & Invoicing", sub: "Estimates, sales orders, invoices, receipts and credits" },
  purchases: { title: "Purchases & Bills", sub: "Purchase orders, bills, expenses and vendor payments" },
  customers: { title: "Customer Center", sub: "Customer balances, contacts and activity" },
  vendors: { title: "Vendor Center", sub: "Suppliers, payables and purchasing history" },
  inventory: { title: "Inventory Center", sub: "Stock levels, pricing, costs and reorder controls" },
  banking: { title: "Banking", sub: "Deposits, cheques, transfers and account activity" },
  accounts: { title: "Chart of Accounts", sub: "Assets, liabilities, equity, income and expenses" },
  employees: { title: "Employees & HR", sub: "Employee records and balances" },
  reports: { title: "Report Center", sub: "Financial, sales, purchasing and inventory analysis" },
};

const transactionTypes: Record<string, string[]> = {
  sales: ["invoice", "estimate", "sales order", "sales receipt", "credit memo", "customer payment"],
  purchases: ["purchase order", "bill", "expense", "vendor credit", "bill payment"],
  banking: ["deposit", "cheque", "transfer", "opening balance"],
  dashboard: ["invoice", "bill", "expense", "deposit", "cheque", "journal entry"],
};

const reports = [
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

const aed = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 2 });
const formatMoney = (value: unknown) => aed.format(Number(value ?? 0));
const today = () => new Date().toISOString().slice(0, 10);

export default function EnterpriseApp() {
  const [view, setView] = useState<View>("dashboard");
  const [records, setRecords] = useState<Record<Kind, DataRecord[]>>({ transactions: [], contacts: [], items: [], accounts: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<LineForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const kinds: Kind[] = ["transactions", "contacts", "items", "accounts"];
      const results = await Promise.all(kinds.map(async (kind) => {
        const response = await fetch(`/api/records?kind=${kind}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load records");
        return [kind, data.records] as const;
      }));
      setRecords(Object.fromEntries(results) as Record<Kind, DataRecord[]>);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load company data");
    } finally { setLoading(false); }
  }, []);

  // Initial load synchronizes the client workspace with the persisted company file.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData(); }, [loadData]);

  const metrics = useMemo(() => {
    const tx = records.transactions;
    const sales = tx.filter((r) => ["invoice", "sales receipt", "customer payment", "deposit"].includes(String(r.type))).reduce((n, r) => n + Number(r.total), 0);
    const expenses = tx.filter((r) => ["bill", "expense", "cheque", "bill payment"].includes(String(r.type))).reduce((n, r) => n + Number(r.total), 0);
    const receivable = tx.filter((r) => r.type === "invoice" && r.status !== "paid").reduce((n, r) => n + Number(r.total), 0);
    const payable = tx.filter((r) => r.type === "bill" && r.status !== "paid").reduce((n, r) => n + Number(r.total), 0);
    return { sales, expenses, receivable, payable, cash: sales - expenses };
  }, [records.transactions]);

  const currentKind: Kind = view === "customers" || view === "vendors" || view === "employees" ? "contacts" : view === "inventory" ? "items" : view === "accounts" ? "accounts" : "transactions";

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
    if (currentKind === "transactions") {
      const type = transactionTypes[view]?.[0] ?? "invoice";
      setForm({ type, number: `${type.slice(0, 3).toUpperCase()}-${String(records.transactions.length + 1).padStart(4, "0")}`, transactionDate: today(), dueDate: today(), status: "open", account: type === "bill" ? "Purchases" : "Sales Revenue", vatRate: "5" });
      setLines([{ itemId: "", description: "", quantity: "1", unitPrice: "0", unitCost: "0", vatRate: "5" }]);
    } else if (currentKind === "contacts") {
      const type = view === "customers" ? "customer" : view === "vendors" ? "vendor" : "employee";
      setForm(type === "customer" ? { type, currency: "AED", reseller: "Reseller", planet: "No", balance: "0" } : { type, balance: "0" });
    }
    else if (currentKind === "items") {
      const initialFields = specificationFields.filter((label) => label !== "Product Category").slice(0, 8);
      const itemForm: Record<string, string> = { category: "Laptop", quantity: "0", reorderPoint: "0", salesPrice: "0", cost: "0", specCount: String(initialFields.length) };
      initialFields.forEach((label, index) => { itemForm[`specLabel${index}`] = label; itemForm[`specValue${index}`] = ""; });
      setForm(itemForm);
    }
    else setForm({ type: "Expense", balance: "0" });
    setDialogOpen(true);
  }

  async function saveRecord(event: FormEvent) {
    event.preventDefault();
    if (currentKind === "contacts" && form.type === "customer") {
      const required = [form.company, form.name, form.phone, form.whatsapp, form.country, form.reseller, form.planet, form.currency];
      if (required.some((value) => !value?.trim())) return toast.error("Complete all required customer fields.");
    }
    setSaving(true);
    try {
      const response = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: currentKind, ...form, ...(currentKind === "transactions" ? { lines } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save record");
      setRecords((old) => ({ ...old, [currentKind]: [data.record, ...old[currentKind]] }));
      setDialogOpen(false); toast.success("Record saved and posted");
      await loadData();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save record"); }
    finally { setSaving(false); }
  }

  async function removeRecord(id: number) {
    try {
      const response = await fetch("/api/records", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: currentKind, id }) });
      if (!response.ok) throw new Error("Delete failed");
      setRecords((old) => ({ ...old, [currentKind]: old[currentKind].filter((r) => r.id !== id) }));
      toast.success("Record deleted");
    } catch { toast.error("Could not delete record"); }
  }

  async function openDetail(id: number) {
    try {
      const response = await fetch(`/api/records?kind=transactions&id=${id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not open document");
      setDetail(data);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not open document"); }
  }

  async function openReport(key: string) {
    setReportLoading(true);
    try {
      const response = await fetch(`/api/reports?type=${key}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate report");
      setReport(data.report);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not generate report"); }
    finally { setReportLoading(false); }
  }

  const heading = viewTitles[view];
  const createLabel = currentKind === "contacts" ? `New ${view === "employees" ? "Employee" : view === "vendors" ? "Vendor" : "Customer"}` : currentKind === "items" ? "New Item" : currentKind === "accounts" ? "New Account" : `New ${transactionTypes[view]?.[0] ?? "Transaction"}`;

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-slate-800 bg-[#0d1726] text-slate-100">
        <SidebarHeader className="border-b border-white/10 p-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-400 text-sm font-black text-slate-950">CN</div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-bold tracking-wide text-white">COMNET ENTERPRISE</p>
              <p className="truncate text-xs text-slate-400">Accounting Suite</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2 py-3">
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-[11px] tracking-[.16em] text-slate-500">{group.label}</SidebarGroupLabel>
              <SidebarGroupContent><SidebarMenu>
                {group.items.map((item) => <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton tooltip={item.label} isActive={view === item.id} onClick={() => { setView(item.id as View); setSearch(""); }} className="h-10 text-slate-300 hover:bg-white/8 hover:text-white data-[active=true]:bg-emerald-400/15 data-[active=true]:text-emerald-300">
                    <item.icon /><span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>)}
              </SidebarMenu></SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="border-t border-white/10 p-3">
          <SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip="Settings" className="text-slate-400"><Settings /><span>Company Settings</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
          <div className="mt-1 flex items-center gap-3 rounded-lg bg-white/5 p-2 group-data-[collapsible=icon]:hidden">
            <div className="grid size-8 place-items-center rounded-full bg-slate-700 text-xs font-bold">MS</div>
            <div className="min-w-0"><p className="truncate text-xs font-semibold text-white">Company Admin</p><p className="truncate text-[11px] text-slate-500">ComNet International</p></div>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0 bg-[#f4f6f8]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-7">
          <div className="flex min-w-0 items-center gap-3"><SidebarTrigger className="text-slate-600" /><div className="hidden h-5 w-px bg-slate-200 sm:block" /><div className="min-w-0"><h1 className="truncate text-lg font-bold text-slate-900">{heading.title}</h1><p className="hidden truncate text-xs text-slate-500 sm:block">{heading.sub}</p></div></div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Notifications"><Bell className="size-4" /></Button>
            <Button onClick={openCreate} className="bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400"><Plus className="size-4" /><span className="hidden sm:inline">{createLabel}</span></Button>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1500px] p-4 lg:p-7">
          {view === "dashboard" ? <Dashboard metrics={metrics} records={records} onNavigate={setView} onCreate={openCreate} onOpenDetail={openDetail} /> : view === "reports" ? <ReportCenter metrics={metrics} onOpen={openReport} loading={reportLoading} /> : (
            <RecordView view={view} kind={currentKind} records={filteredRecords} loading={loading} search={search} setSearch={setSearch} onRefresh={loadData} onCreate={openCreate} onDelete={removeRecord} onOpenDetail={openDetail} />
          )}
        </div>
      </SidebarInset>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={`max-h-[90vh] overflow-y-auto ${currentKind === "transactions" || currentKind === "items" || (currentKind === "contacts" && view === "customers") ? "sm:max-w-5xl" : "sm:max-w-xl"}`}>
          <DialogHeader><DialogTitle>{createLabel}</DialogTitle><DialogDescription>Enter the record details below. Required fields are marked.</DialogDescription></DialogHeader>
          <form onSubmit={saveRecord} className="space-y-5">
            {currentKind === "transactions" && <TransactionFields form={form} setForm={setForm} types={transactionTypes[view] ?? transactionTypes.dashboard} items={records.items} lines={lines} setLines={setLines} />}
            {currentKind === "contacts" && <ContactFields form={form} setForm={setForm} />}
            {currentKind === "items" && <ItemFields form={form} setForm={setForm} items={records.items} />}
            {currentKind === "accounts" && <AccountFields form={form} setForm={setForm} />}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saving} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">{saving ? "Saving…" : "Save record"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DocumentDialog detail={detail} onClose={() => setDetail(null)} />
      <ReportDialog report={report} onClose={() => setReport(null)} />
      <Toaster richColors position="bottom-right" />
    </SidebarProvider>
  );
}

function Dashboard({ metrics, records, onNavigate, onCreate, onOpenDetail }: { metrics: Record<string, number>; records: Record<Kind, DataRecord[]>; onNavigate: (v: View) => void; onCreate: () => void; onOpenDetail: (id: number) => void }) {
  const recent = records.transactions.slice(0, 6);
  const cards = [
    ["Cash position", metrics.cash, CircleDollarSign, "Available net cash", "emerald"],
    ["Accounts receivable", metrics.receivable, Clock3, "Open customer invoices", "blue"],
    ["Accounts payable", metrics.payable, BadgeDollarSign, "Open vendor bills", "amber"],
    ["Inventory value", records.items.reduce((n, i) => n + Number(i.quantity) * Number(i.cost), 0), PackageSearch, `${records.items.length} active items`, "violet"],
  ] as const;
  const max = Math.max(metrics.sales, metrics.expenses, 1);
  return <div className="space-y-6">
    <section className="rounded-2xl bg-gradient-to-r from-[#111d30] to-[#172c3f] p-6 text-white shadow-sm lg:flex lg:items-center lg:justify-between">
      <div><div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[.15em] text-emerald-300"><span className="size-2 rounded-full bg-emerald-400" /> COMPANY FILE ACTIVE</div><h2 className="text-2xl font-bold">Good afternoon, ComNet</h2><p className="mt-1 text-sm text-slate-300">Post transactions, control stock and close your books from one workspace.</p></div>
      <div className="mt-5 flex flex-wrap gap-2 lg:mt-0"><Button variant="outline" onClick={() => onNavigate("reports")} className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"><FileBarChart2 />View reports</Button><Button onClick={onCreate} className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"><Plus />Record transaction</Button></div>
    </section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, Icon, detail, color]) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)]"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{formatMoney(value)}</p></div><div className={`metric-icon metric-${color}`}><Icon className="size-5" /></div></div><p className="mt-4 text-xs text-slate-500">{detail}</p></article>)}</section>
    <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="font-bold text-slate-900">Income vs expenses</h3><p className="text-xs text-slate-500">All posted company transactions</p></div><Badge variant="outline">AED</Badge></div><div className="mt-8 grid grid-cols-[80px_1fr] gap-x-4 gap-y-5 text-sm"><span className="text-slate-500">Income</span><div className="flex items-center gap-3"><div className="h-8 rounded-r-md bg-emerald-400" style={{ width: `${Math.max((metrics.sales / max) * 100, metrics.sales ? 6 : 1)}%` }} /><strong className="whitespace-nowrap text-slate-800">{formatMoney(metrics.sales)}</strong></div><span className="text-slate-500">Expenses</span><div className="flex items-center gap-3"><div className="h-8 rounded-r-md bg-sky-400" style={{ width: `${Math.max((metrics.expenses / max) * 100, metrics.expenses ? 6 : 1)}%` }} /><strong className="whitespace-nowrap text-slate-800">{formatMoney(metrics.expenses)}</strong></div></div><div className="mt-7 flex items-center justify-between border-t pt-4"><span className="text-sm text-slate-500">Net result</span><strong className={metrics.sales - metrics.expenses >= 0 ? "text-emerald-600" : "text-rose-600"}>{formatMoney(metrics.sales - metrics.expenses)}</strong></div></article>
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-bold text-slate-900">Business status</h3><div className="mt-5 space-y-4"><StatusLine label="Customers" value={records.contacts.filter((r) => r.type === "customer").length} action={() => onNavigate("customers")} /><StatusLine label="Vendors" value={records.contacts.filter((r) => r.type === "vendor").length} action={() => onNavigate("vendors")} /><StatusLine label="Inventory items" value={records.items.length} action={() => onNavigate("inventory")} /><StatusLine label="Transactions" value={records.transactions.length} action={() => onNavigate("sales")} /></div></article>
    </section>
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b px-5 py-4"><div><h3 className="font-bold text-slate-900">Recent activity</h3><p className="text-xs text-slate-500">Latest entries across the company file</p></div><Button variant="ghost" size="sm" onClick={() => onNavigate("sales")}>View all <ChevronRight /></Button></div><TransactionTable records={recent} empty="No transactions yet. Use Record transaction to add your first entry." onOpen={onOpenDetail} /></article>
  </div>;
}

function StatusLine({ label, value, action }: { label: string; value: number; action: () => void }) { return <button onClick={action} className="flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50/50"><span className="text-sm text-slate-600">{label}</span><span className="flex items-center gap-2 font-bold text-slate-900">{value}<ChevronRight className="size-4 text-slate-400" /></span></button>; }

function RecordView({ view, kind, records, loading, search, setSearch, onRefresh, onCreate, onDelete, onOpenDetail }: { view: View; kind: Kind; records: DataRecord[]; loading: boolean; search: string; setSearch: (v: string) => void; onRefresh: () => void; onCreate: () => void; onDelete: (id: number) => void; onOpenDetail: (id: number) => void }) {
  function exportCsv() {
    if (!records.length) return toast.error("There are no records to export.");
    const headers = Array.from(new Set(records.flatMap((record) => Object.keys(record))));
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [headers.map(escape).join(","), ...records.map((record) => headers.map((header) => escape(record[header])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `comnet-${view}-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }
  return <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${view}…`} className="pl-9" /></div><div className="flex gap-2"><Button variant="outline" size="icon" onClick={onRefresh} aria-label="Refresh"><RefreshCw className="size-4" /></Button><Button variant="outline" onClick={exportCsv}><Download className="size-4" />Export</Button><Button onClick={onCreate} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"><Plus className="size-4" />Add new</Button></div></div>
    {kind === "transactions" ? <TransactionTable records={records} empty={loading ? "Loading records…" : "No transactions found."} onDelete={onDelete} onOpen={onOpenDetail} /> : kind === "contacts" ? <ContactTable records={records} empty={loading ? "Loading records…" : "No contacts found."} onDelete={onDelete} /> : kind === "items" ? <ItemTable records={records} empty={loading ? "Loading records…" : "No inventory items found."} onDelete={onDelete} /> : <AccountTable records={records} empty={loading ? "Loading records…" : "No accounts found."} onDelete={onDelete} />}
  </section>;
}

function EmptyRow({ text, columns }: { text: string; columns: number }) { return <TableRow><TableCell colSpan={columns} className="h-40 text-center text-sm text-slate-500">{text}</TableCell></TableRow>; }
function DeleteButton({ id, onDelete }: { id: number; onDelete?: (id: number) => void }) { return onDelete ? <Button variant="ghost" size="icon" onClick={() => onDelete(id)} aria-label="Delete record" className="text-slate-400 hover:text-rose-600"><Trash2 className="size-4" /></Button> : null; }
function TransactionTable({ records, empty, onDelete, onOpen }: { records: DataRecord[]; empty: string; onDelete?: (id: number) => void; onOpen?: (id: number) => void }) { return <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>No.</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-24" /></TableRow></TableHeader><TableBody>{records.length === 0 ? <EmptyRow text={empty} columns={7} /> : records.map((r) => <TableRow key={r.id} className="cursor-pointer" onDoubleClick={() => onOpen?.(r.id)}><TableCell className="text-slate-500">{String(r.transactionDate)}</TableCell><TableCell className="font-medium capitalize">{String(r.type)}</TableCell><TableCell className="font-mono text-xs text-slate-500">{String(r.number)}</TableCell><TableCell>{String(r.party)}</TableCell><TableCell><StatusBadge value={String(r.status)} /></TableCell><TableCell className="text-right font-semibold">{formatMoney(r.total)}</TableCell><TableCell><div className="flex"><Button variant="ghost" size="icon" onClick={() => onOpen?.(r.id)} aria-label="Open document" className="text-slate-400 hover:text-emerald-600"><Eye className="size-4" /></Button><DeleteButton id={r.id} onDelete={onDelete} /></div></TableCell></TableRow>)}</TableBody></Table>; }
function ContactTable({ records, empty, onDelete }: { records: DataRecord[]; empty: string; onDelete: (id: number) => void }) { return <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Company</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{records.length === 0 ? <EmptyRow text={empty} columns={7} /> : records.map((r) => <TableRow key={r.id}><TableCell className="font-semibold">{String(r.name)}</TableCell><TableCell>{String(r.company || "—")}</TableCell><TableCell>{String(r.email || "—")}</TableCell><TableCell>{String(r.phone || "—")}</TableCell><TableCell><StatusBadge value={String(r.status)} /></TableCell><TableCell className="text-right font-semibold">{formatMoney(r.balance)}</TableCell><TableCell><DeleteButton id={r.id} onDelete={onDelete} /></TableCell></TableRow>)}</TableBody></Table>; }
function ItemTable({ records, empty, onDelete }: { records: DataRecord[]; empty: string; onDelete: (id: number) => void }) { return <Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Item & description</TableHead><TableHead>Category</TableHead><TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Reorder</TableHead><TableHead className="text-right">Sales price</TableHead><TableHead className="text-right">Avg. cost</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{records.length === 0 ? <EmptyRow text={empty} columns={8} /> : records.map((r) => <TableRow key={r.id}><TableCell className="font-mono text-xs">{String(r.sku)}</TableCell><TableCell><p className="font-semibold">{String(r.name)}</p>{r.description ? <p className="mt-1 max-w-lg truncate text-xs text-slate-500" title={String(r.description)}>{String(r.description)}</p> : null}</TableCell><TableCell>{String(r.category)}</TableCell><TableCell className="text-right">{String(r.quantity)}</TableCell><TableCell className="text-right">{String(r.reorderPoint)}</TableCell><TableCell className="text-right">{formatMoney(r.salesPrice)}</TableCell><TableCell className="text-right">{formatMoney(r.cost)}</TableCell><TableCell><DeleteButton id={r.id} onDelete={onDelete} /></TableCell></TableRow>)}</TableBody></Table>; }
function AccountTable({ records, empty, onDelete }: { records: DataRecord[]; empty: string; onDelete: (id: number) => void }) { return <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Account name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{records.length === 0 ? <EmptyRow text={empty} columns={6} /> : records.map((r) => <TableRow key={r.id}><TableCell className="font-mono text-xs">{String(r.code)}</TableCell><TableCell className="font-semibold">{String(r.name)}</TableCell><TableCell>{String(r.type)}</TableCell><TableCell><Badge variant="outline">{r.active ? "Active" : "Inactive"}</Badge></TableCell><TableCell className="text-right font-semibold">{formatMoney(r.balance)}</TableCell><TableCell><DeleteButton id={r.id} onDelete={onDelete} /></TableCell></TableRow>)}</TableBody></Table>; }
function StatusBadge({ value }: { value: string }) { const good = value === "paid" || value === "active" || value === "cleared"; return <Badge variant="outline" className={good ? "border-emerald-200 bg-emerald-50 text-emerald-700" : value === "overdue" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700"}>{value}</Badge>; }

function ReportCenter({ metrics, onOpen, loading }: { metrics: Record<string, number>; onOpen: (key: string) => void; loading: boolean }) {
  return <div className="grid gap-6 xl:grid-cols-[1fr_320px]"><section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-bold text-slate-900">Available reports</h2><p className="text-sm text-slate-500">Every report opens with live data from the posted ledger.</p></div><div className="grid gap-px bg-slate-200 sm:grid-cols-2">{reports.map(([name, description, category, key]) => <button key={name} disabled={loading} onClick={() => onOpen(key)} className="group bg-white p-5 text-left hover:bg-emerald-50 disabled:opacity-60"><div className="flex items-start justify-between"><div className="grid size-9 place-items-center rounded-lg bg-slate-100 text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-700"><FileBarChart2 className="size-4" /></div><ChevronRight className="size-4 text-slate-300 group-hover:text-emerald-500" /></div><h3 className="mt-4 text-sm font-bold text-slate-900">{name}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p><Badge variant="outline" className="mt-3">{category}</Badge></button>)}</div></section><aside className="space-y-4"><article className="rounded-xl bg-[#102033] p-5 text-white"><p className="text-xs font-semibold tracking-widest text-emerald-300">LIVE SUMMARY</p><h3 className="mt-3 text-lg font-bold">Profit & Loss</h3><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between text-slate-300"><span>Income</span><span>{formatMoney(metrics.sales)}</span></div><div className="flex justify-between text-slate-300"><span>Expenses</span><span>({formatMoney(metrics.expenses)})</span></div><div className="flex justify-between border-t border-white/15 pt-3 font-bold"><span>Net income</span><span className="text-emerald-300">{formatMoney(metrics.sales - metrics.expenses)}</span></div></div></article><article className="rounded-xl border border-slate-200 bg-white p-5"><CheckCircle2 className="size-5 text-emerald-500" /><h3 className="mt-3 font-bold">Live reporting</h3><p className="mt-2 text-sm leading-6 text-slate-500">Financial statements, aging, sales, purchasing, inventory and accountant reports calculate from the company database and can be printed.</p></article></aside></div>;
}

function DocumentDialog({ detail, onClose }: { detail: TransactionDetail | null; onClose: () => void }) {
  if (!detail) return null;
  const record = detail.record;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
    <DialogHeader><div className="flex items-start justify-between gap-4 pr-8"><div><p className="text-xs font-bold tracking-[.18em] text-emerald-600">COMNET INTERNATIONAL</p><DialogTitle className="mt-2 capitalize">{String(record.type)} {String(record.number)}</DialogTitle><DialogDescription>{String(record.party)} · {String(record.transactionDate)}</DialogDescription></div><Button variant="outline" onClick={() => window.print()}><Printer className="size-4" />Print</Button></div></DialogHeader>
    <div className="grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-4"><div><p className="text-slate-500">Status</p><StatusBadge value={String(record.status)} /></div><div><p className="text-slate-500">Due date</p><strong>{String(record.dueDate || "—")}</strong></div><div><p className="text-slate-500">Account</p><strong>{String(record.account)}</strong></div><div><p className="text-slate-500">Currency</p><strong>{String(record.currency)}</strong></div></div>
    <div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">VAT</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{detail.lines.map((line, index) => <TableRow key={index}><TableCell className="font-medium">{String(line.description)}</TableCell><TableCell className="text-right">{String(line.quantity)}</TableCell><TableCell className="text-right">{formatMoney(line.unitPrice)}</TableCell><TableCell className="text-right">{formatMoney(line.vatAmount)}</TableCell><TableCell className="text-right font-semibold">{formatMoney(line.total)}</TableCell></TableRow>)}</TableBody></Table></div>
    <div className="ml-auto grid w-full max-w-sm gap-2 text-sm"><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{formatMoney(record.subtotal)}</span></div><div className="flex justify-between"><span className="text-slate-500">VAT</span><span>{formatMoney(record.vatAmount)}</span></div><div className="flex justify-between border-t pt-3 text-lg font-bold"><span>Total</span><span>{formatMoney(record.total)}</span></div></div>
    {detail.journal.length > 0 && <div><h3 className="mb-2 text-sm font-bold">Accounting entry</h3><div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader><TableBody>{detail.journal.map((line, index) => <TableRow key={index}><TableCell>{String(line.accountName)}</TableCell><TableCell className="text-right">{Number(line.debit) ? formatMoney(line.debit) : "—"}</TableCell><TableCell className="text-right">{Number(line.credit) ? formatMoney(line.credit) : "—"}</TableCell></TableRow>)}</TableBody></Table></div></div>}
    {record.memo && <p className="rounded-lg border p-3 text-sm text-slate-600"><strong>Memo:</strong> {String(record.memo)}</p>}
  </DialogContent></Dialog>;
}

function ReportDialog({ report, onClose }: { report: ReportData | null; onClose: () => void }) {
  if (!report) return null;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
    <DialogHeader><div className="flex items-start justify-between gap-4 pr-8"><div><p className="text-xs font-bold tracking-[.18em] text-emerald-600">COMNET INTERNATIONAL</p><DialogTitle className="mt-2">{report.title}</DialogTitle><DialogDescription>Generated {new Date(report.generatedAt).toLocaleString("en-AE")} · AED accrual basis</DialogDescription></div><Button variant="outline" onClick={() => window.print()}><Printer className="size-4" />Print / PDF</Button></div></DialogHeader>
    <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow>{report.columns.map((column) => <TableHead key={column.key} className={column.type === "money" ? "text-right" : ""}>{column.label}</TableHead>)}</TableRow></TableHeader><TableBody>{report.rows.length ? report.rows.map((row, index) => <TableRow key={index}>{report.columns.map((column) => <TableCell key={column.key} className={column.type === "money" ? "text-right font-medium" : ""}>{column.type === "money" ? formatMoney(row[column.key]) : String(row[column.key] ?? "—")}</TableCell>)}</TableRow>) : <EmptyRow text="No posted data is available for this report." columns={report.columns.length} />}</TableBody></Table></div>
  </DialogContent></Dialog>;
}

function Field({ label, name, form, setForm, type = "text", required = false, placeholder }: { label: string; name: string; form: Record<string, string>; setForm: (f: Record<string, string>) => void; type?: string; required?: boolean; placeholder?: string }) { return <div className="space-y-2"><Label htmlFor={name}>{label}{required ? " *" : ""}</Label><Input id={name} name={name} type={type} required={required} placeholder={placeholder} value={form[name] ?? ""} onChange={(e) => setForm({ ...form, [name]: e.target.value })} /></div>; }
function Choice({ label, name, values, form, setForm, placeholder }: { label: string; name: string; values: string[]; form: Record<string, string>; setForm: (f: Record<string, string>) => void; placeholder?: string }) { return <div className="space-y-2"><Label>{label}</Label><Select value={form[name]} onValueChange={(value) => setForm({ ...form, [name]: value })}><SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{values.map((value) => <SelectItem key={value} value={value}><span className="capitalize">{value}</span></SelectItem>)}</SelectContent></Select></div>; }
function TransactionFields({ form, setForm, types, items, lines, setLines }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void; types: string[]; items: DataRecord[]; lines: LineForm[]; setLines: (lines: LineForm[]) => void }) {
  const update = (index: number, changes: Partial<LineForm>) => setLines(lines.map((line, position) => position === index ? { ...line, ...changes } : line));
  const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
  const vat = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(line.vatRate || 0) / 100, 0);
  return <div className="grid gap-4 sm:grid-cols-2">
    <Choice label="Transaction type" name="type" values={types} form={form} setForm={setForm} /><Field label="Document number" name="number" form={form} setForm={setForm} required />
    <div className="sm:col-span-2"><Field label="Customer / vendor / payee" name="party" form={form} setForm={setForm} required /></div>
    <Field label="Transaction date" name="transactionDate" type="date" form={form} setForm={setForm} required /><Field label="Due date" name="dueDate" type="date" form={form} setForm={setForm} />
    <div className="space-y-3 rounded-xl border bg-slate-50 p-3 sm:col-span-2">
      <div className="flex items-center justify-between"><div><Label>Items and services</Label><p className="text-xs text-slate-500">Stock quantities update when invoices and bills post.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, { itemId: "", description: "", quantity: "1", unitPrice: "0", unitCost: "0", vatRate: form.vatRate ?? "5" }])}><Plus className="size-3" />Line</Button></div>
      {lines.map((line, index) => <div key={index} className="grid gap-2 rounded-lg border bg-white p-3 sm:grid-cols-[1.15fr_1.6fr_.55fr_.75fr_.55fr_auto]">
        <Select value={line.itemId || "custom"} onValueChange={(value) => { const item = items.find((entry) => String(entry.id) === value); update(index, value === "custom" ? { itemId: "" } : { itemId: value, description: String(item?.name ?? ""), unitPrice: String(form.type === "bill" ? item?.cost ?? 0 : item?.salesPrice ?? 0), unitCost: String(item?.cost ?? 0) }); }}><SelectTrigger className="w-full"><SelectValue placeholder="Item" /></SelectTrigger><SelectContent><SelectItem value="custom">Service / custom</SelectItem>{items.map((item) => <SelectItem key={item.id} value={String(item.id)}>{String(item.sku)} · {String(item.name)}</SelectItem>)}</SelectContent></Select>
        <Input placeholder="Description" required value={line.description} onChange={(e) => update(index, { description: e.target.value })} />
        <Input aria-label="Quantity" title="Quantity" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => update(index, { quantity: e.target.value })} />
        <Input aria-label="Unit price" title="Unit price" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => update(index, { unitPrice: e.target.value })} />
        <Select value={line.vatRate} onValueChange={(value) => update(index, { vatRate: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">0%</SelectItem><SelectItem value="5">5%</SelectItem></SelectContent></Select>
        <Button type="button" variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, position) => position !== index))} className="text-slate-400 hover:text-rose-600"><Trash2 className="size-4" /></Button>
      </div>)}
      <div className="ml-auto grid max-w-xs gap-2 pt-2 text-sm"><div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div><div className="flex justify-between text-slate-500"><span>VAT</span><span>{formatMoney(vat)}</span></div><div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span>{formatMoney(subtotal + vat)}</span></div></div>
    </div>
    <Choice label="Status" name="status" values={["open", "paid", "overdue", "cleared"]} form={form} setForm={setForm} /><Field label="Posting account" name="account" form={form} setForm={setForm} />
    <div className="sm:col-span-2"><Field label="Memo" name="memo" form={form} setForm={setForm} /></div>
  </div>;
}
function ContactFields({ form, setForm }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void }) {
  if (form.type !== "customer") return <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Name" name="name" form={form} setForm={setForm} required /></div><Field label="Company" name="company" form={form} setForm={setForm} /><Field label="Opening balance" name="balance" type="number" form={form} setForm={setForm} /><Field label="Email" name="email" type="email" form={form} setForm={setForm} /><Field label="Phone" name="phone" form={form} setForm={setForm} /></div>;

  const countries = ["United Arab Emirates", "Saudi Arabia", "Oman", "Qatar", "Bahrain", "Kuwait", "India", "Pakistan", "China", "Hong Kong", "United Kingdom", "United States", "Other"];
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
      <Choice label="Currency *" name="currency" values={["AED", "USD", "EUR", "GBP", "SAR", "OMR", "QAR", "BHD", "KWD", "INR", "CNY"]} form={form} setForm={setForm} />
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
  const description = Array.from({ length: count }, (_, index) => {
    const label = form[`specLabel${index}`];
    const value = form[`specValue${index}`]?.trim();
    return label && value ? `${label}: ${value}` : "";
  }).filter(Boolean).join(" | ");
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
    <div className="space-y-2 sm:col-span-2"><Label>Category</Label><SpecificationValuePicker
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
function AccountFields({ form, setForm }: { form: Record<string, string>; setForm: (f: Record<string, string>) => void }) { return <div className="grid gap-4 sm:grid-cols-2"><Field label="Account code" name="code" form={form} setForm={setForm} required /><Field label="Account name" name="name" form={form} setForm={setForm} required /><Choice label="Account type" name="type" values={["Bank", "Accounts Receivable", "Current Asset", "Fixed Asset", "Accounts Payable", "Credit Card", "Liability", "Equity", "Income", "Cost of Goods Sold", "Expense"]} form={form} setForm={setForm} /><Field label="Opening balance" name="balance" type="number" form={form} setForm={setForm} /></div>; }
