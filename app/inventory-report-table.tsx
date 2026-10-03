"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { inventoryColumnKind, inventoryColumnTotal, inventoryColumnWeight, type InventoryReportColumn, type InventoryReportRow } from "@/lib/inventory-report";

export function InventoryReportTable({ rows, columns, currency, renderCell, emptyText }: { rows: InventoryReportRow[]; columns: InventoryReportColumn[]; currency: string; renderCell: (row: InventoryReportRow, column: InventoryReportColumn) => ReactNode; emptyText: string }) {
  const weight = columns.reduce((total, column) => total + inventoryColumnWeight(column), 0);
  const primary = columns.find((column) => ["name", "supplier", "category"].includes(column.key)) ?? columns[0];
  const identities = columns.filter((column) => ["sku", "itemNumber"].includes(column.key));
  const details = columns.filter((column) => column !== primary && !identities.includes(column));
  const totalText = (column: InventoryReportColumn) => {
    const total = inventoryColumnTotal(rows, column);
    if (total === null) return "";
    return total.toLocaleString("en-AE", { minimumFractionDigits: column.type === "money" ? 2 : 0, maximumFractionDigits: 2 });
  };
  if (!rows.length) return <div className="inventory-report-empty"><strong>No matching stock records</strong><p>{emptyText}</p></div>;
  return <div className="inventory-report-data">
    <div className="inventory-report-table-desktop report-table report-table--wide" data-report-columns={columns.length}>
      <Table className="table-fixed"><caption className="sr-only">Inventory report: {rows.length} records; amounts in {currency}</caption><colgroup>{columns.map((column) => <col key={column.key} style={{ width: `${inventoryColumnWeight(column) / weight * 100}%` }} />)}</colgroup><TableHeader><TableRow>{columns.map((column) => { const kind = inventoryColumnKind(column); return <TableHead key={column.key} scope="col" responsiveColumn={kind === "text" ? undefined : kind}>{column.label}{column.type === "money" && <span className="inventory-column-currency">{currency}</span>}</TableHead>; })}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={`${row.itemId ?? row.accountAccountId ?? "row"}-${index}`}>{columns.map((column) => { const kind = inventoryColumnKind(column); return <TableCell key={column.key} responsiveColumn={kind === "text" ? undefined : kind} data-inventory-kind={kind}>{renderCell(row, column)}</TableCell>; })}</TableRow>)}</TableBody><TableFooter><TableRow>{columns.map((column, index) => <TableCell key={column.key} responsiveColumn={index === 0 || inventoryColumnKind(column) === "text" ? undefined : inventoryColumnKind(column) as "quantity" | "price" | "amount"}>{index === 0 ? "Net total" : totalText(column)}</TableCell>)}</TableRow></TableFooter></Table>
    </div>
    <div className="inventory-report-mobile" aria-label="Inventory report records">{rows.map((row, index) => <article className="inventory-stock-card" key={`${row.itemId ?? "row"}-${index}`}><header><h3>{renderCell(row, primary)}</h3><div className="inventory-stock-identities">{identities.map((column) => <span key={column.key}>{column.label}: {renderCell(row, column)}</span>)}</div></header><dl>{details.map((column) => <div key={column.key} data-inventory-kind={inventoryColumnKind(column)}><dt>{column.label}</dt><dd>{renderCell(row, column)}</dd></div>)}</dl></article>)}<div className="inventory-mobile-totals"><strong>Report totals · {rows.length} records</strong><dl>{columns.filter((column) => inventoryColumnTotal(rows, column) !== null).map((column) => <div key={column.key}><dt>{column.label}</dt><dd>{column.type === "money" ? `${currency} ` : ""}{totalText(column)}</dd></div>)}</dl></div></div>
  </div>;
}
