import type { ListSummaryCard } from "./list-report";

export const employeeReportKeys = new Set(["employee-balances", "employee-payments"]);

type EmployeeReport = { key?: string; rows: Array<Record<string, string | number | null>> };

export function employeeSummary(report: EmployeeReport): { cards: ListSummaryCard[]; note: string } | null {
  const rows = report.rows;
  if (report.key === "employee-balances") return {
    cards: [
      { label: "Employees", value: rows.length, format: "number", tone: "accent" },
      { label: "Active", value: rows.filter((row) => row.status === "active").length, format: "number", tone: "positive" },
      { label: "With balance", value: rows.filter((row) => Number(row.balance) !== 0).length, format: "number" },
      { label: "Currencies", value: new Set(rows.map((row) => String(row.currency))).size, format: "number" },
    ],
    note: "Balances are recorded in each employee's own currency. Open the employee record for details.",
  };
  if (report.key === "employee-payments") return {
    cards: [
      { label: "Paid in home currency", value: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0), format: "money", tone: "accent" },
      { label: "Payments", value: rows.length, format: "number" },
      { label: "Employees paid", value: new Set(rows.map((row) => String(row.name))).size, format: "number" },
      { label: "Currencies", value: new Set(rows.map((row) => String(row.originalCurrency))).size, format: "number" },
    ],
    note: "Cheque payments to saved employee names for the selected period. Original and home amounts are shown; select a cheque number to open its document.",
  };
  return null;
}

export function employeeDetailTarget(key = "") {
  return key === "employee-balances" ? "employee-payments" : key === "employee-payments" ? "employee-balances" : "";
}
