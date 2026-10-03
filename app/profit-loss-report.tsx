"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown, Download } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { pnlAmount, pnlSummary } from "@/lib/pnl-presentation";
import { reportColumnKind, reportColumnWeight } from "@/lib/report-presentation";
import { Button } from "@/components/ui/button";
import { AccountHistory } from "./account-history";
import type { PnlReport, PnlRow } from "@/lib/profit-loss";
import { toast } from "sonner";
import type { PrintOrientation } from "@/lib/document-print";

export function ProfitLossReport({ report, company, loading, onOpen, onOpenItem, onOpenArea, stamp, orientation = "portrait" }: { report: PnlReport; company: string; loading: boolean; onApply: (from: string, to: string) => Promise<void>; onOpen: (id: number) => void; onOpenItem: (query: string) => void; onOpenArea: (area: "sales" | "purchases" | "inventory" | "journal-entries", query?: string, locationId?: number) => void; stamp?: { data: string; left: number; top: number }; orientation?: PrintOrientation }) {
  const [account, setAccount] = useState<{ id: number; name: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const amount = pnlAmount;
  async function download(kind: "xlsx" | "csv" | "pdf") {
    setExporting(true);
    try {
      const [{ pnlCsv, pnlWorkbook, pnlPdf }, { reportFilename }] = await Promise.all([import("@/lib/pnl-export"), import("@/lib/report-export")]);
      const data = kind === "csv" ? pnlCsv(report, company) : kind === "xlsx" ? await pnlWorkbook(report, company, orientation) : await pnlPdf(report, company, stamp, orientation);
      const blob = new Blob([data as BlobPart], { type: kind === "csv" ? "text/csv;charset=utf-8" : kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = reportFilename(report, kind); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error("Export could not be generated. Please try again."); } finally { setExporting(false); }
  }
  const accountLink = (row: PnlRow, label: string) => report.pnl.canViewAccounts && Number(row.accountId) > 0 ? <button type="button" className="pnl-link" title={`Open account ${row.code || ""} · ${row.account}`} onClick={() => setAccount({ id: Number(row.accountId), name: String(row.account) })}>{label}</button> : label;
  const groupLink = (row: PnlRow, label: string) => {
    if (report.key === "profit-loss-item" && Number(row.itemId) > 0) return <button type="button" className="pnl-link" onClick={() => onOpenItem(String(row.sku || label))}>{label}</button>;
    if (["profit-loss-rep", "profit-loss-job", "profit-loss-class"].includes(report.key) && row.linkArea) return <button type="button" className="pnl-link" onClick={() => onOpenArea(String(row.linkArea) as "sales" | "purchases" | "inventory" | "journal-entries", report.key === "profit-loss-rep" ? label : "", Number(row.locationId) || undefined)}>{label}</button>;
    return accountLink(row, label);
  };
  const renderCell = (row: PnlRow, column: PnlReport["columns"][number]) => {
    const value = row[column.key];
    if (column.type === "money" && typeof value === "number") return <span data-negative={value < 0}>{amount(value)}</span>;
    if (["name", "account"].includes(column.key)) return groupLink(row, String(value ?? ""));
    if (column.key === "reference" && Number(row.transactionId) > 0) return <button type="button" className="pnl-link" onClick={() => onOpen(Number(row.transactionId))}>{value}</button>;
    return value ?? "";
  };
  const detailed = ["profit-loss-detail", "profit-loss-cost-of-goods"].includes(report.key);
  const detailColumns: PnlReport["columns"] = [{ key: "date", label: "Date" }, { key: "reference", label: "Reference" }, { key: "account", label: "Account" }, { key: "location", label: "Inventory" }, { key: "salesman", label: "Sales rep" }, { key: "amount", label: "Amount", type: "money" }];
  return <section className="pnl-report space-y-4" aria-label={report.title} aria-busy={loading}>
    <div className="pnl-overview-heading"><div><p className="pnl-eyebrow">Performance overview</p><h2>{report.key === "profit-loss-unclassified" ? "Classified ledger summary" : "Period summary"}</h2><p>{report.currency} · {report.pnl.from || "Beginning"} to {report.pnl.to || "Latest posting"}</p></div>
      <DropdownMenu><DropdownMenuTrigger asChild><Button className="print:hidden" type="button" variant="outline" disabled={exporting || loading}><Download className="size-4" />{exporting ? "Preparing…" : "Export report"}<ChevronDown className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{(["xlsx", "csv", "pdf"] as const).map(kind => <DropdownMenuItem key={kind} onSelect={() => void download(kind)}>{kind === "xlsx" ? "Excel workbook (.xlsx)" : kind === "pdf" ? "A4 PDF document" : "Comma-separated values (.csv)"}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
    </div>
    <div className="pnl-kpis">{pnlSummary(report).map(({ label, value }, index) => <div key={label} data-result={index === 2} data-negative={value < 0}><p>{label}</p><strong>{amount(value)}</strong><span>{report.currency}</span></div>)}</div>
    {report.pnl.warnings.length > 0 && <aside className="pnl-review" aria-label="Account and posting review"><h3>Review before relying on profit</h3><ul>{report.pnl.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></aside>}
    {report.key === "profit-loss-unclassified" && <p className="pnl-note">The summary above includes classified postings only. Unmatched entries below are excluded until their Chart of Accounts mapping is resolved.</p>}
    <PnlTable rows={report.rows} columns={report.columns} renderCell={renderCell} currency={report.currency} label={report.title} />
    {!detailed && <details className="pnl-ledger print:hidden"><summary>Ledger details · {report.pnl.details.length} postings</summary><p className="pnl-note">Account links open full history. Document references open the original transaction.</p><PnlTable rows={report.pnl.details} columns={detailColumns} renderCell={renderCell} currency={report.currency} label="Ledger details" /></details>}
    {account && <div className="rounded-xl border p-4 print:hidden"><div className="mb-3 flex justify-between"><h3 className="font-bold">{account.name} · full account history</h3><Button variant="outline" onClick={() => setAccount(null)}>Close account</Button></div><AccountHistory accountId={account.id} companyId={report.companyId} onOpen={onOpen} /></div>}
  </section>;
}

function PnlTable({ rows, columns, renderCell, currency, label }: { rows: PnlRow[]; columns: PnlReport["columns"]; renderCell: (row: PnlRow, column: PnlReport["columns"][number]) => ReactNode; currency: string; label: string }) {
  const primary = columns.find(column => ["name", "account"].includes(column.key)) || columns[0];
  const numeric = new Map(columns.map(column => [column.key, reportColumnKind(column, rows) !== "text"]));
  const weights = columns.map(column => reportColumnWeight(column, rows));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (!rows.length) return <div className="pnl-empty" role="status">No posted entries match this report and period.</div>;
  return <div className="pnl-data">
    <div className="pnl-table-desktop report-table" data-report-columns={columns.length}><table><caption className="sr-only">{label} · {currency}</caption><colgroup>{columns.map((column, index) => <col key={column.key} style={{ width: `${weights[index] / totalWeight * 100}%` }} />)}</colgroup><thead><tr>{columns.map(column => <th scope="col" key={column.key} data-numeric={numeric.get(column.key)}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} data-kind={row.kind || "entry"}>{row.kind === "section" ? <th scope="rowgroup" colSpan={columns.length}>{renderCell(row, primary)}</th> : columns.map(column => <td key={column.key} data-numeric={numeric.get(column.key)}>{renderCell(row, column)}</td>)}</tr>)}</tbody></table></div>
    <div className="pnl-table-mobile">{rows.map((row, index) => <article key={index} data-kind={row.kind || "entry"}><h3>{renderCell(row, primary)}</h3>{row.kind !== "section" && <dl>{columns.filter(column => column !== primary).map(column => <div key={column.key} data-numeric={numeric.get(column.key)}><dt>{column.label}</dt><dd>{renderCell(row, column)}</dd></div>)}</dl>}</article>)}</div>
  </div>;
}
