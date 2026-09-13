import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, inventoryLocations, items, journalEntries, journalLines, transactionLines, transactions } from "@/db/schema";

export type PnlRow = Record<string, string | number>;
export type PnlMeta = { from: string; to: string; location: string; canViewAccounts: boolean; warnings: string[]; details: PnlRow[] };
export type PnlReport = { key: string; companyId: number; title: string; description: string; generatedAt: string; currency: string; columns: { key: string; label: string; type?: "money" }[]; rows: PnlRow[]; pnl: PnlMeta; summary: { income: number; expenses: number; netIncome: number } };
const incomeTypes = new Set(["Income", "Other Income"]);
const expenseTypes = new Set(["Cost of Goods Sold", "Expense", "Other Expense"]);
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (key: string, label: string) => ({ key, label, type: "money" as const });
const validDate = (s: string) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

export async function profitLoss(companyId: number, locationId: number, currency: string, params: URLSearchParams, canViewAccounts: boolean) {
  const key = params.get("type") || "profit-loss";
  let from = params.get("periodStart") || "";
  let to = params.get("periodEnd") || "";
  if (!validDate(from) || !validDate(to) || from && to && from > to) return Response.json({ error: "Select a valid report period; start date must not follow end date." }, { status: 400 });
  const comparison = ["profit-loss-ytd", "profit-loss-prev-year"].includes(key);
  if (comparison) {
    const end = to || new Date().toISOString().slice(0, 10);
    from ||= `${end.slice(0, 4)}-01-01`;
    to ||= key === "profit-loss-prev-year" ? `${end.slice(0, 4)}-12-31` : end;
  }
  if (from && to && from > to) return Response.json({ error: "Start date must not follow end date." }, { status: 400 });
  const prior = (s: string) => {
    const d = new Date(`${s}T00:00:00Z`); const month = d.getUTCMonth();
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    if (d.getUTCMonth() !== month) d.setUTCDate(0);
    return d.toISOString().slice(0, 10);
  };
  const db = getDb();
  const [chart, entries, docs, lines, stock, locations] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.companyId, companyId)).orderBy(asc(accounts.code)),
    db.select({ entryId: journalEntries.id, transactionId: journalEntries.transactionId, locationId: journalEntries.locationId, date: journalEntries.entryDate, reference: journalEntries.reference, description: journalEntries.description, account: journalLines.accountName, debit: journalLines.debit, credit: journalLines.credit }).from(journalLines).innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId)).where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.posted, true), locationId ? eq(journalEntries.locationId, locationId) : undefined)).orderBy(asc(journalEntries.entryDate), asc(journalLines.id)),
    db.select().from(transactions).where(eq(transactions.companyId, companyId)),
    db.select({ id: transactionLines.id, transactionId: transactionLines.transactionId, itemId: transactionLines.itemId, description: transactionLines.description, quantity: transactionLines.quantity, subtotal: transactionLines.subtotal, unitCost: transactionLines.unitCost }).from(transactionLines).innerJoin(transactions, eq(transactions.id, transactionLines.transactionId)).where(eq(transactions.companyId, companyId)).orderBy(asc(transactionLines.id)),
    db.select({ id: items.id, name: items.name, sku: items.sku }).from(items).where(eq(items.companyId, companyId)),
    db.select().from(inventoryLocations).where(eq(inventoryLocations.companyId, companyId)),
  ]);
  const names = new Map<string, typeof chart>();
  chart.forEach(a => names.set(a.name, [...(names.get(a.name) || []), a]));
  const accountFor = (name: string) => names.get(name)?.length === 1 ? names.get(name)![0] : undefined;
  const docMap = new Map(docs.map(d => [d.id, d]));
  const itemMap = new Map(stock.map(i => [i.id, i]));
  const locationMap = new Map(locations.map(l => [l.id, l.name]));
  const docLines = new Map<number, typeof lines>();
  lines.forEach(l => docLines.set(l.transactionId, [...(docLines.get(l.transactionId) || []), l]));
  const inPeriod = (date: string, start = from, end = to) => (!start || date >= start) && (!end || date <= end);
  const current = entries.filter(e => inPeriod(e.date));
  const warnings = new Set<string>();
  for (const entry of entries.filter(e => inPeriod(e.date) || comparison && inPeriod(e.date, prior(from), prior(to)))) if (!accountFor(entry.account)) warnings.add(`Account “${entry.account}” has ${names.has(entry.account) ? "duplicate names" : "no Chart of Accounts match"}. Its postings are excluded from classified profit; review Unclassified.`);
  const roleTypes: Record<string, string[]> = { SALES: ["Income"], OTHER_INCOME: ["Other Income", "Income"], COGS: ["Cost of Goods Sold"], PURCHASES: ["Cost of Goods Sold", "Expense"], EXPENSE: ["Expense", "Other Expense"], PAYROLL: ["Expense"] };
  chart.filter(a => a.active && a.systemRole && roleTypes[a.systemRole]).forEach(a => {
    if (!roleTypes[a.systemRole!].includes(a.type)) warnings.add(`${a.name}: ${a.systemRole} is linked to ${a.type}; review the account type in Chart of Accounts.`);
  });
  const details: PnlRow[] = current.filter(e => {
    const a = accountFor(e.account); return a && (incomeTypes.has(a.type) || expenseTypes.has(a.type));
  }).map(e => {
    const a = accountFor(e.account)!; const d = docMap.get(e.transactionId || 0);
    return { date: e.date, reference: e.reference, description: e.description, account: e.account, accountId: a.id, code: a.code, type: a.type, transactionId: d?.id || 0, entryId: e.entryId, location: locationMap.get(e.locationId || 0) || "Unassigned", salesman: d?.salesman || "Unallocated", documentType: d?.type || "Manual journal", income: incomeTypes.has(a.type) ? round(e.credit - e.debit) : 0, cost: a.type === "Cost of Goods Sold" ? round(e.debit - e.credit) : 0, expenses: ["Expense", "Other Expense"].includes(a.type) ? round(e.debit - e.credit) : 0, amount: round(incomeTypes.has(a.type) ? e.credit - e.debit : e.debit - e.credit) };
  });
  const summary = details.reduce<PnlReport["summary"]>((s, r) => ({ income: round(s.income + Number(r.income)), expenses: round(s.expenses + Number(r.cost) + Number(r.expenses)), netIncome: round(s.netIncome + Number(r.income) - Number(r.cost) - Number(r.expenses)) }), { income: 0, expenses: 0, netIncome: 0 });
  const report: PnlReport = { key, companyId, title: "Profit & Loss Standard", generatedAt: new Date().toISOString(), currency, description: "Accrual basis · Posted journal entries · Home currency · VAT excluded from income and costs. Account links open ledger history; references open source documents. Unmatched accounts require review before relying on net profit.", columns: [{ key: "name", label: "Account" }, money("amount", "Amount")], rows: [], pnl: { from, to, location: locationId ? locationMap.get(locationId) || "Selected inventory" : "All inventories", canViewAccounts, warnings: [], details }, summary };
  if (key === "profit-loss-detail") {
    report.title = "Profit & Loss Detail"; report.rows = details;
    report.columns = [{ key: "date", label: "Date" }, { key: "reference", label: "Reference" }, { key: "account", label: "Account" }, { key: "type", label: "Classification" }, money("income", "Income"), money("cost", "Cost of sales"), money("expenses", "Other expenses")];
  } else if (key === "profit-loss-unclassified") {
    report.title = "Profit & Loss Unclassified";
    report.rows = current.filter(e => !accountFor(e.account)).map(e => ({ ...e, transactionId: docMap.has(e.transactionId || 0) ? e.transactionId! : 0, locationId: e.locationId || 0 }));
    report.columns = [{ key: "date", label: "Date" }, { key: "reference", label: "Reference" }, { key: "account", label: "Unmatched account" }, money("debit", "Debit"), money("credit", "Credit")];
  } else if (comparison) {
    report.title = key === "profit-loss-ytd" ? "Profit & Loss YTD Comparison" : "Profit & Loss Previous Year Comparison";
    report.columns = [{ key: "name", label: "Account" }, money("previous", `${prior(from)} – ${prior(to)}`), money("amount", `${from} – ${to}`), money("change", "Change")];
    report.rows = chart.filter(a => accountFor(a.name) && (incomeTypes.has(a.type) || expenseTypes.has(a.type))).map(a => {
      const total = (start: string, end: string) => round(entries.filter(e => e.account === a.name && inPeriod(e.date, start, end)).reduce((n, e) => n + (incomeTypes.has(a.type) ? e.credit - e.debit : e.debit - e.credit), 0));
      const amount = total(from, to); const previous = total(prior(from), prior(to));
      return { name: a.name, account: a.name, accountId: a.id, type: a.type, amount, previous, change: round(amount - previous) };
    });
    const previous = round(report.rows.reduce((n, r) => n + (incomeTypes.has(String(r.type)) ? 1 : -1) * Number(r.previous), 0));
    report.rows.push({ name: "Net income", kind: "total", amount: summary.netIncome, previous, change: round(summary.netIncome - previous) });
  } else if (["profit-loss-item", "profit-loss-rep", "profit-loss-job", "profit-loss-class"].includes(key)) {
    const byItem = key === "profit-loss-item";
    report.title = { "profit-loss-item": "Profit & Loss by Item", "profit-loss-rep": "Profit & Loss by Sales Rep", "profit-loss-job": "Profit & Loss by Job / Inventory", "profit-loss-class": "Profit & Loss by Class" }[key]!;
    report.description += " Purchase cost / cost of sales is the recorded COGS for goods sold, not all supplier purchases. Item income is allocated by saved line sales value and COGS by saved quantity × unit cost. Unattributable postings and operating expenses remain Unallocated; credits affect costs only when a cost reversal was posted. Rep is taken from the saved source document.";
    const grouped = new Map<string, { name: string; income: number; cost: number; expenses: number }>();
    const add = (id: string, name: string, field: "income" | "cost" | "expenses", amount: number) => { const r = grouped.get(id) || { name, income: 0, cost: 0, expenses: 0 }; r[field] = round(r[field] + amount); grouped.set(id, r); };
    for (const entry of details) {
      for (const field of ["income", "cost", "expenses"] as const) {
        const value = Number(entry[field]); if (!value) continue;
        if (!byItem) { const name = String(key === "profit-loss-rep" ? entry.salesman : key === "profit-loss-job" ? entry.location : entry.documentType); add(name, name, field, value); continue; }
        const source = docLines.get(Number(entry.transactionId)) || [];
        const weights = source.map(l => field === "income" ? Math.abs(l.subtotal) : field === "cost" ? Math.abs(l.quantity * l.unitCost) : 0);
        const total = weights.reduce((n, w) => n + w, 0);
        if (!total) { add("unallocated", "Unallocated", field, value); continue; }
        let allocated = 0; let weightSoFar = 0;
        source.forEach((l, i) => {
          weightSoFar += weights[i]; const next = round(value * weightSoFar / total); const portion = round(next - allocated); allocated = next;
          if (!weights[i]) return;
          const item = itemMap.get(l.itemId || 0);
          add(item ? `item:${item.id}` : "unallocated", item ? `${item.sku} · ${item.name}` : "Unallocated", field, portion);
        });
      }
    }
    report.rows = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name)).map(r => ({ ...r, gross: round(r.income - r.cost), netIncome: round(r.income - r.cost - r.expenses), margin: r.income > 0 ? `${(100 * (r.income - r.cost) / r.income).toFixed(2)}%` : "—" }));
    const cost = round(details.reduce((n, r) => n + Number(r.cost), 0));
    report.rows.push({ name: "Total", kind: "total", income: summary.income, cost, gross: round(summary.income - cost), expenses: round(summary.expenses - cost), netIncome: summary.netIncome, margin: summary.income > 0 ? `${(100 * (summary.income - cost) / summary.income).toFixed(2)}%` : "—" });
    report.columns = [{ key: "name", label: byItem ? "Item / SKU" : key === "profit-loss-rep" ? "Sales rep" : "Group" }, money("income", "Sales / income"), money("cost", "Purchase cost / cost of sales"), money("gross", "Gross profit"), money("expenses", "Other expenses"), money("netIncome", "Net profit / loss"), { key: "margin", label: "Gross margin" }];
  } else {
    let operating = 0;
    for (const type of ["Income", "Cost of Goods Sold", "Expense", "Other Income", "Other Expense"]) {
      const matching = chart.filter(a => a.type === type && accountFor(a.name));
      const section = matching.map(a => ({ name: `${a.code} · ${a.name}`, account: a.name, accountId: a.id, type, amount: round(details.filter(r => r.accountId === a.id).reduce((n, r) => n + Number(r.amount), 0)) })).filter(r => r.amount !== 0);
      report.rows.push({ name: type === "Cost of Goods Sold" ? "Purchase cost / cost of sales" : type, kind: "section" }, ...section);
      const total = round(section.reduce((n, r) => n + r.amount, 0));
      report.rows.push({ name: `Total ${type}`, kind: "subtotal", amount: total });
      operating = round(operating + (incomeTypes.has(type) ? total : -total));
      if (type === "Cost of Goods Sold") report.rows.push({ name: "Gross profit", kind: "subtotal", amount: operating });
      if (type === "Expense") report.rows.push({ name: "Operating profit", kind: "subtotal", amount: operating });
    }
    report.rows.push({ name: "Net income", kind: "total", amount: summary.netIncome });
  }
  const salesDocuments = new Set(details.filter(r => ["invoice", "sales receipt"].includes(String(r.documentType))).map(r => Number(r.transactionId)));
  for (const id of salesDocuments) {
    const source = docLines.get(id) || [];
    if (source.some(l => l.itemId && l.quantity > 0 && l.unitCost <= 0)) warnings.add(`${docMap.get(id)?.number}: one or more sold items have no positive saved purchase cost. Review the source invoice cost before relying on item margins.`);
    if (source.some(l => l.quantity * l.unitCost > 0) && !details.some(r => Number(r.transactionId) === id && Number(r.cost) !== 0)) warnings.add(`${docMap.get(id)?.number}: saved line costs have no matching cost-of-sales posting in this period. Review the source journal.`);
  }
  report.pnl.warnings = [...warnings];
  return Response.json({ report }, { headers: { "Cache-Control": "no-store" } });
}
