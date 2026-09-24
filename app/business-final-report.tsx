"use client";

import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type FinalReportRow = Record<string, string | number | null> & {
  section?: string;
  metric?: string;
  amount?: number | null;
  count?: number | null;
  status?: string;
  detailReport?: string;
  reportKey?: string;
};

const money = (value: number, currency: string) => new Intl.NumberFormat("en-AE", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export function BusinessFinalReport({ rows, currency, onOpenReport }: { rows: FinalReportRow[]; currency: string; onOpenReport: (key: string) => void }) {
  const sections = [...new Set(rows.map((row) => String(row.section || "Summary")))];
  const byMetric = new Map(rows.map((row) => [String(row.metric), row]));
  const highlights = ["Net sales", "Net income", "Customer receivables", "Current stock value"].map((metric) => byMetric.get(metric)).filter((row): row is FinalReportRow => Boolean(row));
  const result = (row: FinalReportRow) => typeof row.amount === "number" ? money(row.amount, currency) : Number(row.count || 0).toLocaleString("en-AE", { maximumFractionDigits: 2 });
  const statusClass = (status: string) => /loss|outflow|action|required|review|outstanding|payable/i.test(status) ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-300 bg-emerald-50 text-emerald-800";

  return <div className="business-final-report space-y-6">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {highlights.map((row) => <article key={String(row.metric)} className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">{row.metric}</p><p className={`mt-2 text-xl font-black tabular-nums ${Number(row.amount || 0) < 0 ? "text-rose-700" : "text-slate-950"}`}>{result(row)}</p><p className="mt-1 text-xs text-slate-500">{row.status}</p></article>)}
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 print:border-slate-300"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /><div><p className="font-bold text-slate-900">Management overview</p><p className="mt-1 leading-6">This final report combines posted accounting activity, open balances and the current inventory snapshot. Select any detailed report link to review the source area.</p></div></div></section>
    {sections.map((section) => {
      const sectionRows = rows.filter((row) => row.section === section);
      return <section key={section} className="break-inside-avoid overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-4 py-3 text-white"><h3 className="font-bold">{section}</h3><span className="text-xs text-slate-300">{sectionRows.length} measures</span></div><div className="divide-y divide-slate-200">{sectionRows.map((row) => <div key={`${section}-${row.metric}`} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_180px_130px_minmax(180px,0.8fr)] sm:items-center"><div><p className="font-semibold text-slate-900">{row.metric}</p><p className="mt-0.5 text-xs text-slate-500 sm:hidden">{row.detailReport}</p></div><p className={`font-bold tabular-nums ${Number(row.amount || 0) < 0 ? "text-rose-700" : "text-slate-900"}`}>{result(row)}</p><Badge variant="outline" className={`w-fit ${statusClass(String(row.status || ""))}`}>{row.status}</Badge><div className="text-right"><Button type="button" variant="link" className="h-auto p-0 text-emerald-700 print:hidden" onClick={() => row.reportKey && onOpenReport(String(row.reportKey))}>{row.detailReport}<ArrowUpRight className="size-3.5" /></Button><span className="hidden text-xs font-semibold text-slate-600 print:inline">Detailed report: {row.detailReport}</span></div></div>)}</div></section>;
    })}
  </div>;
}
