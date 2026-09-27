export const budgetReportKeys = new Set(["budget-overview", "budget-actual", "budget-actual-graph"]);

export type BudgetSummaryCard = {
  label: string;
  value: number;
  format: "money" | "count";
  tone?: "positive" | "negative" | "neutral";
};

type BudgetReportLike = {
  key?: string;
  rows: Array<Record<string, string | number | null>>;
};

const total = (rows: BudgetReportLike["rows"], key: string) => rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);

export function budgetSummary(report: BudgetReportLike): { cards: BudgetSummaryCard[]; note: string } | null {
  if (!budgetReportKeys.has(report.key || "")) return null;

  if (report.key === "budget-actual-graph") {
    const budget = total(report.rows, "budget");
    const actual = total(report.rows, "actual");
    const variance = actual - budget;
    return {
      cards: [
        { label: "Budgeted net result", value: budget, format: "money" },
        { label: "Actual net result", value: actual, format: "money" },
        { label: "Net variance", value: variance, format: "money", tone: variance >= 0 ? "positive" : "negative" },
        { label: "Periods covered", value: report.rows.length, format: "count", tone: "neutral" },
      ],
      note: "Monthly actual net performance is compared with the budget baseline for the selected period.",
    };
  }

  const incomeRows = report.rows.filter((row) => row.section === "Income");
  const expenseRows = report.rows.filter((row) => row.section === "Expenses");
  const budgetIncome = total(incomeRows, "budget");
  const actualIncome = total(incomeRows, "actual");
  const budgetExpenses = total(expenseRows, "budget");
  const actualExpenses = total(expenseRows, "actual");
  const netVariance = (actualIncome - actualExpenses) - (budgetIncome - budgetExpenses);

  return {
    cards: [
      { label: "Budgeted income", value: budgetIncome, format: "money" },
      { label: "Actual income", value: actualIncome, format: "money" },
      { label: "Budgeted expenses", value: budgetExpenses, format: "money" },
      { label: "Actual expenses", value: actualExpenses, format: "money" },
      { label: "Net favourable variance", value: netVariance, format: "money", tone: netVariance >= 0 ? "positive" : "negative" },
    ],
    note: "A positive net variance is favourable. Select an underlined account to open its Chart of Accounts history.",
  };
}
