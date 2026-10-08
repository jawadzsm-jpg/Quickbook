type User = { role: string; id?: number };
type Document = { type: string; createdAt: string | Date };
export function dubaiDay(value: string | Date = new Date()) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : "";
}
export function canManagePendingInvoices(user: User) {
  return ["all_admin", "admin", "accountant"].includes(user.role);
}
export function canReadDocument(user: User, document: Document) {
  // Sales users can open their own invoices only (read-only); quotations, estimates, sales orders and proformas go to accounting.
  if (user.role === "sales" && document.type !== "invoice") return false;
  if (document.type === "pending invoice") return canManagePendingInvoices(user);
  return true;
}
// Inventory users fully edit bills and item receipts only on the UAE calendar day they were created; afterwards they may
// still open them and append serial numbers.
export function canEditInventoryDocument(user: User, document: Document, now: Date = new Date()) {
  return user.role !== "inventory" || !["bill", "received item bill", "item receipt"].includes(document.type) || Boolean(dubaiDay(document.createdAt) && dubaiDay(document.createdAt) === dubaiDay(now));
}
export function canDeleteBusinessRecord(user: User) { return ["all_admin", "admin"].includes(user.role); }
