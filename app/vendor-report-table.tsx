"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { vendorColumnKind, vendorColumnTotal, vendorColumnWeight, type VendorReportColumn, type VendorReportRow } from "@/lib/vendor-report";

export function VendorReportTable({ rows, columns, currency, renderCell, emptyText }: { rows: VendorReportRow[]; columns: VendorReportColumn[]; currency: string; renderCell: (row: VendorReportRow, column: VendorReportColumn) => ReactNode; emptyText: string }) {
  const weight = columns.reduce((total, column) => total + vendorColumnWeight(column), 0);
  const primary = ["number", "name", "supplier", "customer", "item"].map((key) => columns.find((column) => column.key === key)).find(Boolean) ?? columns[0];
  const identities = columns.filter((column) => ["date", "number", "currency"].includes(column.key) && column !== primary);
  const details = columns.filter((column) => column !== primary && !identities.includes(column));
  const totalText = (column: VendorReportColumn) => {
    const total = vendorColumnTotal(rows, column);
    if (total === null) return "";
    return total.toLocaleString("en-AE", { minimumFractionDigits: column.type === "money" ? 2 : 0, maximumFractionDigits: column.type === "money" ? 2 : 6 });
  };
  if (!rows.length) return <div className="vendor-report-empty"><strong>No matching vendor records</strong><p>{emptyText}</p></div>;
  return <div className="vendor-report-data">
    <div className="vendor-report-table-desktop report-table report-table--wide" data-report-columns={columns.length}>
      <Table className="table-fixed"><caption className="sr-only">Vendor report: {rows.length} records; amounts in {currency}</caption><colgroup>{columns.map((column) => <col key={column.key} style={{ width: `${vendorColumnWeight(column) / weight * 100}%` }} />)}</colgroup><TableHeader><TableRow>{columns.map((column) => { const kind = vendorColumnKind(column); return <TableHead key={column.key} scope="col" responsiveColumn={kind === "text" ? undefined : kind}>{column.label}{column.type === "money" && <span className="vendor-column-currency">{currency}</span>}</TableHead>; })}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={`${row.itemId ?? row.accountAccountId ?? "row"}-${index}`}>{columns.map((column) => { const kind = vendorColumnKind(column); return <TableCell key={column.key} responsiveColumn={kind === "text" ? undefined : kind} data-vendor-kind={kind}>{renderCell(row, column)}</TableCell>; })}</TableRow>)}</TableBody><TableFooter><TableRow>{columns.map((column, index) => <TableCell key={column.key} responsiveColumn={index === 0 || vendorColumnKind(column) === "text" ? undefined : vendorColumnKind(column) as "quantity" | "price" | "amount"}>{index === 0 ? "Report total" : totalText(column)}</TableCell>)}</TableRow></TableFooter></Table>
    </div>
    <div className="vendor-report-mobile" aria-label="Vendor report records">{rows.map((row, index) => <article className="vendor-stock-card" key={`${row.itemId ?? "row"}-${index}`}><header><h3>{renderCell(row, primary)}</h3><div className="vendor-stock-identities">{identities.map((column) => <span key={column.key}>{column.label}: {renderCell(row, column)}</span>)}</div></header><dl>{details.map((column) => <div key={column.key} data-vendor-kind={vendorColumnKind(column)}><dt>{column.label}</dt><dd>{renderCell(row, column)}</dd></div>)}</dl></article>)}<div className="vendor-mobile-totals"><strong>Report totals · {rows.length} records</strong><dl>{columns.filter((column) => vendorColumnTotal(rows, column) !== null).map((column) => <div key={column.key}><dt>{column.label}</dt><dd>{column.type === "money" ? `${currency} ` : ""}{totalText(column)}</dd></div>)}</dl></div></div>
  </div>;
}
