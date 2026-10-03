"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emptySalesFilters, salesCustomer, type SalesReportColumn, type SalesReportRow } from "@/lib/sales-report";

export function SalesReportFilters({ rows, columns, reportKey, filters, onChange, visibleCount }: { rows: SalesReportRow[]; columns: SalesReportColumn[]; reportKey: string; filters: typeof emptySalesFilters; onChange: (filters: typeof emptySalesFilters) => void; visibleCount: number }) {
  const choices = (key: "customer" | "salesman" | "account" | "revenueAccount" | "status") => [...new Set(rows.map((row) => key === "customer" ? salesCustomer(row, reportKey) : String(row[key] ?? "")))].filter(Boolean).sort();
  const options = { customer: choices("customer"), salesman: choices("salesman"), account: choices("account"), revenueAccount: choices("revenueAccount"), status: choices("status") };
  const labels = { customer: "Customer", salesman: "Sales rep", account: reportKey === "pending-sales" || reportKey === "sales-orders" ? "Saved document account" : "Receivable / receipt account", revenueAccount: "Revenue account", status: "Status" };
  const allLabels = { customer: "All customers", salesman: "All sales reps", account: "All document accounts", revenueAccount: "All revenue accounts", status: "All statuses" };
  return <section className="sales-report-filters print:hidden" aria-label="Sales report filters">
    <label className="sales-report-search">Search sales<Input value={filters.query} placeholder="Customer, item, document or account…" onChange={(event) => onChange({ ...filters, query: event.target.value })} /></label>
    {(["customer", "salesman", "account", "revenueAccount", "status"] as const).map((key) => options[key].length > 0 && (key !== "revenueAccount" || columns.some((column) => column.key === key)) && <label key={key}>{labels[key]}<select value={filters[key]} onChange={(event) => onChange({ ...filters, [key]: event.target.value })}><option value="">{allLabels[key]}</option>{options[key].map((value) => <option key={value}>{value}</option>)}</select></label>)}
    <label>Sort by<select value={filters.sort} onChange={(event) => onChange({ ...filters, sort: event.target.value })}><option value="default">Report order</option><option value="name">Customer / rep A–Z</option>{columns.some((column) => column.type === "money") && <option value="amount">Highest amount first</option>}{columns.some((column) => column.key === "quantity") && <option value="quantity">Highest quantity first</option>}{columns.some((column) => ["date", "month"].includes(column.key)) && <option value="date">Newest date first</option>}</select></label>
    <div className="sales-report-filter-count"><span>{visibleCount} of {rows.length} records · print and exports use these filters</span><Button variant="ghost" size="sm" onClick={() => onChange({ ...emptySalesFilters })}>Reset filters</Button></div>
  </section>;
}
