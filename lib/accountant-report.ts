export const accountantReportKeys = new Set([
  "trial-balance",
  "general-ledger",
  "transaction-detail-account",
  "journal",
  "audit-trail",
  "customer-credit-card-audit",
  "deleted-transactions-summary",
  "deleted-transactions-detail",
  "transactions",
  "transaction-history",
  "transaction-journal",
]);

export type AccountantSummaryCard = {
  label: string;
  value: number | string;
  format: "money" | "number" | "text";
  tone?: "positive" | "negative" | "neutral" | "accent";
};

type AccountantReportLike = {
  key?: string;
  rows: Array<Record<string, string | number | null>>;
};

const sum = (rows: AccountantReportLike["rows"], key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
const unique = (rows: AccountantReportLike["rows"], key: string) => new Set(rows.map((row) => String(row[key] ?? "").trim()).filter(Boolean)).size;
const count = (rows: AccountantReportLike["rows"], key: string, value: string) => rows.filter((row) => String(row[key] ?? "").toLowerCase() === value.toLowerCase()).length;
const money = (label: string, value: number, tone: AccountantSummaryCard["tone"] = "neutral"): AccountantSummaryCard => ({ label, value, format: "money", tone });
const number = (label: string, value: number, tone: AccountantSummaryCard["tone"] = "neutral"): AccountantSummaryCard => ({ label, value, format: "number", tone });

export function accountantDetailTarget(key = "") {
  return ({
    "trial-balance": "general-ledger",
    "general-ledger": "transaction-detail-account",
    "journal": "transaction-journal",
    "audit-trail": "transaction-history",
    "customer-credit-card-audit": "transactions",
    "deleted-transactions-summary": "deleted-transactions-detail",
    "transactions": "transaction-journal",
    "transaction-history": "transaction-journal",
    "transaction-journal": "general-ledger",
  } as Record<string, string>)[key] || "";
}

export function accountantSummary(report: AccountantReportLike): { cards: AccountantSummaryCard[]; note: string } | null {
  const key = report.key || "";
  const rows = report.rows;
  if (!accountantReportKeys.has(key)) return null;

  if (key === "trial-balance") {
    const debit = sum(rows, "debit");
    const credit = sum(rows, "credit");
    return {
      cards: [money("Total debits", debit, "positive"), money("Total credits", credit, "negative"), money("Debit / credit variance", debit - credit, debit === credit ? "positive" : "accent"), number("Accounts", rows.length), number("Debit-balance accounts", rows.filter((row) => Number(row.balance) > 0).length), number("Credit-balance accounts", rows.filter((row) => Number(row.balance) < 0).length)],
      note: "A balanced trial balance has equal debit and credit totals. Select an account to open its complete Chart of Accounts history.",
    };
  }

  if (["general-ledger", "transaction-detail-account", "journal", "transaction-journal"].includes(key)) {
    const debit = sum(rows, "debit");
    const credit = sum(rows, "credit");
    return { cards: [money("Total debits", debit, "positive"), money("Total credits", credit, "negative"), money("Net movement", debit - credit, "accent"), number("Postings", rows.length), number("Accounts represented", unique(rows, "account"))], note: "Select an underlined reference to open the source document, or an account name to open its complete ledger history." };
  }

  if (key === "audit-trail") {
    return { cards: [number("Audit events", rows.length, "accent"), number("Created", count(rows, "action", "created"), "positive"), number("Updated", count(rows, "action", "updated")), number("Deleted / voided", count(rows, "action", "deleted") + count(rows, "action", "voided"), "negative"), number("Record types", unique(rows, "entity"))], note: "Audit events are immutable activity records for the selected period. Use Transaction History for a combined document and audit timeline." };
  }

  if (key === "customer-credit-card-audit") {
    return { cards: [money("Card activity", sum(rows, "amount"), "accent"), number("Transactions", rows.length), number("Cleared / paid", rows.filter((row) => ["cleared", "paid"].includes(String(row.status).toLowerCase())).length, "positive"), number("Open items", count(rows, "status", "open"), "negative"), number("Card accounts", unique(rows, "account"))], note: "Amounts are shown in home-currency equivalents. Select a reference to open the original card transaction or an account to open its ledger history." };
  }

  if (key === "deleted-transactions-summary" || key === "deleted-transactions-detail") {
    const deleted = key === "deleted-transactions-summary" ? rows.filter((row) => String(row.action) === "Deleted").reduce((total, row) => total + Number(row.records ?? 0), 0) : count(rows, "action", "Deleted");
    const voided = key === "deleted-transactions-summary" ? rows.filter((row) => String(row.action) === "Voided").reduce((total, row) => total + Number(row.records ?? 0), 0) : count(rows, "action", "Voided");
    return { cards: [number("Preserved audit records", deleted + voided, "accent"), number("Deleted", deleted, "negative"), number("Voided", voided, "negative"), number("Action types", Number(deleted > 0) + Number(voided > 0))], note: "Deleted and voided records remain preserved in the audit history. The detail report shows the recorded transaction ID and change information." };
  }

  if (key === "transaction-history") {
    const documents = rows.filter((row) => String(row.event) === "Document");
    return { cards: [money("Document value", sum(documents, "amount"), "accent"), number("Timeline events", rows.length), number("Documents", documents.length, "positive"), number("Audit events", rows.length - documents.length), number("Record types", unique(rows, "type"))], note: "The timeline combines posted documents and audit activity. Underlined document references open the original record." };
  }

  return { cards: [money("Transaction value", sum(rows, "amount"), "accent"), number("Documents", rows.length), number("Open", count(rows, "status", "open"), "negative"), number("Paid / cleared", rows.filter((row) => ["paid", "cleared"].includes(String(row.status).toLowerCase())).length, "positive"), number("Transaction types", unique(rows, "type"))], note: "Amounts are shown in home-currency equivalents. Select an underlined document number to open its source record." };
}
