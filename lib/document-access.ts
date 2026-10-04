type User = { role: string; id?: number };
type Document = { type: string; createdAt: string | Date };
export function dubaiDay(value: string | Date = new Date()) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : "";
}
export function canManagePendingInvoices(user: User) {
  return ["all_admin", "admin", "accountant"].includes(user.role);
}
export function canReadDocument(user: User, document: Document, now: Date = new Date()) {
  if (user.role === "sales" && !["quotation", "estimate", "sales order"].includes(document.type)) return false;
  if (document.type === "pending invoice") return canManagePendingInvoices(user);
  return user.role !== "inventory" || !["bill", "received item bill", "item receipt"].includes(document.type) || Boolean(dubaiDay(document.createdAt) && dubaiDay(document.createdAt) === dubaiDay(now));
}
export function canDeleteBusinessRecord(user: User) { return ["all_admin", "admin"].includes(user.role); }
