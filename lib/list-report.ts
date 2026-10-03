import { reportColumnKind, type ReportColumn, type ReportRow } from "./report-presentation";

export const listReportKeys = new Set([
  "account-listing",
  "item-price-list",
  "item-price-level-list",
  "item-listing",
  "fixed-asset-listing",
  "customer-phone-list",
  "customer-contact-list",
  "supplier-phone-list",
  "supplier-contact-list",
  "employee-contact-list",
  "other-names-phone-list",
  "other-names-contact-list",
  "terms-listing",
  "to-do-notes",
  "memorised-transactions",
]);

export type ListSummaryCard = {
  label: string;
  value: number | string;
  format: "money" | "number" | "text";
  tone?: "positive" | "negative" | "neutral" | "accent";
};

type ListReportLike = { key?: string; rows: Array<Record<string, string | number | null>> };
const sum = (rows: ListReportLike["rows"], key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
const unique = (rows: ListReportLike["rows"], key: string) => new Set(rows.map((row) => String(row[key] ?? "").trim()).filter((value) => value && value !== "—")).size;
const count = (rows: ListReportLike["rows"], key: string, value: string) => rows.filter((row) => String(row[key] ?? "").toLowerCase() === value.toLowerCase()).length;
const number = (label: string, value: number, tone: ListSummaryCard["tone"] = "neutral"): ListSummaryCard => ({ label, value, format: "number", tone });
const money = (label: string, value: number, tone: ListSummaryCard["tone"] = "neutral"): ListSummaryCard => ({ label, value, format: "money", tone });

export function listDetailTarget(key = "") {
  return ({
    "account-listing": "general-ledger",
    "fixed-asset-listing": "account-listing",
    "item-price-list": "item-price-level-list",
    "item-price-level-list": "item-listing",
    "item-listing": "item-price-list",
    "customer-phone-list": "customer-contact-list",
    "customer-contact-list": "customer-phone-list",
    "supplier-phone-list": "supplier-contact-list",
    "supplier-contact-list": "supplier-phone-list",
    "other-names-phone-list": "other-names-contact-list",
    "other-names-contact-list": "transactions",
    "terms-listing": "transactions",
    "to-do-notes": "transactions",
    "memorised-transactions": "transaction-history",
  } as Record<string, string>)[key] || "";
}

export function listSummary(report: ListReportLike): { cards: ListSummaryCard[]; note: string } | null {
  const key = report.key || "";
  const rows = report.rows;
  if (!listReportKeys.has(key)) return null;

  if (key === "account-listing") return { cards: [number("Accounts", rows.length, "accent"), number("Active", count(rows, "status", "active"), "positive"), number("Inactive", count(rows, "status", "inactive"), "negative"), number("Sub-accounts", rows.filter((row) => String(row.parent) !== "—").length), number("Account types", unique(rows, "type")), money("Opening balance", sum(rows, "balance"))], note: "Select an underlined account or parent account to open its complete Chart of Accounts history." };
  if (key === "fixed-asset-listing") return { cards: [money("Book balance", sum(rows, "balance"), "accent"), money("Total debits", sum(rows, "debit"), "positive"), money("Total credits", sum(rows, "credit"), "negative"), number("Asset accounts", rows.length), number("Active", count(rows, "status", "active"), "positive")], note: "Book balance includes the opening balance and posted ledger movement. Select an asset account to review its history." };
  if (key === "item-price-list") return { cards: [money("On-hand sales value", rows.reduce((total, row) => total + Number(row.quantity || 0) * Number(row.price || 0), 0), "accent"), number("Active items", rows.length, "positive"), number("Units on hand", sum(rows, "quantity")), number("Categories", unique(rows, "category")), number("Zero on hand", rows.filter((row) => Number(row.quantity) === 0).length, "negative")], note: "Sales value is quantity on hand multiplied by the current selling price. Select an item number, SKU, or item name to open Inventory." };
  if (key === "item-price-level-list") {
    const priced = rows.filter((row) => Number(row.price) > 0);
    const margins = priced.map((row) => Number(String(row.margin || "0").replace("%", ""))).filter(Number.isFinite);
    return { cards: [number("Items", rows.length, "accent"), money("Average cost", rows.length ? sum(rows, "cost") / rows.length : 0), money("Average selling price", rows.length ? sum(rows, "price") / rows.length : 0, "positive"), number("Average margin %", margins.length ? margins.reduce((total, value) => total + value, 0) / margins.length : 0), number("Active", count(rows, "status", "active"), "positive")], note: "Margin is measured against the current selling price. Select an item reference to open Inventory and maintain pricing." };
  }
  if (key === "item-listing") return { cards: [money("Inventory cost value", rows.reduce((total, row) => total + Number(row.quantity || 0) * Number(row.cost || 0), 0), "accent"), number("Items", rows.length), number("Units on hand", sum(rows, "quantity")), number("At / below reorder", rows.filter((row) => Number(row.quantity) <= Number(row.reorder)).length, "negative"), number("Active", count(rows, "status", "active"), "positive"), number("Categories", unique(rows, "category"))], note: "Inventory cost value is quantity on hand multiplied by unit cost. Select an item reference to open its Inventory record." };

  if (["customer-phone-list", "supplier-phone-list"].includes(key)) return { cards: [number("Contacts", rows.length, "accent"), number("With phone", rows.filter((row) => String(row.phone) !== "—").length, "positive"), number("With WhatsApp", rows.filter((row) => String(row.whatsapp) !== "—").length), number("Companies", unique(rows, "company")), number("Countries", unique(rows, "country"))], note: `Select an underlined ${key.startsWith("customer") ? "customer" : "supplier"} to open the matching contact area.` };
  if (["customer-contact-list", "supplier-contact-list", "employee-contact-list"].includes(key)) return { cards: [number("Contacts", rows.length, "accent"), number("Active", count(rows, "status", "active"), "positive"), number("Inactive", count(rows, "status", "inactive"), "negative"), number("With email", rows.filter((row) => String(row.email) !== "—").length), number("With phone", rows.filter((row) => String(row.phone) !== "—").length), number("Countries", unique(rows, "country"))], note: `Select an underlined ${key.startsWith("customer") ? "customer" : key.startsWith("supplier") ? "supplier" : "employee"} to open the matching contact area.` };
  if (["other-names-phone-list", "other-names-contact-list"].includes(key)) return { cards: [number("Other names", rows.length, "accent"), number("Transactions", sum(rows, "transactions")), number("With phone", rows.filter((row) => String(row.phone) !== "—" && String(row.phone || "").trim()).length), number("Activity dates", unique(rows, "lastActivity"))], note: "Other names are transaction parties not yet saved as customers, suppliers, or employees. Review the supporting transaction report before creating a contact." };
  if (key === "terms-listing") return { cards: [number("Terms", rows.length, "accent"), number("Documents", sum(rows, "documents")), number("Customers / suppliers", sum(rows, "names")), number("Average due days", rows.length ? sum(rows, "days") / rows.length : 0)], note: "Terms are derived from document transaction and due dates; this is not the configured payment-term register. Open the supporting transaction report to review the source documents." };
  if (key === "to-do-notes") {
    const today = new Date().toISOString().slice(0, 10);
    return { cards: [number("Open notes", rows.length, "accent"), number("Overdue", rows.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row.dueDate)) && String(row.dueDate) < today).length, "negative"), number("With due date", rows.filter((row) => String(row.dueDate) !== "—").length), number("Names", unique(rows, "name")), number("Document types", unique(rows, "type"))], note: "Select an underlined transaction number to open the source document and complete or update the note." };
  }
  return { cards: [money("Template value", sum(rows, "amount"), "accent"), number("Templates", rows.length), number("Transaction types", unique(rows, "type")), number("Currencies", unique(rows, "currency")), number("Accounts", unique(rows, "account"))], note: "Select an underlined transaction number to open the original document. This list matches memorised, recurring or template keywords in document memos; it does not schedule transactions." };
}

export const listReportGroups = [
  { title: "Accounts & assets", description: "Review account hierarchy, system roles and assets.", keys: ["account-listing", "fixed-asset-listing"] },
  { title: "Items & pricing", description: "Inspect quantities, current prices and inventory accounts.", keys: ["item-listing", "item-price-list", "item-price-level-list"] },
  { title: "Contact directories", description: "Find customers, suppliers, employees and other names.", keys: ["customer-phone-list", "customer-contact-list", "supplier-phone-list", "supplier-contact-list", "employee-contact-list", "other-names-phone-list", "other-names-contact-list"] },
  { title: "Terms & working records", description: "Review document terms, open notes and template-marked activity.", keys: ["terms-listing", "to-do-notes", "memorised-transactions"] },
];
export type ListFilters = { query: string; status: string; sort: string };
export const emptyListFilters: ListFilters = { query: "", status: "", sort: "" };
export function filterListRows(rows: ReportRow[], columns: ReportColumn[], filters: ListFilters) {
  const query = filters.query.trim().toLowerCase();
  const result = rows.filter(row => (!filters.status || row.status === filters.status) && (!query || columns.some(column => String(row[column.key] ?? "").toLowerCase().includes(query))));
  const [key, direction] = filters.sort.split(":");
  const column = columns.find(column => column.key === key);
  if (!column) return result;
  const numeric = reportColumnKind(column, rows) !== "text";
  return result.sort((a, b) => (direction === "desc" ? -1 : 1) * (numeric ? (parseFloat(String(a[key])) || 0) - (parseFloat(String(b[key])) || 0) : String(a[key] ?? "").localeCompare(String(b[key] ?? ""))));
}
