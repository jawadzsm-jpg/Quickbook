"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { vatColumnKind, vatColumnTotal, vatColumnWeight, type VatColumn, type VatRow } from "@/lib/vat-report";

export function VatReportTable({ rows, columns, currency, renderCell, emptyText }: { rows: VatRow[]; columns: VatColumn[]; currency: string; renderCell: (row: VatRow, column: VatColumn) => ReactNode; emptyText: string }) {
  const weight = columns.reduce((total, column) => total + vatColumnWeight(column), 0);
  const hasTotals = columns.some((column) => vatColumnTotal(rows, column) !== null);
  const primary = ["number", "code", "name", "description", "party", "date"].map((key) => columns.find((column) => column.key === key)).find(Boolean) ?? columns[0];
  const identities = columns.filter((column) => ["date", "number", "currency"].includes(column.key) && column !== primary);
  const details = columns.filter((column) => column !== primary && !identities.includes(column));
  const totalText = (column: VatColumn) => {
    const total = vatColumnTotal(rows, column);
    if (total === null) return "";
    return total.toLocaleString("en-AE", { minimumFractionDigits: column.type === "money" ? 2 : 0, maximumFractionDigits: column.type === "money" ? 2 : 6 });
  };
  if (!rows.length) return <div className="vat-report-empty"><strong>No matching VAT records</strong><p>{emptyText}</p></div>;
  return <div className="vat-report-data">
    <div className="vat-report-table-desktop report-table report-table--wide" data-report-columns={columns.length}>
      <Table className="table-fixed"><caption className="sr-only">VAT report: {rows.length} records; amounts in {currency}</caption><colgroup>{columns.map((column) => <col key={column.key} style={{ width: `${vatColumnWeight(column) / weight * 100}%` }} />)}</colgroup><TableHeader><TableRow>{columns.map((column) => { const kind = vatColumnKind(column); return <TableHead key={column.key} scope="col" responsiveColumn={kind === "text" ? undefined : kind}>{column.label}{column.type === "money" && <span className="vat-column-currency">{currency}</span>}</TableHead>; })}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={`${row.itemId ?? row.accountAccountId ?? "row"}-${index}`}>{columns.map((column) => { const kind = vatColumnKind(column); return <TableCell key={column.key} responsiveColumn={kind === "text" ? undefined : kind} data-vat-kind={kind}>{renderCell(row, column)}</TableCell>; })}</TableRow>)}</TableBody>{hasTotals && <TableFooter><TableRow>{columns.map((column, index) => <TableCell key={column.key} responsiveColumn={index === 0 || vatColumnKind(column) === "text" ? undefined : vatColumnKind(column) as "quantity" | "price" | "amount"}>{index === 0 ? "Report total" : totalText(column)}</TableCell>)}</TableRow></TableFooter>}</Table>
    </div>
    <div className="vat-report-mobile" aria-label="VAT report records">{rows.map((row, index) => <article className="vat-stock-card" key={`${row.itemId ?? "row"}-${index}`}><header><h3>{renderCell(row, primary)}</h3><div className="vat-stock-identities">{identities.map((column) => <span key={column.key}>{column.label}: {renderCell(row, column)}</span>)}</div></header><dl>{details.map((column) => <div key={column.key} data-vat-kind={vatColumnKind(column)}><dt>{column.label}</dt><dd>{renderCell(row, column)}</dd></div>)}</dl></article>)}{hasTotals && <div className="vat-mobile-totals"><strong>Report totals · {rows.length} records</strong><dl>{columns.filter((column) => vatColumnTotal(rows, column) !== null).map((column) => <div key={column.key}><dt>{column.label}</dt><dd>{column.type === "money" ? `${currency} ` : ""}{totalText(column)}</dd></div>)}</dl></div>}</div>
  </div>;
}
