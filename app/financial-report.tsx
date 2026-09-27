"use client";

import { useState } from "react";
import { AccountHistory } from "./account-history";
import { Button } from "@/components/ui/button";
import type { FinancialReportData } from "@/lib/financial-reports";

export function FinancialReport({ report, onOpen }: { report: FinancialReportData; onOpen: (id: number) => void }) {
  const [account, setAccount] = useState<{ id: number; name: string } | null>(null);
  const format = (value: number) => new Intl.NumberFormat("en-AE", { style: "currency", currency: report.currency }).format(value);
  const sourceDocuments = new Set(report.financial.details.map((row) => Number(row.transactionId)).filter((id) => id > 0)).size;
  const linkedAccounts = new Set(report.financial.details.map((row) => Number(row.accountId)).filter((id) => id > 0)).size;

  const table = (rows: FinancialReportData["rows"], columns: FinancialReportData["columns"]) => <div data-report-columns={columns.length} className={`report-table overflow-auto rounded-xl border ${columns.length === 2 ? "report-table--compact" : columns.length > 6 ? "report-table--wide" : ""}`}>
    <table className="w-full text-sm">
      <thead><tr>{columns.map((column) => <th key={column.key} className={`p-3 ${column.type === "money" ? "text-right" : "text-left"}`}>{column.label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index} className="border-t">
        {columns.map((column) => {
          const value = row[column.key];
          const accountLink = (column.key === "account" || column.key === "name" && row.name === row.account) && Number(row.accountId) > 0 && report.financial.canViewAccounts;
          const documentLink = column.key === "reference" && Number(row.transactionId) > 0;
          return <td key={column.key} className={`p-3 ${column.type === "money" ? "text-right font-semibold tabular-nums" : "text-left"}`}>
            {column.type === "money" && typeof value === "number" ? format(value) : accountLink ? <button type="button" className="financial-source-link text-left" title="Open full account history" onClick={() => setAccount({ id: Number(row.accountId), name: String(row.account || row.name) })}>{String(value ?? "—")}</button> : documentLink ? <button type="button" className="financial-source-link" title="Open source document" onClick={() => onOpen(Number(row.transactionId))}>{String(value ?? "—")}</button> : String(value ?? "—")}
          </td>;
        })}
      </tr>)}{!rows.length && <tr><td colSpan={columns.length} className="p-6 text-center text-muted-foreground">No posted data in this period.</td></tr>}</tbody>
    </table>
  </div>;

  const detailColumns = [
    { key: "date", label: "Date" },
    { key: "reference", label: "Source Document" },
    { key: "name", label: "Customer / Supplier" },
    { key: "account", label: "Account" },
    { key: "section", label: "Classification" },
    { key: "amount", label: "Amount", type: "money" as const },
  ].filter((column) => column.key === "date" || column.key === "reference" || column.key === "account" || column.key === "amount" || report.financial.details.some((row) => row[column.key] !== undefined));

  return <section className="financial-report space-y-4">
    <div className="financial-report-kpis grid gap-3 sm:grid-cols-3">
      <div><span>Report rows</span><strong>{report.rows.length.toLocaleString("en-AE")}</strong></div>
      <div><span>Linked source documents</span><strong>{sourceDocuments.toLocaleString("en-AE")}</strong></div>
      <div><span>Linked accounts</span><strong>{linkedAccounts.toLocaleString("en-AE")}</strong></div>
    </div>
    {report.financial.note && <p className="financial-report-note text-sm text-muted-foreground">{report.financial.note}</p>}
    {report.financial.issues.length > 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><p className="font-semibold">Some accounts could not be linked safely</p><ul className="mt-2 list-disc space-y-1 pl-5">{report.financial.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
    {table(report.rows, report.columns)}
    <details className="financial-account-details rounded-xl border p-4 print:hidden"><summary className="cursor-pointer font-semibold">Supporting account detail · {report.financial.details.length.toLocaleString("en-AE")} entries</summary><div className="mt-4">{table(report.financial.details, detailColumns)}</div></details>
    {account && <div className="rounded-xl border p-4 print:hidden"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-bold">{account.name} · full account history</h3><Button variant="outline" onClick={() => setAccount(null)}>Close account</Button></div><AccountHistory accountId={account.id} companyId={report.companyId} onOpen={onOpen} /></div>}
  </section>;
}
