"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AccountHistory } from "./account-history";
import type { PnlReport, PnlRow } from "@/lib/profit-loss";
import { toast } from "sonner";

export function ProfitLossReport({ report, company, loading, onOpen }: { report: PnlReport; company: string; loading: boolean; onApply: (from: string, to: string) => Promise<void>; onOpen: (id: number) => void }) {
  const [account, setAccount] = useState<{ id: number; name: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const amount = (n: number) => new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  async function download(kind: "xlsx" | "csv" | "pdf") {
    setExporting(true);
    try {
      const { pnlCsv, pnlWorkbook, pnlPdf } = await import("@/lib/pnl-export");
      const data = kind === "csv" ? pnlCsv(report, company) : kind === "xlsx" ? await pnlWorkbook(report, company) : await pnlPdf(report, company);
      const blob = new Blob([data as BlobPart], { type: kind === "csv" ? "text/csv;charset=utf-8" : kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${report.key}-${report.pnl.to || "all-dates"}.${kind}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error("Export could not be generated. Please try again."); } finally { setExporting(false); }
  }
  const accountLink = (row: PnlRow, label: string) => report.pnl.canViewAccounts && Number(row.accountId) > 0 ? <button className="text-left underline underline-offset-2" onClick={() => setAccount({ id: Number(row.accountId), name: String(row.account) })}>{label}</button> : label;
  return <section className="pnl-report space-y-4">
    <div className="flex flex-wrap gap-2 print:hidden">
      <div className="ml-auto flex flex-wrap gap-2">{(["xlsx", "csv", "pdf"] as const).map(kind => <Button key={kind} type="button" variant="outline" disabled={exporting || loading} onClick={() => void download(kind)}>{kind === "xlsx" ? "Excel (.xlsx)" : kind === "pdf" ? "PDF · A4" : "CSV"}</Button>)}</div>
    </div>
    <div className="grid grid-cols-3 gap-3">{[["Income", report.summary.income], ["Costs & expenses", report.summary.expenses], ["Net profit / loss", report.summary.netIncome]].map(([label, value]) => <div key={label} className="rounded-xl border p-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-lg font-bold tabular-nums ${Number(value) < 0 ? "text-red-600" : ""}`}>{amount(Number(value))}</p></div>)}</div>
    <div className="report-table overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-slate-900 text-white"><tr>{report.columns.map(c => <th key={c.key} className={`p-3 ${c.type === "money" ? "text-right" : "text-left"}`}>{c.label}</th>)}</tr></thead><tbody>{report.rows.map((r, i) => <tr key={i} className={`border-b ${r.kind === "total" ? "bg-emerald-100 font-bold text-emerald-950" : r.kind ? "bg-slate-100 font-semibold text-slate-900" : "even:bg-slate-50"}`}>{report.columns.map(c => <td key={c.key} className={`p-3 ${c.type === "money" ? "text-right tabular-nums" : "text-left"}`}>{c.type === "money" && typeof r[c.key] === "number" ? amount(Number(r[c.key])) : ["name", "account"].includes(c.key) ? accountLink(r, String(r[c.key] ?? "")) : c.key === "reference" && Number(r.transactionId) > 0 ? <button className="underline" onClick={() => onOpen(Number(r.transactionId))}>{r[c.key]}</button> : r[c.key] ?? ""}</td>)}</tr>)}{!report.rows.length && <tr><td colSpan={report.columns.length} className="p-6 text-center">No posted entries in this period.</td></tr>}</tbody></table></div>
    <details className="rounded-xl border p-4 print:hidden"><summary className="cursor-pointer font-semibold">Ledger details · {report.pnl.details.length} postings</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Date", "Reference", "Account", "Inventory", "Sales rep", "Amount"].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{report.pnl.details.map((r, i) => <tr key={i} className="border-t"><td className="p-2">{r.date}</td><td className="p-2">{Number(r.transactionId) > 0 ? <button className="underline" onClick={() => onOpen(Number(r.transactionId))}>{r.reference}</button> : r.reference}</td><td className="p-2">{accountLink(r, String(r.account))}</td><td className="p-2">{r.location}</td><td className="p-2">{r.salesman}</td><td className="p-2 text-right tabular-nums">{amount(Number(r.amount))}</td></tr>)}</tbody></table></div></details>
    {account && <div className="rounded-xl border p-4 print:hidden"><div className="mb-3 flex justify-between"><h3 className="font-bold">{account.name} · full account history</h3><Button variant="outline" onClick={() => setAccount(null)}>Close account</Button></div><AccountHistory accountId={account.id} companyId={report.companyId} onOpen={onOpen} /></div>}
  </section>;
}
