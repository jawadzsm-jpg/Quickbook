export const bankingReportKeys = new Set([
  "bank-register",
  "bank-reconciliation",
]);

export type BankingSummaryCard = {
  label: string;
  value: number | string;
  format: "money" | "number" | "text";
  tone?: "positive" | "negative" | "neutral" | "accent";
};

type BankingReportLike = {
  key?: string;
  rows: Array<Record<string, string | number | null>>;
};

const sum = (rows: BankingReportLike["rows"], key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
const unique = (rows: BankingReportLike["rows"], key: string) => new Set(rows.map((row) => String(row[key] ?? "").trim()).filter(Boolean)).size;
const money = (label: string, value: number, tone: BankingSummaryCard["tone"] = "neutral"): BankingSummaryCard => ({ label, value, format: "money", tone });
const number = (label: string, value: number, tone: BankingSummaryCard["tone"] = "neutral"): BankingSummaryCard => ({ label, value, format: "number", tone });

export function bankingDetailTarget(key = "") {
  return key === "bank-reconciliation" ? "bank-register" : "";
}

export function bankingSummary(report: BankingReportLike): { cards: BankingSummaryCard[]; note: string } | null {
  const key = report.key || "";
  const rows = report.rows;
  if (!bankingReportKeys.has(key)) return null;

  if (key === "bank-register") {
    const moneyIn = sum(rows, "baseDebit");
    const moneyOut = sum(rows, "baseCredit");
    const closingByAccount = new Map<string, number>();
    rows.forEach((row) => closingByAccount.set(String(row.accountAccountId || row.account || ""), Number(row.baseBalance ?? 0)));
    const closingBalance = [...closingByAccount.values()].reduce((total, balance) => total + balance, 0);
    return {
      cards: [money("Money in", moneyIn, "positive"), money("Money out", moneyOut, "negative"), money("Net movement", moneyIn - moneyOut, "accent"), money("Closing bank balance", closingBalance, "accent"), number("Transactions", rows.length), number("Bank accounts", unique(rows, "account"))],
      note: "Figures are shown in home-currency equivalents. Select a bank account to open its Chart of Accounts history; select an underlined reference to open the source banking document.",
    };
  }

  const clearedRows = rows.filter((row) => String(row.status) === "Cleared");
  const unclearedRows = rows.filter((row) => String(row.status) !== "Cleared");
  return {
    cards: [money("Cleared activity", sum(clearedRows, "absoluteAmount"), "positive"), money("Uncleared activity", sum(unclearedRows, "absoluteAmount"), "negative"), number("Cleared items", clearedRows.length, "positive"), number("Uncleared items", unclearedRows.length, "negative"), number("Bank accounts", unique(rows, "account"))],
    note: "Reconciliation activity is taken from posted bank-account journal lines. Select an account for ledger history or an underlined reference for the original banking document.",
  };
}
