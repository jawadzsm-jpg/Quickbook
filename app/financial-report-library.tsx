"use client";

import { ArrowUpRight } from "lucide-react";

const groups = [
  { title: "Financial position", description: "Review assets, liabilities, equity and changes in net worth.", keys: ["business-final", "balance-sheet", "balance-sheet-detail", "balance-sheet-summary", "balance-sheet-prev-year", "net-worth-graph"] },
  { title: "Income & expenses", description: "Trace posted income and expenses to customers, suppliers and original documents.", keys: ["income-customer-summary", "income-customer-detail", "expenses-supplier-summary", "expenses-supplier-detail", "income-expense-graph"] },
  { title: "Cash & exchange differences", description: "Review cash movements, forecast open balances and assess foreign-currency exposure.", keys: ["cash-flow", "cash-flow-forecast", "realised-gains-losses", "unrealised-gains-losses"] },
];

export function FinancialReportLibrary({ reports, loading, onOpen }: { reports: Array<{ key: string; name: string; description: string }>; loading: boolean; onOpen: (key: string) => void }) {
  const unique = [...new Map(reports.map(report => [report.key, report])).values()];
  const known = new Set(groups.flatMap(group => group.keys));
  const sections = [...groups, { title: "More financial reports", description: "Additional financial analysis.", keys: unique.filter(report => !known.has(report.key)).map(report => report.key) }];
  return <div className="financial-library">
    <div className="pnl-library-intro"><p className="pnl-eyebrow">Financial reporting</p><h4>Understand your position. Trace every balance.</h4><p>Clear statements, cash analysis and exchange-rate estimates, with links to the saved Chart of Accounts and source documents.</p><div className="pnl-library-tags"><span>Posted ledger</span><span>Home currency</span><span>A4 print & PDF</span><span>Excel & CSV</span></div></div>
    {sections.map(group => { const entries = unique.filter(report => group.keys.includes(report.key)); return entries.length ? <section key={group.title} className="pnl-library-group"><h4>{group.title}</h4><p>{group.description}</p><div className="pnl-library-cards">{entries.map(report => <button type="button" key={report.key} disabled={loading} onClick={() => onOpen(report.key)}><span><strong>{report.name}</strong><small>{report.description}</small></span><ArrowUpRight className="size-5 shrink-0" aria-hidden="true" /></button>)}</div></section> : null; })}
  </div>;
}
