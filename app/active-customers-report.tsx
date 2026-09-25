"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountHistory } from "./account-history";

type Row = Record<string, string | number>;
export function ActiveCustomersReport({ rows, companyId, canViewAccounts, count, onCustomer, onOpenSource }: { rows: Row[]; companyId: number; canViewAccounts: boolean; count: number; onCustomer: (name: string, currency: string, overdue: boolean) => void; onOpenSource: (id: number) => void }) {
  const [search, setSearch] = useState("");
  const [account, setAccount] = useState<{ id: number; name: string } | null>(null);
  const filtered = rows.filter((row) => [row.customer, row.phone, row.email, row.currency].some((value) => String(value).toLowerCase().includes(search.toLowerCase())));
  const money = (amount: string | number, currency: string | number) => new Intl.NumberFormat("en-AE", { style: "currency", currency: String(currency) }).format(Number(amount));
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{count} active customers · balances by currency</p><Input className="max-w-sm print:hidden" aria-label="Search active customers" placeholder="Search name, phone, email or currency" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    <div data-report-columns={8} className="report-table report-table--wide rounded-xl border"><Table><TableHeader><TableRow>{["Customer", "Phone", "Email", "Currency", "Open Balance", "Overdue Invoices", "Overdue Balance", "Receivable Account"].map((heading) => <TableHead key={heading} className={heading.includes("Balance") || heading === "Overdue Invoices" ? "text-right" : ""}>{heading}</TableHead>)}</TableRow></TableHeader><TableBody>
      {filtered.map((row) => <TableRow key={`${row.customerId}:${row.currency}`}>
        <TableCell><button type="button" className="brand-accent-text text-left font-semibold underline underline-offset-2 print:hidden" onClick={() => onCustomer(String(row.customer), String(row.currency), false)}>{row.customer}</button><span className="hidden print:inline">{row.customer}</span></TableCell>
        <TableCell>{row.phone || "—"}</TableCell><TableCell className="whitespace-normal break-all">{row.email || "—"}</TableCell><TableCell>{row.currency}</TableCell><TableCell className="text-right">{money(row.openBalance, row.currency)}</TableCell>
        <TableCell className="text-right">{Number(row.overdueInvoices) > 0 ? <><button type="button" className="text-rose-600 font-semibold underline underline-offset-2 print:hidden" aria-label={`Overdue invoices for ${row.customer} in ${row.currency}`} onClick={() => onCustomer(String(row.customer), String(row.currency), true)}>{row.overdueInvoices}</button><span className="hidden print:inline">{row.overdueInvoices}</span></> : 0}</TableCell><TableCell className="text-right">{money(row.overdueBalance, row.currency)}</TableCell>
        <TableCell className="whitespace-normal">{canViewAccounts && Number(row.accountId) > 0 ? <><button type="button" className="brand-accent-text text-left underline underline-offset-2 print:hidden" onClick={() => setAccount({ id: Number(row.accountId), name: String(row.account) })}>{row.account}</button><span className="hidden print:inline">{row.account}</span></> : row.account}</TableCell>
      </TableRow>)}
      {!filtered.length && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No active customers match your search.</TableCell></TableRow>}
    </TableBody></Table></div>
    {account && canViewAccounts && <div className="rounded-xl border p-4 print:hidden"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{account.name}</h3><Button variant="outline" onClick={() => setAccount(null)}>Close account</Button></div><AccountHistory key={account.id} companyId={companyId} accountId={account.id} onOpen={onOpenSource} /></div>}
  </section>;
}
