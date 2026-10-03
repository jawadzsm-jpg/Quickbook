"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { purchaseColumnKind, purchaseColumnTotal, purchaseColumnWeight, type PurchaseReportColumn, type PurchaseReportRow } from "@/lib/purchase-report";

export function PurchaseReportTable({ rows, columns, currency, renderCell, emptyText }: { rows: PurchaseReportRow[]; columns: PurchaseReportColumn[]; currency: string; renderCell: (row: PurchaseReportRow, column: PurchaseReportColumn) => ReactNode; emptyText: string }) {
  const weight = columns.reduce((total, column) => total + purchaseColumnWeight(column), 0);
  const primary = ["item", "number", "name", "supplier", "job"].map((key) => columns.find((column) => column.key === key)).find(Boolean) ?? columns[0];
  const identities = columns.filter((column) => ["date", "number", "currency"].includes(column.key) && column !== primary);
  const details = columns.filter((column) => column !== primary && !identities.includes(column));
  const totalText = (column: PurchaseReportColumn) => {
    const total = purchaseColumnTotal(rows, column);
    if (total === null) return "";
    return total.toLocaleString("en-AE", { minimumFractionDigits: column.type === "money" ? 2 : 0, maximumFractionDigits: column.type === "money" ? 2 : 6 });
  };
  if (!rows.length) return <div className="purchase-report-empty"><strong>No matching purchase records</strong><p>{emptyText}</p></div>;
  return <div className="purchase-report-data">
    <div className="purchase-report-table-desktop report-table report-table--wide" data-report-columns={columns.length}>
      <Table className="table-fixed"><caption className="sr-only">Purchase report: {rows.length} records; amounts in {currency}</caption><colgroup>{columns.map((column) => <col key={column.key} style={{ width: `${purchaseColumnWeight(column) / weight * 100}%` }} />)}</colgroup><TableHeader><TableRow>{columns.map((column) => { const kind = purchaseColumnKind(column); return <TableHead key={column.key} scope="col" responsiveColumn={kind === "text" ? undefined : kind}>{column.label}{column.type === "money" && <span className="purchase-column-currency">{currency}</span>}</TableHead>; })}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={`${row.itemId ?? row.accountAccountId ?? "row"}-${index}`}>{columns.map((column) => { const kind = purchaseColumnKind(column); return <TableCell key={column.key} responsiveColumn={kind === "text" ? undefined : kind} data-purchase-kind={kind}>{renderCell(row, column)}</TableCell>; })}</TableRow>)}</TableBody><TableFooter><TableRow>{columns.map((column, index) => <TableCell key={column.key} responsiveColumn={index === 0 || purchaseColumnKind(column) === "text" ? undefined : purchaseColumnKind(column) as "quantity" | "price" | "amount"}>{index === 0 ? "Report total" : totalText(column)}</TableCell>)}</TableRow></TableFooter></Table>
    </div>
    <div className="purchase-report-mobile" aria-label="Purchase report records">{rows.map((row, index) => <article className="purchase-stock-card" key={`${row.itemId ?? "row"}-${index}`}><header><h3>{renderCell(row, primary)}</h3><div className="purchase-stock-identities">{identities.map((column) => <span key={column.key}>{column.label}: {renderCell(row, column)}</span>)}</div></header><dl>{details.map((column) => <div key={column.key} data-purchase-kind={purchaseColumnKind(column)}><dt>{column.label}</dt><dd>{renderCell(row, column)}</dd></div>)}</dl></article>)}<div className="purchase-mobile-totals"><strong>Report totals · {rows.length} records</strong><dl>{columns.filter((column) => purchaseColumnTotal(rows, column) !== null).map((column) => <div key={column.key}><dt>{column.label}</dt><dd>{column.type === "money" ? `${currency} ` : ""}{totalText(column)}</dd></div>)}</dl></div></div>
  </div>;
}
