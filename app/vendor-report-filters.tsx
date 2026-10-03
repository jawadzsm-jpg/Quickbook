"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emptyVendorFilters, vendorSupplier, type VendorReportColumn, type VendorReportRow } from "@/lib/vendor-report";

export function VendorReportFilters({ rows, columns, filters, onChange, visibleCount }: { rows: VendorReportRow[]; columns: VendorReportColumn[]; filters: typeof emptyVendorFilters; onChange: (filters: typeof emptyVendorFilters) => void; visibleCount: number }) {
  const choices = (key: "supplier" | "account" | "status" | "type") => [...new Set(rows.map((row) => key === "supplier" ? vendorSupplier(row) : String(row[key] ?? "")))].filter(Boolean).sort();
  const options = { supplier: choices("supplier"), account: choices("account"), status: choices("status"), type: choices("type") };
  return <section className="vendor-report-filters print:hidden" aria-label="Vendor report filters">
    <label className="vendor-report-search">Search vendors<Input value={filters.query} placeholder="Supplier, item, document or account…" onChange={(event) => onChange({ ...filters, query: event.target.value })} /></label>
    {(["supplier", "account", "status", "type"] as const).map((key) => options[key].length > 0 && <label key={key}>{key === "supplier" ? "Supplier" : key === "account" ? "Payable / payment account" : key === "type" ? "Document type" : "Status"}<select value={filters[key]} onChange={(event) => onChange({ ...filters, [key]: event.target.value })}><option value="">{key === "supplier" ? "All suppliers" : key === "account" ? "All accounts" : key === "type" ? "All types" : "All statuses"}</option>{options[key].map((value) => <option key={value}>{value}</option>)}</select></label>)}
    {columns.some(column => ["age", "overdueDays"].includes(column.key)) && <label><span>Payment timing</span><span><input type="checkbox" checked={filters.overdue} onChange={event => onChange({ ...filters, overdue: event.target.checked })} /> Past due only</span></label>}
    <label>Sort by<select value={filters.sort} onChange={(event) => onChange({ ...filters, sort: event.target.value })}><option value="default">Report order</option><option value="name">Supplier / name A–Z</option>{columns.some((column) => column.type === "money") && <option value="amount">Highest amount first</option>}{columns.some((column) => column.key === "date") && <option value="date">Newest date first</option>}</select></label>
    <div className="vendor-report-filter-count"><span>{visibleCount} of {rows.length} records · print and exports use these filters</span><Button variant="ghost" size="sm" onClick={() => onChange({ ...emptyVendorFilters })}>Reset filters</Button></div>
  </section>;
}
