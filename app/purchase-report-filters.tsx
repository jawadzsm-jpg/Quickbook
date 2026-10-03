"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emptyPurchaseFilters, purchaseSupplier, type PurchaseReportColumn, type PurchaseReportRow } from "@/lib/purchase-report";

export function PurchaseReportFilters({ rows, columns, reportKey, filters, onChange, visibleCount }: { rows: PurchaseReportRow[]; columns: PurchaseReportColumn[]; reportKey: string; filters: typeof emptyPurchaseFilters; onChange: (filters: typeof emptyPurchaseFilters) => void; visibleCount: number }) {
  const choices = (key: "supplier" | "account" | "status") => [...new Set(rows.map((row) => key === "supplier" ? purchaseSupplier(row, reportKey) : String(row[key] ?? "")))].filter(Boolean).sort();
  const options = { supplier: choices("supplier"), account: choices("account"), status: choices("status") };
  return <section className="purchase-report-filters print:hidden" aria-label="Purchase report filters">
    <label className="purchase-report-search">Search purchases<Input value={filters.query} placeholder="Supplier, item, document or account…" onChange={(event) => onChange({ ...filters, query: event.target.value })} /></label>
    {(["supplier", "account", "status"] as const).map((key) => options[key].length > 0 && <label key={key}>{key === "supplier" ? "Supplier" : key === "account" ? "Payable / payment account" : "Status"}<select value={filters[key]} onChange={(event) => onChange({ ...filters, [key]: event.target.value })}><option value="">{key === "supplier" ? "All suppliers" : key === "account" ? "All accounts" : "All statuses"}</option>{options[key].map((value) => <option key={value}>{value}</option>)}</select></label>)}
    <label>Sort by<select value={filters.sort} onChange={(event) => onChange({ ...filters, sort: event.target.value })}><option value="default">Report order</option><option value="name">Supplier / name A–Z</option>{columns.some((column) => column.type === "money") && <option value="amount">Highest amount first</option>}{columns.some((column) => column.key === "quantity") && <option value="quantity">Highest quantity first</option>}{columns.some((column) => column.key === "date") && <option value="date">Newest date first</option>}</select></label>
    <div className="purchase-report-filter-count"><span>{visibleCount} of {rows.length} records · print and exports use these filters</span><Button variant="ghost" size="sm" onClick={() => onChange({ ...emptyPurchaseFilters })}>Reset filters</Button></div>
  </section>;
}
