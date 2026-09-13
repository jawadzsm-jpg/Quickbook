"use client";

import { Fragment, useState } from "react";
import type { OpenBalanceData } from "@/lib/customer-open-balance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountHistory } from "./account-history";

type Row = Record<string, string | number>;
type Filters = { customer: string; currency: string; statementDate: string; memo: string; from: string; to: string };

export function CustomerOpenBalance({ data, rows, currency, companyId, loading, onApply, onOpen }: { data: OpenBalanceData; rows: Row[]; currency: string; companyId: number; loading: boolean; onApply: (filters: Filters) => Promise<void>; onOpen: (id: number) => void }) {
  const [customer, setCustomer] = useState(data.customer);
  const [selectedCurrency, setCurrency] = useState(currency);
  const [asOf, setAsOf] = useState(data.asOf);
  const [account, setAccount] = useState<{ id: number; name: string } | null>(null);
  const money = (value: string | number) => new Intl.NumberFormat("en-AE", { style: "currency", currency }).format(Number(value));
  const groups = new Map<string, Row[]>();
  rows.forEach((row) => groups.set(String(row.customer), [...(groups.get(String(row.customer)) || []), row]));
  const exportCsv = () => {
    const quote = (value: string | number) => `"${String(typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
    const records: (string | number)[][] = [["Customer", "Type", "Date", "Num", "Memo", "Due Date", `Open Balance (${currency})`, `Amount (${currency})`, "Receivable Account"]];
    for (const [name, entries] of groups) {
      records.push(...entries.map((row) => [name, row.type, row.date, row.number, row.memo, row.dueDate, row.openBalance, row.amount, row.account]));
      records.push([`Total ${name}`, "", "", "", "", "", Number(entries.reduce((sum, row) => sum + Number(row.openBalance), 0).toFixed(2)), Number(entries.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2)), ""]);
    }
    records.push(["TOTAL", "", "", "", "", "", data.totalOpen, data.totalAmount, ""]);
    const url = URL.createObjectURL(new Blob(["\uFEFF", records.map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = `${data.overdueOnly ? "Customers-Overdue-Invoices" : "Customer-Open-Balance"}-${currency}-${data.asOf}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="space-y-4">
    <form className="grid gap-3 rounded-xl border bg-slate-50 p-4 print:hidden sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); setAccount(null); void onApply({ customer, currency: selectedCurrency, statementDate: asOf, memo: "", from: "", to: "" }); }}>
      <div className="space-y-2"><Label htmlFor="open-balance-customer">Customer</Label><Select value={customer || "__all__"} onValueChange={(value) => setCustomer(value === "__all__" ? "" : value)}><SelectTrigger id="open-balance-customer" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">All customers</SelectItem>{data.customers.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="open-balance-currency">Currency</Label><Select value={selectedCurrency} onValueChange={setCurrency}><SelectTrigger id="open-balance-currency" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{data.currencies.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="open-balance-date">As of</Label><Input id="open-balance-date" type="date" required value={asOf} onChange={(event) => setAsOf(event.target.value)} /></div>
      <div className="flex items-end gap-2"><Button type="submit" className="brand-primary-button" disabled={loading}>{loading ? "Loading…" : "Refresh"}</Button><Button type="button" variant="outline" onClick={exportCsv}>Export CSV</Button></div>
    </form>
    <div className="text-center"><p className="font-semibold">{data.customer || "All customers"} · As of {data.asOf}</p><p className="text-sm text-muted-foreground">{data.overdueOnly ? "Overdue invoices" : "All open transactions"} · {currency}</p></div>
    <div className="report-table rounded-xl border"><Table><TableHeader><TableRow>{["Type", "Date", "Num", "Memo", "Due Date", "Open Balance", "Amount", "Receivable Account"].map((heading) => <TableHead key={heading} className={["Open Balance", "Amount"].includes(heading) ? "text-right" : ""}>{heading}</TableHead>)}</TableRow></TableHeader><TableBody>
      {[...groups].map(([name, entries]) => <Fragment key={name}>
        <TableRow className="bg-slate-100"><TableCell colSpan={8} className="font-bold">{name}</TableCell></TableRow>
        {entries.map((row) => <TableRow key={row.transactionId}>
          <TableCell className="capitalize">{row.type}</TableCell><TableCell>{row.date}</TableCell><TableCell><button type="button" className="brand-accent-text text-left font-semibold underline underline-offset-2 print:hidden" onClick={() => onOpen(Number(row.transactionId))} aria-label={`Open ${row.type} ${row.number}`}>{row.number}</button><span className="hidden print:inline">{row.number}</span></TableCell>
          <TableCell className="max-w-80 whitespace-normal break-words">{row.memo || "—"}</TableCell><TableCell>{row.dueDate || "—"}</TableCell><TableCell className={`text-right font-semibold ${Number(row.openBalance) < 0 ? "text-emerald-700" : ""}`}>{money(row.openBalance)}</TableCell><TableCell className="text-right">{money(row.amount)}</TableCell>
          <TableCell className="whitespace-normal">{data.canViewAccounts && Number(row.accountId) > 0 ? <><span className="hidden print:inline">{row.account}</span><button type="button" className="brand-accent-text text-left underline underline-offset-2 print:hidden" onClick={() => setAccount({ id: Number(row.accountId), name: String(row.account) })}>{row.account}</button></> : row.account}</TableCell>
        </TableRow>)}
        <TableRow className="bg-slate-50 font-semibold"><TableCell colSpan={5}>Total {name}</TableCell><TableCell className="text-right">{money(entries.reduce((sum, row) => sum + Number(row.openBalance), 0))}</TableCell><TableCell className="text-right">{money(entries.reduce((sum, row) => sum + Number(row.amount), 0))}</TableCell><TableCell /></TableRow>
      </Fragment>)}
      {!rows.length && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">{data.overdueOnly ? "No overdue invoices for these filters." : "No open customer transactions for these filters."}</TableCell></TableRow>}
      <TableRow className="bg-slate-100 font-bold"><TableCell colSpan={5}>TOTAL</TableCell><TableCell className="text-right">{money(data.totalOpen)}</TableCell><TableCell className="text-right">{money(data.totalAmount)}</TableCell><TableCell /></TableRow>
    </TableBody></Table></div>
    {account && data.canViewAccounts && <div className="rounded-xl border p-4 print:hidden"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-bold">{account.name}</h3><Button type="button" variant="outline" size="sm" onClick={() => setAccount(null)}>Close account</Button></div><AccountHistory key={account.id} accountId={account.id} companyId={companyId} onOpen={onOpen} /></div>}
  </section>;
}
