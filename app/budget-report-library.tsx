"use client";

import { ArrowUpRight } from "lucide-react";
import { budgetBar } from "@/lib/budget-report";
import { pnlAmount } from "@/lib/pnl-presentation";
import type { ReportRow } from "@/lib/report-presentation";

export function BudgetReportLibrary({ reports, loading, onOpen }: { reports: Array<{ key: string; name: string; description: string }>; loading: boolean; onOpen: (key: string) => void }) {
  const unique = [...new Map(reports.map(report => [report.key, report])).values()];
  return <div className="budget-library"><div className="pnl-library-intro"><p className="pnl-eyebrow">Budget comparison</p><h4>Understand the gap. Follow the accounts.</h4><p>Compare current posted results with the same period last year. This historical baseline is not a saved or approved budget plan.</p><div className="pnl-library-tags"><span>Prior-year baseline</span><span>Linked accounts</span><span>A4 print & PDF</span><span>Excel & CSV</span></div></div><div className="pnl-library-cards">{unique.map(report => <button key={report.key} type="button" disabled={loading} onClick={() => onOpen(report.key)}><span><strong>{report.name}</strong><small>{report.description}</small></span><ArrowUpRight className="size-5 shrink-0" aria-hidden="true" /></button>)}</div></div>;
}

export function BudgetTrend({ rows, currency }: { rows: ReportRow[]; currency: string }) {
  const months = rows.slice(-12);
  const maximum = Math.max(1, ...months.flatMap(row => [Math.abs(Number(row.actual || 0)), Math.abs(Number(row.budget || 0))]));
  if (!months.length) return null;
  return <section className="budget-trend" aria-label="Monthly net performance"><div className="budget-trend-heading"><h3>Monthly net performance</h3><p>{currency} · latest {months.length} of {rows.length} months. Full data appears in the table and downloads.</p></div><p className="budget-trend-help">Zero is the centre line. Losses extend left; profits extend right.</p><div className="budget-trend-grid">{months.map((row, index) => <article key={`${row.month}-${index}`}><h4>{row.month}</h4>{([['actual', 'Actual'], ['budget', 'Prior-year baseline']] as const).map(([key, label]) => { const value = Number(row[key] || 0), bar = budgetBar(value, maximum); return <div className="budget-trend-series" key={key}><div><span>{label}</span><strong>{pnlAmount(value)}</strong></div><div className="budget-trend-track" aria-hidden="true"><i data-series={key} style={{ left: `${bar.left}%`, width: `${bar.width}%` }} /></div></div>; })}</article>)}</div></section>;
}
