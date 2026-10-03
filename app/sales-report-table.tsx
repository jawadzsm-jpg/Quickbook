"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { salesColumnKind, salesColumnTotal, salesColumnWeight, type SalesReportColumn, type SalesReportRow } from "@/lib/sales-report";

export function SalesReportTable({ rows, columns, currency, renderCell, emptyText }: { rows: SalesReportRow[]; columns: SalesReportColumn[]; currency: string; renderCell: (row: SalesReportRow, column: SalesReportColumn) => ReactNode; emptyText: string }) {
  const weight = columns.reduce((total, column) => total + salesColumnWeight(column), 0);
  const primary = ["item", "number", "name", "customer", "party", "salesman", "date", "month", "address"].map((key) => columns.find((column) => column.key === key)).find(Boolean) ?? columns[0];
  const identities = columns.filter((column) => ["date", "number", "currency"].includes(column.key) && column !== primary);
  const details = columns.filter((column) => column !== primary && !identities.includes(column));
  const totalText = (column: SalesReportColumn) => {
    const total = salesColumnTotal(rows, column);
    if (total === null) return "";
    return total.toLocaleString("en-AE", { minimumFractionDigits: column.type === "money" ? 2 : 0, maximumFractionDigits: column.type === "money" ? 2 : 6 });
  };
  if (!rows.length) return <div className="sales-report-empty"><strong>No matching sales records</strong><p>{emptyText}</p></div>;
  return <div className="sales-report-data">
    <div className="sales-report-table-desktop report-table report-table--wide" data-report-columns={columns.length}>
      <Table className="table-fixed"><caption className="sr-only">Sales report: {rows.length} records; amounts in {currency}</caption><colgroup>{columns.map((column) => <col key={column.key} style={{ width: `${salesColumnWeight(column) / weight * 100}%` }} />)}</colgroup><TableHeader><TableRow>{columns.map((column) => { const kind = salesColumnKind(column); return <TableHead key={column.key} scope="col" responsiveColumn={kind === "text" ? undefined : kind}>{column.label}{column.type === "money" && <span className="sales-column-currency">{currency}</span>}</TableHead>; })}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={`${row.itemId ?? row.accountAccountId ?? "row"}-${index}`}>{columns.map((column) => { const kind = salesColumnKind(column); return <TableCell key={column.key} responsiveColumn={kind === "text" ? undefined : kind} data-sales-kind={kind}>{renderCell(row, column)}</TableCell>; })}</TableRow>)}</TableBody><TableFooter><TableRow>{columns.map((column, index) => <TableCell key={column.key} responsiveColumn={index === 0 || salesColumnKind(column) === "text" ? undefined : salesColumnKind(column) as "quantity" | "price" | "amount"}>{index === 0 ? "Report total" : totalText(column)}</TableCell>)}</TableRow></TableFooter></Table>
    </div>
    <div className="sales-report-mobile" aria-label="Sales report records">{rows.map((row, index) => <article className="sales-stock-card" key={`${row.itemId ?? "row"}-${index}`}><header><h3>{renderCell(row, primary)}</h3><div className="sales-stock-identities">{identities.map((column) => <span key={column.key}>{column.label}: {renderCell(row, column)}</span>)}</div></header><dl>{details.map((column) => <div key={column.key} data-sales-kind={salesColumnKind(column)}><dt>{column.label}</dt><dd>{renderCell(row, column)}</dd></div>)}</dl></article>)}<div className="sales-mobile-totals"><strong>Report totals · {rows.length} records</strong><dl>{columns.filter((column) => salesColumnTotal(rows, column) !== null).map((column) => <div key={column.key}><dt>{column.label}</dt><dd>{column.type === "money" ? `${currency} ` : ""}{totalText(column)}</dd></div>)}</dl></div></div>
  </div>;
}
