import type { PnlReport } from "./profit-loss";

export function pnlSummary(report: PnlReport) {
  const cogs = report.key === "profit-loss-cost-of-goods";
  return [
    { label: cogs ? "Sales / income" : "Income", value: report.summary.income },
    { label: cogs ? "Cost of goods sold" : "Costs & expenses", value: report.summary.expenses },
    { label: cogs ? "Gross profit" : "Net profit / loss", value: report.summary.netIncome },
  ];
}

export function pnlAmount(value: number) {
  const formatted = Math.abs(value).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `(${formatted})` : formatted;
}
