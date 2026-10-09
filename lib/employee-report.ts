import type { ListSummaryCard } from "./list-report";

export const employeeReportKeys = new Set(["employee-balances", "employee-payments"]);

type EmployeeReport = { key?: string; rows: Array<Record<string, string | number | null>> };

export function employeeSummary(report: EmployeeReport): { cards: ListSummaryCard[]; note: string } | null {
  const rows = report.rows;
  if (report.key === "employee-balances") return {
    cards: [
      { label: "Employees", value: rows.length, format: "number", tone: "accent" },
      { label: "Active", value: rows.filter((row) => row.status === "active").length, format: "number", tone: "positive" },
      { label: "Paid in period", value: rows.reduce((sum, row) => sum + Number(row.paidInPeriod || 0), 0), format: "money" },
      { label: "Loans / advances outstanding", value: rows.reduce((sum, row) => sum + Number(row.loanLedger || 0), 0), format: "money", tone: "negative" },
      { label: "Monthly payroll (salaries)", value: rows.filter((row) => row.status === "active").reduce((sum, row) => sum + Number(row.salaryAmount || 0), 0), format: "money" },
    ],
    note: "Company-wide. Paid in period covers non-cancelled cheques, expenses and loan payments to each employee in the report dates (home currency). Loan / advance ledger balance is the employee's loan account opening balance plus posted movement. Monthly salaries are in each employee's own currency.",
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
