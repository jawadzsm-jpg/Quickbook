export const budgetReportKeys = new Set(["budget-overview", "budget-actual", "budget-actual-graph", "budget-profit-loss"]);

export type BudgetSummaryCard = {
  label: string;
  value: number;
  format: "money" | "count";
  tone?: "positive" | "negative" | "neutral";
};

export type BudgetBasis = { from: string; to: string; baselineFrom: string; baselineTo: string };

export function budgetBasisNote(basis?: BudgetBasis) {
  return `Baseline uses posted results from ${basis ? `${basis.baselineFrom} to ${basis.baselineTo}` : "the same period last year"}, not a saved or approved budget plan. ${basis ? `Actual period: ${basis.from} to ${basis.to}. ` : ""}Home currency, accrual basis. Positive variance is favourable: actual minus baseline for income, baseline minus actual for expenses.`;
}

export function budgetBar(value: number, maximum: number) {
  const width = Math.min(50, Math.abs(value) / Math.max(1, maximum) * 50);
  return { left: value < 0 ? 50 - width : 50, width };
}

type BudgetReportLike = {
  budget?: BudgetBasis;
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
        { label: "Baseline net result", value: budget, format: "money" },
        { label: "Actual net result", value: actual, format: "money" },
        { label: "Net variance", value: variance, format: "money", tone: variance >= 0 ? "positive" : "negative" },
        { label: "Periods covered", value: report.rows.length, format: "count", tone: "neutral" },
      ],
      note: budgetBasisNote(report.budget),
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
      { label: "Baseline income", value: budgetIncome, format: "money" },
      { label: "Actual income", value: actualIncome, format: "money" },
      { label: "Baseline expenses", value: budgetExpenses, format: "money" },
      { label: "Actual expenses", value: actualExpenses, format: "money" },
      { label: "Net favourable variance", value: netVariance, format: "money", tone: netVariance >= 0 ? "positive" : "negative" },
    ],
    note: `${budgetBasisNote(report.budget)} Underlined accounts open their Chart of Accounts history.`,
  };
}
