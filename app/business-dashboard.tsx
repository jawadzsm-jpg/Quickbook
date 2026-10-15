"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BadgeDollarSign, CalendarRange, CircleDollarSign, Clock3, FileBarChart2, Landmark, PackageSearch, Percent, RefreshCw, ShoppingCart, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { presetDates, reportToday } from "@/lib/report-period";
import { InsightsActivity } from "./insights-activity";

type Row = Record<string, string | number | null>;
type Report = { rows: Row[]; currency: string };
type Period = { from: string; to: string };
type Loaded = { key: string; results: Record<string, Report | { error: string }> };

// Dashboard presets map onto the report library's date presets, so a period here equals the same period in Reports.
const presets = [
  { label: "Today", preset: "Today" },
  { label: "This week", preset: "This Week" },
  { label: "This month", preset: "This Month" },
  { label: "Last month", preset: "Last Month" },
  { label: "This quarter", preset: "This Fiscal Quarter" },
  { label: "This year", preset: "This Fiscal Year" },
] as const;
type PresetLabel = (typeof presets)[number]["label"] | "Custom range";

const dayMs = 86400000;
const shiftDay = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
/** The equally long period immediately before `period`, used for the change badges. */
function priorPeriod(period: Period): Period {
  const days = Math.round((Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / dayMs) + 1;
  return { from: shiftDay(period.from, -days), to: shiftDay(period.from, -1) };
}
const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const showDate = (date: string) => longDate.format(new Date(`${date}T00:00:00Z`));
const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

export function BusinessDashboard({ companyId, locationId, inventoryName, currency, canViewReports, counts, onOpenReport, onNavigate, onOpenDetail }: {
  companyId: number;
  locationId: number;
  inventoryName: string;
  currency: string;
  canViewReports: boolean;
  counts: { customers: number; vendors: number; items: number; transactions: number };
  onOpenReport: (key: string, period: { start: string; end: string }) => void;
  onNavigate: (view: "customers" | "vendors" | "inventory" | "sales") => void;
  onOpenDetail: (id: number) => void;
}) {
  const [preset, setPreset] = useState<PresetLabel>("This month");
  const [custom, setCustom] = useState<Period>(() => presetDates("This Month"));
  const [refresh, setRefresh] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const period = useMemo<Period>(() => {
    if (preset === "Custom range") return custom;
    return presetDates(presets.find((entry) => entry.label === preset)!.preset);
  }, [preset, custom]);
  const validPeriod = Boolean(period.from && period.to && period.from <= period.to);
  const prior = useMemo(() => validPeriod ? priorPeriod(period) : period, [period, validPeriod]);
  // The trend always shows six whole months ending with the selected period's last month.
  const trendFrom = useMemo(() => { const end = new Date(`${period.to || reportToday()}T00:00:00Z`); return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 5, 1)).toISOString().slice(0, 10); }, [period.to]);
  const requests = useMemo(() => ({
    current: { type: "business-final", ...period },
    prior: { type: "business-final", ...prior },
    customers: { type: "sales-by-customer", ...period },
    suppliers: { type: "purchases-by-vendor", ...period },
    items: { type: "sales-by-item", ...period },
    trend: { type: "income-expense-graph", from: trendFrom, to: period.to },
  }), [period, prior, trendFrom]);
  const loadKey = `${companyId}|${locationId}|${period.from}|${period.to}|${refresh}`;

  useEffect(() => {
    if (!canViewReports || !companyId || !validPeriod) return;
    const controller = new AbortController();
    const load = async (request: { type: string; from: string; to: string }): Promise<Report> => {
      const query = new URLSearchParams({ type: request.type, companyId: String(companyId), locationId: String(locationId || 0), periodStart: request.from, periodEnd: request.to });
      const response = await fetch(`/api/reports?${query}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.report) throw new Error(data.error || "Could not load this summary.");
      return { rows: data.report.rows ?? [], currency: data.report.currency || currency };
    };
    const entries = Object.entries(requests);
    void Promise.allSettled(entries.map(([, request]) => load(request))).then((settled) => {
      if (controller.signal.aborted) return;
      setLoaded({ key: loadKey, results: Object.fromEntries(settled.map((result, index) => [entries[index][0], result.status === "fulfilled" ? result.value : { error: result.reason instanceof Error ? result.reason.message : "Could not load this summary." }])) });
    });
    return () => controller.abort();
  }, [canViewReports, companyId, locationId, validPeriod, requests, loadKey, currency]);

  const data = loaded?.key === loadKey ? loaded.results : null;
  const loading = canViewReports && validPeriod && !data;
  const report = (name: string) => { const value = data?.[name]; return value && "rows" in value ? value : null; };
  const failure = (name: string) => { const value = data?.[name]; return value && "error" in value ? value.error : ""; };
  const metric = (name: "current" | "prior", label: string) => { const row = report(name)?.rows.find((entry) => entry.metric === label); return row ? Number(row.amount ?? row.count ?? 0) : null; };
  const money = (value: number | null, compact = false) => value === null ? "—" : new Intl.NumberFormat("en-AE", { style: "currency", currency, notation: compact && Math.abs(value) >= 100000 ? "compact" : "standard", minimumFractionDigits: compact && Math.abs(value) >= 100000 ? 0 : 2, maximumFractionDigits: compact && Math.abs(value) >= 100000 ? 1 : 2 }).format(value);
  const count = (value: number | null) => value === null ? "—" : value.toLocaleString("en-AE", { maximumFractionDigits: 2 });
  const open = (key: string, asOf = false) => onOpenReport(key, asOf ? { start: "", end: period.to } : { start: period.from, end: period.to });
  const periodLabel = validPeriod ? period.from === period.to ? showDate(period.from) : `${showDate(period.from)} – ${showDate(period.to)}` : "Choose a valid date range";

  const sales = metric("current", "Net sales"), purchases = metric("current", "Purchase spend"), income = metric("current", "Income"), expenses = metric("current", "Expenses and cost of sales"), netIncome = metric("current", "Net income");
  const outputVat = metric("current", "Output VAT"), inputVat = metric("current", "Recoverable input VAT"), netVat = metric("current", "Net VAT position");
  const kpis = [
    { label: "Net sales", hint: "Invoices and sales receipts less credit notes, ex VAT", value: sales, previous: metric("prior", "Net sales"), icon: TrendingUp, color: "emerald", reportKey: "sales-by-customer", good: "up" },
    { label: "Purchases", hint: "Bills, expenses and cheques less returns, ex VAT", value: purchases, previous: metric("prior", "Purchase spend"), icon: ShoppingCart, color: "amber", reportKey: "purchases-by-vendor", good: "down" },
    { label: "Net profit", hint: income !== null && income > 0 && netIncome !== null ? `${(netIncome / income * 100).toFixed(1)}% net margin on posted income` : "Posted income less expenses and cost of sales", value: netIncome, previous: metric("prior", "Net income"), icon: CircleDollarSign, color: "blue", reportKey: "profit-loss", good: "up" },
    { label: netVat !== null && netVat < 0 ? "VAT recoverable" : "VAT payable", hint: "Output VAT less recoverable input VAT", value: netVat === null ? null : Math.abs(netVat), previous: null, icon: Percent, color: "violet", reportKey: "vat-summary", good: "none" },
  ] as const;
  const position = [
    { label: "Cash & bank", hint: `Closing bank balance at ${showDate(period.to || reportToday())}`, value: metric("current", "Closing bank balance"), icon: Landmark, color: "emerald", reportKey: "bank-register", asOf: false },
    { label: "Receivables", hint: "Owed by customers at the period end", value: metric("current", "Customer receivables"), icon: Clock3, color: "blue", reportKey: "ar-aging-summary", asOf: true },
    { label: "Payables", hint: "Owed to suppliers at the period end", value: metric("current", "Supplier payables"), icon: BadgeDollarSign, color: "amber", reportKey: "ap-aging-summary", asOf: true },
    { label: "Inventory value", hint: "Current stock at average cost (live snapshot)", value: metric("current", "Current stock value"), icon: PackageSearch, color: "violet", reportKey: "inventory-valuation", asOf: false },
  ] as const;
  const operations = [
    { label: "Low-stock items", value: metric("current", "Low-stock items"), reportKey: "inventory-status", warn: true },
    { label: "Out-of-stock items", value: metric("current", "Out-of-stock items"), reportKey: "inventory-status", warn: true },
    { label: "Open sales orders", value: metric("current", "Open sales orders"), reportKey: "sales-orders", warn: false },
    { label: "Open purchase orders", value: metric("current", "Open purchase orders"), reportKey: "open-purchase-orders", warn: false },
    { label: "Active customers", value: metric("current", "Active customers"), reportKey: "active-customers", warn: false },
    { label: "Active suppliers", value: metric("current", "Active suppliers"), reportKey: "supplier-contact-list", warn: false },
  ];
  const trendRows = (report("trend")?.rows ?? []).map((row) => ({ month: String(row.month), income: Number(row.income) || 0, expenses: Number(row.expenses) || 0 }));
  const months = Array.from({ length: 6 }, (_, index) => { const start = new Date(`${trendFrom}T00:00:00Z`); const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1)); const month = date.toISOString().slice(0, 7); const found = trendRows.find((row) => row.month === month); return { month, label: monthLabel.format(date), income: found?.income ?? 0, expenses: found?.expenses ?? 0 }; });
  const trendMax = Math.max(1, ...months.flatMap((row) => [row.income, row.expenses]));

  function selectPreset(label: PresetLabel) {
    if (label === "Custom range" && preset !== "Custom range" && validPeriod) setCustom(period);
    setPreset(label);
  }

  return <div className="business-dashboard min-w-0 space-y-5">
    <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5" aria-label="Dashboard period">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[.14em] text-muted-foreground"><CalendarRange className="size-4" /> REPORTING PERIOD</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{periodLabel}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{inventoryName} · amounts in {currency} · figures come from the same calculations as Reports</p>
        </div>
        <div className="flex min-w-0 flex-col gap-3 xl:items-end">
          <div className="flex max-w-full flex-wrap gap-1.5 xl:justify-end" role="radiogroup" aria-label="Date range">
            {[...presets.map((entry) => entry.label), "Custom range" as const].map((label) => <button key={label} type="button" role="radio" aria-checked={preset === label} onClick={() => selectPreset(label)} className={`rounded-full border px-3 py-1.5 text-sm sm:px-3.5 font-semibold whitespace-nowrap transition ${preset === label ? "brand-primary-button border-transparent shadow-sm" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{label}</button>)}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {preset === "Custom range" && <>
              <div className="space-y-1"><Label htmlFor="dashboard-from">From</Label><Input id="dashboard-from" type="date" value={custom.from} max={custom.to || undefined} onChange={(event) => setCustom((current) => ({ ...current, from: event.target.value }))} className="w-auto" /></div>
              <div className="space-y-1"><Label htmlFor="dashboard-to">To</Label><Input id="dashboard-to" type="date" value={custom.to} min={custom.from || undefined} onChange={(event) => setCustom((current) => ({ ...current, to: event.target.value }))} className="w-auto" /></div>
            </>}
            {canViewReports && <Button type="button" variant="outline" disabled={loading || !validPeriod} onClick={() => setRefresh((value) => value + 1)}><RefreshCw className={loading ? "animate-spin" : undefined} />Refresh</Button>}
          </div>
        </div>
      </div>
      {!validPeriod && <p role="alert" className="mt-3 text-sm text-destructive">Choose a From date on or before the To date.</p>}
    </section>

    {canViewReports ? <>
      {failure("current") && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{failure("current")} Use Refresh to try again.</p>}
      <p className="sr-only" aria-live="polite">{loading ? "Loading dashboard figures…" : data ? "Dashboard figures updated." : ""}</p>

      <section aria-label="Trading summary" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const change = kpi.value !== null && kpi.previous !== null && Math.abs(kpi.previous) > 0.005 ? (kpi.value - kpi.previous) / Math.abs(kpi.previous) * 100 : null;
          const better = change === null || kpi.good === "none" ? null : kpi.good === "up" ? change >= 0 : change <= 0;
          return <button key={kpi.label} type="button" onClick={() => open(kpi.reportKey)} disabled={loading} className="group min-w-0 rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-foreground/20 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-progress sm:p-5" aria-label={`${kpi.label}: ${money(kpi.value)}. Open report`}>
            <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{kpi.label}</p><span className={`metric-icon metric-${kpi.color} shrink-0`}><kpi.icon className="size-5" /></span></div>
            {loading ? <div className="mt-2 h-8 w-3/4 animate-pulse rounded-md bg-muted" /> : <p className={`mt-1 text-2xl font-bold tracking-tight break-words tabular-nums ${kpi.label === "Net profit" && (kpi.value ?? 0) < 0 ? "text-rose-600" : ""}`}>{money(kpi.value)}</p>}
            <div className="mt-3 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {!loading && change !== null && <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold ${better ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{change >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{Math.abs(change).toFixed(1)}%</span>}
              {!loading && change !== null && <span className="text-muted-foreground">vs {money(kpi.previous, true)} previous period</span>}
              {(loading || change === null) && <span className="text-muted-foreground">{kpi.hint}</span>}
            </div>
            {!loading && change !== null && <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>}
          </button>;
        })}
      </section>

      <section aria-label="Financial position" className="space-y-2">
        <h3 className="text-sm font-bold tracking-wide text-muted-foreground">Position at {showDate(period.to || reportToday())}</h3>
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
          {position.map((card) => <button key={card.label} type="button" onClick={() => open(card.reportKey, card.asOf)} disabled={loading} className="min-w-0 rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-foreground/20 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-progress" aria-label={`${card.label}: ${money(card.value)}. Open report`}>
            <div className="flex items-center gap-3"><span className={`metric-icon metric-${card.color} shrink-0`}><card.icon className="size-5" /></span><div className="min-w-0"><p className="text-sm font-medium text-muted-foreground">{card.label}</p>{loading ? <div className="mt-1 h-6 w-28 animate-pulse rounded bg-muted" /> : <p className={`text-lg font-bold tracking-tight break-words tabular-nums ${(card.value ?? 0) < 0 ? "text-rose-600" : ""}`}>{money(card.value)}</p>}</div></div>
            <p className="mt-2 text-xs text-muted-foreground">{card.hint}</p>
          </button>)}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <article className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-label="Income and expenses by month">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">Income vs expenses</h3><p className="text-xs text-muted-foreground">Six months to {showDate(period.to || reportToday())} · posted ledger</p></div><div className="flex items-center gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className="brand-chart-bar size-2.5 rounded-sm" />Income</span><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-slate-400" />Expenses</span></div></div>
          {failure("trend") ? <p role="alert" className="mt-6 text-sm text-destructive">{failure("trend")}</p> : <div className="mt-5 grid h-48 grid-cols-6 items-end gap-2 border-b sm:gap-4" role="list">
            {months.map((row) => <div key={row.month} role="listitem" className="flex h-full min-w-0 flex-col justify-end" title={`${row.label}: income ${money(row.income)}, expenses ${money(row.expenses)}, net ${money(row.income - row.expenses)}`} aria-label={`${row.label}: income ${money(row.income)}, expenses ${money(row.expenses)}`}>
              <div className="flex h-full items-end justify-center gap-0.5">
                <div className={`brand-chart-bar w-full max-w-5 rounded-t ${loading ? "animate-pulse opacity-40" : ""}`} style={{ height: `${loading ? 30 : Math.max(row.income / trendMax * 100, row.income > 0 ? 2 : 0)}%` }} />
                <div className={`w-full max-w-5 rounded-t bg-slate-400 ${loading ? "animate-pulse opacity-40" : ""}`} style={{ height: `${loading ? 20 : Math.max(row.expenses / trendMax * 100, row.expenses > 0 ? 2 : 0)}%` }} />
              </div>
            </div>)}
          </div>}
          <div className="mt-2 grid grid-cols-6 gap-2 text-center text-[11px] text-muted-foreground sm:gap-4">{months.map((row) => <span key={row.month} className="truncate">{row.label}</span>)}</div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3"><Button type="button" variant="link" className="h-auto px-0" onClick={() => onOpenReport("income-expense-graph", { start: trendFrom, end: period.to })}>Open Income &amp; Expense report</Button></div>
        </article>

        <article className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-label="Profit and VAT for the period">
          <h3 className="font-bold">Profit &amp; VAT for the period</h3>
          <dl className="mt-4 space-y-2.5 text-sm">
            {[["Income", income, "profit-loss"], ["Expenses and cost of sales", expenses, "profit-loss"], ["Net profit", netIncome, "profit-loss"], ["Output VAT", outputVat, "vat-summary"], ["Recoverable input VAT", inputVat, "vat-summary"], ["Net VAT position", netVat, "vat-summary"]].map(([label, value, key], index) => <div key={String(label)} className={`flex items-center justify-between gap-3 ${index === 2 || index === 5 ? "border-t pt-2.5 font-bold" : ""} ${index === 3 ? "mt-4" : ""}`}>
              <dt className={index === 2 || index === 5 ? "" : "text-muted-foreground"}><button type="button" className="text-left hover:underline" onClick={() => open(String(key))}>{label}</button></dt>
              <dd className={`tabular-nums ${index === 2 && Number(value) < 0 ? "text-rose-600" : ""}`}>{loading ? <span className="inline-block h-4 w-20 animate-pulse rounded bg-muted" /> : money(value as number | null)}</dd>
            </div>)}
          </dl>
          {!loading && netVat !== null && <p className="mt-3 text-xs text-muted-foreground">{netVat >= 0 ? "Positive: VAT to pay for this period." : "Negative: VAT to reclaim for this period."} Filing and adjustments are in VAT Management.</p>}
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3" aria-label="Top lists">
        <TopList title="Top customers" subtitle="By net sales ex VAT" icon={Users} rows={report("customers")?.rows ?? []} error={failure("customers")} loading={loading} valueKey="amount" money={money} onOpen={() => open("sales-by-customer")} />
        <TopList title="Top suppliers" subtitle="By net purchases ex VAT" icon={ShoppingCart} rows={report("suppliers")?.rows ?? []} error={failure("suppliers")} loading={loading} valueKey="amount" money={money} onOpen={() => open("purchases-by-vendor")} />
        <TopList title="Top-selling items" subtitle="By net sales ex VAT" icon={PackageSearch} rows={report("items")?.rows ?? []} error={failure("items")} loading={loading} valueKey="amount" money={money} onOpen={() => open("sales-by-item")} className="lg:col-span-2 2xl:col-span-1" />
      </section>

      <section aria-label="Operations" className="space-y-2">
        <h3 className="text-sm font-bold tracking-wide text-muted-foreground">Operations &amp; contacts · live</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {operations.map((item) => <button key={item.label} type="button" onClick={() => open(item.reportKey, true)} disabled={loading} className="min-w-0 rounded-xl border bg-card p-3 text-left shadow-sm transition hover:border-foreground/20 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-progress sm:p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{item.warn && Number(item.value) > 0 && <AlertTriangle className="size-3.5 text-amber-600" aria-label="Needs attention" />}{item.label}</p>
            {loading ? <div className="mt-1 h-6 w-12 animate-pulse rounded bg-muted" /> : <p className="mt-1 text-xl font-bold tabular-nums">{count(item.value)}</p>}
          </button>)}
        </div>
      </section>
    </> : <section className="rounded-xl border bg-card p-4 text-sm shadow-sm sm:p-5">
      <p className="font-bold">Business status</p>
      <p className="mt-1 text-muted-foreground">Your role does not include financial reports, so the dashboard shows record counts and daily activity.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["Customers", counts.customers, "customers"], ["Vendors", counts.vendors, "vendors"], ["Inventory items", counts.items, "inventory"], ["Transactions", counts.transactions, "sales"]] as const).map(([label, value, view]) => <button key={label} type="button" onClick={() => onNavigate(view)} className="rounded-xl border bg-background p-3 text-left hover:bg-muted"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold tabular-nums">{value.toLocaleString("en-AE")}</p></button>)}
      </div>
    </section>}

    <InsightsActivity key={`${companyId}-${locationId}-${period.to}`} companyId={companyId} locationId={locationId} onOpen={onOpenDetail} initialDate={period.to && period.to < reportToday() ? period.to : undefined} />
  </div>;
}

function TopList({ title, subtitle, icon: Icon, rows, error, loading, valueKey, money, onOpen, className = "" }: { title: string; subtitle: string; icon: typeof Users; rows: Row[]; error: string; loading: boolean; valueKey: string; money: (value: number | null, compact?: boolean) => string; onOpen: () => void; className?: string }) {
  const top = rows.filter((row) => Number(row[valueKey]) > 0.005 && String(row.name ?? "").trim()).slice(0, 5);
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row[valueKey]) || 0), 0);
  const max = Math.max(1, ...top.map((row) => Number(row[valueKey])));
  return <article className={`min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5 ${className}`} aria-label={title}>
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Icon className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><h3 className="font-bold">{title}</h3><p className="text-xs text-muted-foreground">{subtitle}</p></div></div><Button type="button" variant="ghost" size="sm" onClick={onOpen} aria-label={`Open full ${title.toLowerCase()} report`}><FileBarChart2 />Report</Button></div>
    {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : loading ? <div className="mt-4 space-y-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-8 animate-pulse rounded bg-muted" />)}</div> : top.length ? <ol className="mt-4 space-y-3">
      {top.map((row, index) => { const value = Number(row[valueKey]); return <li key={`${row.name}-${index}`} className="min-w-0">
        <div className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 truncate"><span className="mr-2 text-xs text-muted-foreground tabular-nums">{index + 1}</span>{String(row.name)}</span><span className="shrink-0 font-semibold tabular-nums">{money(value)}</span></div>
        <div className="mt-1 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="brand-chart-bar h-full rounded-full" style={{ width: `${Math.max(value / max * 100, 2)}%` }} /></div><span className="w-11 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">{total ? `${(value / total * 100).toFixed(1)}%` : "—"}</span></div>
      </li>; })}
    </ol> : <p className="mt-6 text-center text-sm text-muted-foreground">Nothing recorded in this period.</p>}
  </article>;
}
