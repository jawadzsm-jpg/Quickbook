import type { ReportColumn, ReportRow } from "./report-presentation";

type Card = { label: string; value: number; format: "money" | "count"; tone?: "positive" | "negative" | "neutral" };
type FinancialLike = { key?: string; rows: ReportRow[]; financial?: { note?: string } };
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const sum = (rows: ReportRow[], key: string) => round(rows.reduce((value, row) => value + (typeof row[key] === "number" ? row[key] as number : 0), 0));
const money = (label: string, value: number): Card => ({ label, value, format: "money" });
const count = (label: string, value: number): Card => ({ label, value, format: "count" });

export function financialAccountId(row: ReportRow, column: ReportColumn, allowed: boolean) {
  return allowed && (column.key === "account" || column.key === "name" && (column.label === "Account" || row.name === row.account)) && Number(row.accountId) > 0 ? Number(row.accountId) : null;
}

export function financialSummary({ key = "", rows, financial }: FinancialLike): { cards: Card[]; note: string } | null {
  let cards: Card[];
  let note = "Posted ledger entries in home currency. Underlined accounts open full account history; references open source documents.";
  if (key.startsWith("balance-sheet")) {
    const valueKey = key === "balance-sheet-prev-year" ? "current" : "amount";
    const section = (name: string) => sum(rows.filter(row => row.section === name), valueKey);
    const assets = section("Assets"), liabilities = section("Liabilities"), equity = section("Equity");
    const difference = round(assets - liabilities - equity);
    cards = [money("Assets", assets), money("Liabilities", liabilities), money("Equity incl. earnings", equity), { ...money("Balance check difference", difference), tone: difference === 0 ? "positive" : "negative" }];
    note = "Balances through the selected as-of date, including accumulated earnings. Balance check = assets minus liabilities and equity; zero means these classified balances reconcile. Review any account exceptions below.";
  } else if (key === "cash-flow") {
    const value = (name: string) => Number(rows.find(row => row.name === name)?.amount ?? 0);
    cards = [money("Opening cash", value("Opening cash")), money("Net cash movement", value("Net cash movement")), money("Closing cash", value("Closing cash"))];
    note = "Posted bank movement for the selected period. Internal transfers are included at their net effect; opening and closing cash are balances, not additional movements.";
  } else if (key === "cash-flow-forecast") {
    cards = [money("Opening cash", Number(rows[0]?.projected ?? 0)), money("Expected inflows", sum(rows, "inflow")), money("Expected outflows", sum(rows, "outflow")), money("Final projected cash", Number(rows.at(-1)?.projected ?? 0))];
    note = "Projected cash from remaining posted receivables and payables at booked rates; this is an estimate, not a posted cash balance.";
  } else if (key === "net-worth-graph") {
    const last = rows.at(-1);
    cards = [money("Latest assets", Number(last?.assets ?? 0)), money("Latest liabilities", Number(last?.liabilities ?? 0)), money("Latest net worth", Number(last?.netWorth ?? 0))];
    note = `Latest displayed month: ${last?.month || "none"}. Monthly balances are snapshots and are not added together.`;
  } else if (key === "income-expense-graph") {
    cards = [money("Income", sum(rows, "income")), money("Expenses", sum(rows, "expenses")), money("Net result", sum(rows, "net"))];
  } else if (key.startsWith("income-customer") || key.startsWith("expenses-supplier")) {
    const income = key.startsWith("income-customer");
    cards = [money(income ? "Income" : "Expenses", sum(rows, "amount")), count(income ? "Customers / groups" : "Suppliers / groups", new Set(rows.map(row => row.name)).size), count(key.endsWith("detail") ? "Postings" : "Summary rows", rows.length)];
    note = "Posted income or expense, including reversals. Payments are not counted again as revenue or expenses. Unallocated entries have no linked customer or supplier.";
  } else if (["realised-gains-losses", "unrealised-gains-losses"].includes(key)) {
    note = "Calculated exchange differences, not automatically posted to gain/loss accounts. Missing exchange rates are excluded from the calculated totals and counted separately.";
    const gains = rows.filter(row => typeof row.gainLoss === "number" && row.gainLoss > 0);
    const losses = rows.filter(row => typeof row.gainLoss === "number" && row.gainLoss < 0);
    cards = [money("Calculated gains", sum(gains, "gainLoss")), money("Calculated losses", sum(losses, "gainLoss")), money("Net calculated gain / loss", sum(rows, "gainLoss")), count("Awaiting exchange rate", rows.filter(row => typeof row.gainLoss !== "number").length)];
  } else return null;
  return { cards, note: financial?.note || note };
}
