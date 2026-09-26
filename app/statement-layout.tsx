"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveDocumentDesign } from "@/lib/document-design";
import { documentPageRule } from "@/lib/document-print";
import { defaultLetterhead, letterheadForDocument } from "@/lib/letterhead";
import { LetterheadBrand, LetterheadStamp } from "./letterhead-page";

export type StatementData = {
  partyType?: "customer" | "vendor"; memo?: string;
  customer: string; statementDate: string; from: string; to: string;
  opening: number; charges: number; credits: number; closing: number;
  customers: { name: string; currency: string }[];
};
type Filters = { memo: string; customer: string; currency: string; statementDate: string; from: string; to: string };

export function StatementFilters({ statement, currency, currencies, loading, onApply }: {
  statement: StatementData; currency: string; currencies: string[]; loading: boolean; onApply: (filters: Filters) => Promise<void>;
}) {
  const [filters, setFilters] = useState<Filters>({ memo: statement.memo || "", customer: statement.customer, currency, statementDate: statement.statementDate, from: statement.from, to: statement.to });
  const update = (key: keyof Filters, value: string) => setFilters((old) => ({ ...old, [key]: value }));
  return <form className="statement-filters grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(event) => { event.preventDefault(); void onApply(filters); }}>
    <label className="grid gap-2 text-sm font-medium">{statement.partyType === "vendor" ? "Vendor name" : "Customer name"}<select className="h-10 min-w-0 rounded-md border bg-background px-3" value={filters.customer} onChange={(event) => { const customer = event.target.value; setFilters((old) => ({ ...old, customer, currency: statement.customers.find((entry) => entry.name === customer)?.currency || old.currency })); }}><option value="">All {statement.partyType === "vendor" ? "vendors" : "customers"}</option>{statement.customers.map((customer) => <option key={customer.name} value={customer.name}>{customer.name}</option>)}</select></label>
    <label className="grid gap-2 text-sm font-medium">Currency<select className="h-10 min-w-0 rounded-md border bg-background px-3" value={filters.currency} onChange={(event) => update("currency", event.target.value)}>{Array.from(new Set([...currencies, currency, ...statement.customers.map((customer) => customer.currency)])).map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
    <label className="grid gap-2 text-sm font-medium">Statement date<Input required type="date" value={filters.statementDate} onChange={(event) => update("statementDate", event.target.value)} /></label>
    <label className="grid gap-2 text-sm font-medium">From<Input type="date" max={filters.to} value={filters.from} onChange={(event) => update("from", event.target.value)} /></label>
    <label className="grid gap-2 text-sm font-medium">To<Input required type="date" min={filters.from} max={filters.statementDate} value={filters.to} onChange={(event) => update("to", event.target.value)} /></label>
    <Button className="self-end" type="submit" disabled={loading}>{loading ? "Updating…" : "Apply filters"}</Button>
    <label className="grid gap-2 text-sm font-medium sm:col-span-2 lg:col-span-6">Statement memo<textarea className="min-h-20 rounded-md border bg-background p-3" maxLength={2000} value={filters.memo} onChange={(event) => update("memo", event.target.value)} placeholder="Optional note to include on the statement" /></label>
    <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-6">Only transactions in the selected currency are included. Leave From blank for all activity up to the To date.</p>
  </form>;
}

export function StatementHeading({ statement, currency, company, stamp }: {
  statement: StatementData; currency: string;
  company: { name: string; logoData: string; rightLogoData?: string; stampData?: string; addressLine1: string; addressLine2: string; city: string; country: string; phone: string; email: string; trn: string; documentDesign?: string; letterheadDesign?: string };
  stamp?: { show: boolean; left: number; top: number; onMove?: (left: number, top: number) => void };
}) {
  const date = (value: string) => value ? new Date(value + "T12:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "Beginning";
  const money = (amount: number) => new Intl.NumberFormat("en-AE", { style: "currency", currency }).format(amount);
  const { design, savedTemplate } = resolveDocumentDesign(company.documentDesign, "Statement");
  const savedLetterhead = letterheadForDocument(company.letterheadDesign, "statement");
  const letterhead = stamp ? { ...(savedLetterhead ?? defaultLetterhead()), showStamp: stamp.show, stampLeft: stamp.left, stampTop: stamp.top } : savedLetterhead;
  if (!savedTemplate || savedTemplate.appliesToAll || savedTemplate.type !== "Statement") design.title = "Statement of Account";
  const printDesign = { ...design, paper: "A4" as const, printerMode: "specified" as const };
  const address = [company.addressLine1, company.addressLine2, company.city, company.country].filter(Boolean).join(", ");
  const contact = [company.phone, company.email].filter(Boolean).join(" · ");
  return <section className="statement-heading" style={{ fontFamily: design.font, fontSize: design.fontSize, position: "relative" }}>
    <style>{`${documentPageRule(printDesign)}.statement-box-print{display:none}.customer-statement .report-table{font-family:${design.font};font-size:${design.fontSize}px}.customer-statement .report-table thead th{color:${design.color}}@media print{.statement-box-screen{display:none!important}.statement-box-print{display:block!important}}`}</style>
    {letterhead ? <><LetterheadBrand template={letterhead} company={company} /><LetterheadStamp template={letterhead} company={company} onMove={stamp?.onMove} /></> : <div className="statement-brand">
      <div className="flex min-w-0 gap-4">
        {design.leftLogo && company.logoData ? <Image unoptimized width={design.logoWidth} height={design.logoHeight} src={company.logoData} alt={company.name} className="mb-3 max-h-20 max-w-52 object-contain" /> : null}
        <div>{design.showCompany && <h2 style={{ color: design.color, fontSize: design.companySize }}>{company.name}</h2>}{design.showAddress && address ? <p>{address}</p> : null}{(design.showPhone || design.showEmail) && contact ? <p>{[design.showPhone ? company.phone : "", design.showEmail ? company.email : ""].filter(Boolean).join(" · ")}</p> : null}{company.trn && <p>TRN: {company.trn}</p>}</div>
      </div>
      <div className="statement-document-title flex items-start justify-end gap-4"><div><h2 style={{ color: design.color, fontFamily: design.font, fontSize: design.titleSize }}>{design.title.toUpperCase()}</h2><p>Statement date: {date(statement.statementDate)}</p><p>Currency: {currency}</p></div>{design.rightLogo && company.rightLogoData ? <Image unoptimized width={design.logoWidth} height={design.logoHeight} src={company.rightLogoData} alt={`${company.name} right logo`} className="max-h-20 max-w-52 object-contain" /> : null}</div>
    </div>}
    <div className="statement-recipient"><div><span>Statement for</span><h3>{statement.customer || (statement.partyType === "vendor" ? "All vendors" : "All customers")}</h3></div><div><span>Statement period</span><p>{date(statement.from)} — {date(statement.to)}</p></div></div>
    <div className="statement-totals">{[["Opening balance", statement.opening], ["Period charges", statement.charges], ["Payments / credits", statement.credits], ["Closing balance", statement.closing]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(Number(value))}</strong></div>)}</div>
    {statement.memo && <div className="statement-memo"><strong>Memo</strong><p className="whitespace-pre-wrap break-words">{statement.memo}</p></div>}
    {design.message ? <div className="statement-memo"><strong>Message</strong><p className="whitespace-pre-wrap break-words">{design.message}</p></div> : null}
    <p className="statement-note">{statement.customer ? "Account activity and running balance for the selected period." : "Account activity for all selected accounts. Each row shows that account's running balance."} Balances include activity before the From date.</p>
    {design.disclaimer ? <p className="statement-note whitespace-pre-wrap break-words">{design.disclaimer}</p> : null}
    {design.customBoxes.flatMap((box) => {
      const style = { position: "absolute" as const, left: `${box.left / 7.6}%`, top: box.down, width: `${box.width / 7.6}%`, height: box.height, maxWidth: `${Math.max(0, (760 - box.left) / 7.6)}%`, padding: 6, overflow: "hidden", whiteSpace: "pre-wrap" as const, overflowWrap: "anywhere" as const, fontSize: box.fontSize, fontWeight: box.bold ? 700 : 400, border: box.border ? "1px solid #94a3b8" : "none", background: "#fff", zIndex: 5 };
      return [box.screen ? <div key={`${box.id}-screen`} className="statement-box-screen" style={style}>{box.text}</div> : null, box.print ? <div key={`${box.id}-print`} className="statement-box-print" style={style}>{box.text}</div> : null];
    })}
  </section>;
}
