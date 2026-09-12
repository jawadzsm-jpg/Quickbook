"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type StatementData = {
  customer: string; statementDate: string; from: string; to: string;
  opening: number; charges: number; credits: number; closing: number;
  customers: { name: string; currency: string }[];
};
type Filters = { customer: string; currency: string; statementDate: string; from: string; to: string };

export function StatementFilters({ statement, currency, currencies, loading, onApply }: {
  statement: StatementData; currency: string; currencies: string[]; loading: boolean; onApply: (filters: Filters) => Promise<void>;
}) {
  const [filters, setFilters] = useState<Filters>({ customer: statement.customer, currency, statementDate: statement.statementDate, from: statement.from, to: statement.to });
  const update = (key: keyof Filters, value: string) => setFilters((old) => ({ ...old, [key]: value }));
  return <form className="statement-filters grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(event) => { event.preventDefault(); void onApply(filters); }}>
    <label className="grid gap-2 text-sm font-medium">Customer name<select className="h-10 min-w-0 rounded-md border bg-background px-3" value={filters.customer} onChange={(event) => { const customer = event.target.value; setFilters((old) => ({ ...old, customer, currency: statement.customers.find((entry) => entry.name === customer)?.currency || old.currency })); }}><option value="">All customers</option>{statement.customers.map((customer) => <option key={customer.name} value={customer.name}>{customer.name}</option>)}</select></label>
    <label className="grid gap-2 text-sm font-medium">Currency<select className="h-10 min-w-0 rounded-md border bg-background px-3" value={filters.currency} onChange={(event) => update("currency", event.target.value)}>{Array.from(new Set([...currencies, currency, ...statement.customers.map((customer) => customer.currency)])).map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
    <label className="grid gap-2 text-sm font-medium">Statement date<Input required type="date" value={filters.statementDate} onChange={(event) => update("statementDate", event.target.value)} /></label>
    <label className="grid gap-2 text-sm font-medium">From<Input type="date" max={filters.to} value={filters.from} onChange={(event) => update("from", event.target.value)} /></label>
    <label className="grid gap-2 text-sm font-medium">To<Input required type="date" min={filters.from} max={filters.statementDate} value={filters.to} onChange={(event) => update("to", event.target.value)} /></label>
    <Button className="self-end" type="submit" disabled={loading}>{loading ? "Updating…" : "Apply filters"}</Button>
    <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-6">Only transactions in the selected currency are included. Leave From blank for all activity up to the To date.</p>
  </form>;
}

export function StatementHeading({ statement, currency, company }: {
  statement: StatementData; currency: string;
  company: { name: string; logoData: string; addressLine1: string; addressLine2: string; city: string; country: string; phone: string; email: string; trn: string };
}) {
  const date = (value: string) => value ? new Date(value + "T12:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "Beginning";
  const money = (amount: number) => new Intl.NumberFormat("en-AE", { style: "currency", currency }).format(amount);
  return <section className="statement-heading">
    <div className="statement-brand">
      <div>{company.logoData && <Image unoptimized width={192} height={64} src={company.logoData} alt={company.name} className="mb-3 max-h-16 max-w-48 object-contain" />}<h2>{company.name}</h2><p>{[company.addressLine1, company.addressLine2, company.city, company.country].filter(Boolean).join(", ")}</p><p>{[company.phone, company.email].filter(Boolean).join(" · ")}</p>{company.trn && <p>TRN: {company.trn}</p>}</div>
      <div className="statement-document-title"><h2>STATEMENT OF ACCOUNT</h2><p>Statement date: {date(statement.statementDate)}</p><p>Currency: {currency}</p></div>
    </div>
    <div className="statement-recipient"><div><span>Statement for</span><h3>{statement.customer || "All customers"}</h3></div><div><span>Statement period</span><p>{date(statement.from)} — {date(statement.to)}</p></div></div>
    <div className="statement-totals">{[["Opening balance", statement.opening], ["Period charges", statement.charges], ["Payments / credits", statement.credits], ["Closing balance", statement.closing]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(Number(value))}</strong></div>)}</div>
    <p className="statement-note">{statement.customer ? "Account activity and running balance for the selected period." : "Account activity for all customers. Each row shows that customer's running balance."} Balances include activity before the From date.</p>
  </section>;
}
