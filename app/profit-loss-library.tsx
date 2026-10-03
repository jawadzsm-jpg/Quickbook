"use client";

import { ArrowUpRight } from "lucide-react";

const groups = [
  { title: "Financial performance", description: "Start with the statement, then compare periods or inspect individual postings.", keys: ["profit-loss", "profit-loss-detail", "profit-loss-ytd", "profit-loss-prev-year"] },
  { title: "Profitability analysis", description: "Understand contributions by item, representative, inventory and document class.", keys: ["profit-loss-item", "profit-loss-rep", "profit-loss-job", "profit-loss-class"] },
  { title: "Costs & account review", description: "Trace recorded cost of sales and review postings that need an account match.", keys: ["profit-loss-cost-of-goods", "profit-loss-unclassified"] },
];

export function ProfitLossLibrary({ reports, loading, onOpen }: { reports: Array<{ key: string; name: string; description: string }>; loading: boolean; onOpen: (key: string) => void }) {
  const unique = [...new Map(reports.map(report => [report.key, report])).values()];
  const known = new Set(groups.flatMap(group => group.keys));
  const displayGroups = [...groups, { title: "Planning & stock profitability", description: "Compare budgets and review stock pricing and item profitability.", keys: unique.filter(report => !known.has(report.key)).map(report => report.key) }];
  return <div className="pnl-library">
    <div className="pnl-library-intro"><p className="pnl-eyebrow">Profit & Loss</p><h4>A clear view of business performance.</h4><p>Review income, costs and profit from posted ledger entries. Follow account and source-document links to understand the numbers.</p><div className="pnl-library-tags"><span>Accrual basis</span><span>Home currency</span><span>A4 print & PDF</span><span>Excel & CSV</span></div></div>
    {displayGroups.map(group => {
      const entries = unique.filter(report => group.keys.includes(report.key));
      return entries.length ? <section key={group.title} className="pnl-library-group"><h4>{group.title}</h4><p>{group.description}</p><div className="pnl-library-cards">{entries.map(report => <button type="button" key={report.key} disabled={loading} onClick={() => onOpen(report.key)}><span><strong>{report.name}</strong><small>{report.description}</small></span><ArrowUpRight aria-hidden="true" className="size-5 shrink-0" /></button>)}</div></section> : null;
    })}
  </div>;
}
