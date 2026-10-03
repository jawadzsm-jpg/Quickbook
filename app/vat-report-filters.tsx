"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emptyVatFilters, type VatColumn, type VatRow } from "@/lib/vat-report";
export function VatReportFilters({ rows, columns, codes, filters, onChange, visibleCount }: { rows: VatRow[]; columns: VatColumn[]; codes: Array<{ code: string; name: string; rate: number }>; filters: typeof emptyVatFilters; onChange: (filters: typeof emptyVatFilters) => void; visibleCount: number }) {
  const labels = { code: "VAT code", direction: "Tax direction", account: "Posted VAT account", status: "Status" };
  const codeNames = new Map(codes.map((code) => [code.code, `${code.code} · ${code.name} · ${code.rate}%`]));
  return <section className="vat-report-filters print:hidden" aria-label="VAT report filters"><label className="vat-report-search">Search VAT<Input value={filters.query} placeholder="Document, code, item or VAT account…" onChange={(event) => onChange({ ...filters, query: event.target.value })} /></label>
    {(["code", "direction", "account", "status"] as const).map((key) => { if (!columns.some((column) => column.key === key)) return null; const values = [...new Set(rows.map((row) => String(row[key] ?? "")))].filter(Boolean).sort(); if (!values.length) return null; return <label key={key}>{labels[key]}<select value={filters[key]} onChange={(event) => onChange({ ...filters, [key]: event.target.value })}><option value="">All {key === "status" ? "statuses" : key === "code" ? "VAT codes" : key === "direction" ? "directions" : "VAT accounts"}</option>{values.map((value) => <option key={value} value={value}>{key === "code" ? codeNames.get(value) ?? value : value}</option>)}</select></label>; })}
    <label>Sort by<select value={filters.sort} onChange={(event) => onChange({ ...filters, sort: event.target.value })}><option value="default">Report order</option>{columns.some((column) => column.type === "money") && <option value="vat">Largest tax amount first</option>}{columns.some((column) => column.key === "date") && <option value="date">Newest date first</option>}{columns.some((column) => column.key === "code") && <option value="code">VAT code A–Z</option>}</select></label>
    <div className="vat-report-filter-count"><span>{visibleCount} of {rows.length} records · print and exports use these filters</span><Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...emptyVatFilters })}>Reset filters</Button></div>
  </section>;
}
