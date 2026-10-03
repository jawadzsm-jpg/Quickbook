"use client";

import { ArrowUpRight } from "lucide-react";
import { accountantAccount, emptyAccountantFilters, type AccountantFilters } from "@/lib/accountant-report";
import type { ReportColumn, ReportRow } from "@/lib/report-presentation";

const groups = [
  { title: "Ledger & reconciliation", description: "Trace debits, credits and account movements.", keys: ["trial-balance", "general-ledger", "transaction-detail-account", "journal", "transaction-journal"] },
  { title: "Document activity", description: "Follow documents, card activity and their history.", keys: ["transactions", "transaction-history", "customer-credit-card-audit"] },
  { title: "Audit & exceptions", description: "Review recorded changes and preserved deletion history.", keys: ["audit-trail", "deleted-transactions-summary", "deleted-transactions-detail"] },
];

export function AccountantReportLibrary({ reports, loading, onOpen }: { reports: Array<{ key: string; name: string; description: string }>; loading: boolean; onOpen: (key: string) => void }) {
  const unique = [...new Map(reports.map(report => [report.key, report])).values()];
  return <div className="accountant-library"><div className="pnl-library-intro"><p className="pnl-eyebrow">Accounting review</p><h4>Clear records. Traceable balances.</h4><p>Review postings, follow their source documents and inspect recorded changes. Verified account links open the Chart of Accounts history.</p><div className="pnl-library-tags"><span>Linked accounts</span><span>A4 print & PDF</span><span>Excel & CSV</span></div></div>{groups.map(group => { const items = unique.filter(report => group.keys.includes(report.key)); return items.length ? <section className="accountant-library-group" key={group.title}><h5>{group.title}</h5><p>{group.description}</p><div className="pnl-library-cards">{items.map(report => <button type="button" key={report.key} disabled={loading} onClick={() => onOpen(report.key)}><span><strong>{report.name}</strong><small>{report.description}</small></span><ArrowUpRight className="size-5 shrink-0" aria-hidden="true" /></button>)}</div></section> : null; })}</div>;
}

export function AccountantReportFilters({ rows, columns, filters, onChange, visibleCount }: { rows: ReportRow[]; columns: ReportColumn[]; filters: AccountantFilters; onChange: (filters: AccountantFilters) => void; visibleCount: number }) {
  const hasAccount = columns.some(column => column.key === "account" || (column.key === "name" && column.label === "Account"));
  const accounts = hasAccount ? [...new Map(rows.map(row => { const account = accountantAccount(row); return [account.value, account]; })).values()].filter(account => account.label).sort((a, b) => a.label.localeCompare(b.label)) : [];
  return <section className="accountant-filters" aria-label="Accountant report filters"><div className="accountant-filter-controls print:hidden"><label>Search report<input type="search" value={filters.query} placeholder="Reference, account or recorded details" onChange={event => onChange({ ...filters, query: event.target.value })} /></label>{hasAccount && <label>Account<select value={filters.account} onChange={event => onChange({ ...filters, account: event.target.value })}><option value="">All accounts</option>{accounts.map(account => <option key={account.value} value={account.value}>{account.label}</option>)}</select></label>}<button type="button" onClick={() => onChange({ ...emptyAccountantFilters })} disabled={!filters.query && !filters.account}>Clear filters</button></div><p role="status">Showing {visibleCount} of {rows.length} records · summaries, print and downloads use these rows.{filters.query ? ` Search: ${filters.query}.` : ""}{filters.account ? ` Account: ${accounts.find(account => account.value === filters.account)?.label || "Selected account"}.` : ""}</p></section>;
}
