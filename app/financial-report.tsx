"use client";

import { useState } from "react";
import { AccountHistory } from "./account-history";
import { Button } from "@/components/ui/button";
import { ReportDataTable } from "./report-data-table";
import { financialAccountId, financialSummary } from "@/lib/financial-presentation";
import { pnlAmount } from "@/lib/pnl-presentation";
import type { ReportColumn, ReportRow } from "@/lib/report-presentation";
import type { FinancialReportData } from "@/lib/financial-reports";

export function FinancialReport({ report, onOpen }: { report: FinancialReportData; onOpen: (id: number) => void }) {
  const [account, setAccount] = useState<{ id: number; name: string } | null>(null);
  const overview = financialSummary(report);
  const linkedAccounts = new Set([...report.rows, ...report.financial.details].map(row => Number(row.accountId)).filter(id => id > 0)).size;
  const renderCell = (row: ReportRow, column: ReportColumn) => {
    const value = row[column.key];
    const accountId = financialAccountId(row, column, report.financial.canViewAccounts);
    if (["gainLoss", "currentValue"].includes(column.key) && typeof value !== "number") return "Unavailable";
    if (column.type === "money" && typeof value === "number") return <span data-negative={value < 0}>{pnlAmount(value)}</span>;
    if (["bookedRate", "currentRate"].includes(column.key)) return typeof value === "number" ? value.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "Unavailable";
    if (accountId) return <button type="button" className="financial-source-link text-left" title="Open full account history" onClick={() => setAccount({ id: accountId, name: String(row.account || row.name) })}>{String(value ?? "—")}</button>;
    if (column.key === "reference" && Number(row.transactionId) > 0) return <button type="button" className="financial-source-link" title="Open source document" onClick={() => onOpen(Number(row.transactionId))}>{String(value ?? "—")}</button>;
    return String(value ?? "—");
  };
  const table = (rows: FinancialReportData["rows"], columns: FinancialReportData["columns"]) => <ReportDataTable rows={rows} columns={columns} currency={report.currency} renderCell={renderCell} emptyText="No posted data matches this report and period." />;
  const repeatedDetail = ["income-customer-detail", "expenses-supplier-detail", "realised-gains-losses", "unrealised-gains-losses"].includes(report.key || "");

  const detailColumns = [
    { key: "date", label: "Date" },
    { key: "reference", label: "Source Document" },
    { key: "name", label: "Customer / Supplier" },
    { key: "account", label: "Account" },
    { key: "section", label: "Classification" },
    { key: "amount", label: "Amount", type: "money" as const },
  ].filter((column) => column.key === "date" || column.key === "reference" || column.key === "account" || column.key === "amount" || report.financial.details.some((row) => row[column.key] !== undefined));

  return <section className="financial-report space-y-4">
    <div className="financial-overview-heading"><div><p className="pnl-eyebrow">Financial overview</p><h2>Report summary</h2></div><p>{report.currency} · {linkedAccounts} linked accounts</p></div>
    {overview && <><div className="financial-report-kpis financial-metric-grid">{overview.cards.map(card => <div key={card.label} data-tone={card.tone || (card.value < 0 ? "negative" : "neutral")}><span>{card.label}</span><strong>{card.format === "money" ? pnlAmount(card.value) : card.value.toLocaleString("en-AE")}</strong><small>{card.format === "money" ? report.currency : "Count"}</small></div>)}</div><p className="financial-report-note text-sm">{overview.note}</p></>}
    {report.financial.issues.length > 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><p className="font-semibold">Some accounts could not be linked safely</p><ul className="mt-2 list-disc space-y-1 pl-5">{report.financial.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
    {table(report.rows, report.columns)}
    {!repeatedDetail && <details className="financial-account-details rounded-xl border p-4 print:hidden"><summary className="cursor-pointer font-semibold">Supporting account detail · {report.financial.details.length.toLocaleString("en-AE")} entries</summary><div className="mt-4">{table(report.financial.details, detailColumns)}</div></details>}
    {account && <div className="rounded-xl border p-4 print:hidden"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-bold">{account.name} · full account history</h3><Button variant="outline" onClick={() => setAccount(null)}>Close account</Button></div><AccountHistory accountId={account.id} companyId={report.companyId} onOpen={onOpen} /></div>}
  </section>;
}
