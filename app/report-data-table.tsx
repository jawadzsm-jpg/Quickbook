"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reportColumnKind, reportColumnWeight, type ReportColumn, type ReportRow } from "@/lib/report-presentation";

export function ReportDataTable({ rows, columns, currency, renderCell, emptyText }: { rows: ReportRow[]; columns: ReportColumn[]; currency: string; renderCell: (row: ReportRow, column: ReportColumn) => ReactNode; emptyText: string }) {
  const kinds = columns.map(column => reportColumnKind(column, rows));
  const weights = columns.map(column => reportColumnWeight(column, rows));
  const weight = weights.reduce((sum, value) => sum + value, 0);
  const primary = columns.find(column => ["name", "customer", "supplier", "account", "item", "number", "description"].includes(column.key)) ?? columns[0];
  if (!rows.length || !primary) return <div className="report-data-empty" role="status"><strong>No matching records</strong><p>{emptyText}</p></div>;
  return <section className="report-data" aria-label="Report records">
    <div className="report-data-desktop report-table" data-report-columns={columns.length}>
      <Table style={{ minWidth: `${Math.max(480, columns.length * 130)}px` }}><caption className="sr-only">{rows.length} records. Report currency: {currency}.</caption><colgroup>{columns.map((column, index) => <col key={column.key} style={{ width: `${weights[index] / weight * 100}%` }} />)}</colgroup>
        <TableHeader><TableRow>{columns.map((column, index) => <TableHead key={column.key} scope="col" responsiveColumn={kinds[index] === "text" ? undefined : kinds[index]}>{column.label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map((row, index) => <TableRow key={index}>{columns.map((column, columnIndex) => <TableCell key={column.key} responsiveColumn={kinds[columnIndex] === "text" ? undefined : kinds[columnIndex]}>{renderCell(row, column)}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </div>
    <div className="report-data-mobile">{rows.map((row, index) => <article className="report-data-card" key={index}><header><span>{primary.label}</span><h3>{renderCell(row, primary)}</h3></header><dl>{columns.map((column, columnIndex) => column === primary ? null : <div key={column.key} data-kind={kinds[columnIndex]}><dt>{column.label}</dt><dd>{renderCell(row, column)}</dd></div>)}</dl></article>)}</div>
  </section>;
}
