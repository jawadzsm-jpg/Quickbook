// Sales is an operational workspace, not a company-wide reporting role.
export const salesDocumentTypes = ["quotation", "estimate", "sales order", "proforma invoice", "invoice"];
// Sales users hand these to accounting once saved: they cannot open, print or download them (accountants add stamp/bank/PDF).
export const salesHandoffTypes = ["quotation", "estimate", "sales order", "proforma invoice"];
// The only saved documents sales users can open: their own invoices, read-only, for viewing, print and PDF.
export const salesViewableTypes = ["invoice"];
export function salesRouteAllowed(path: string, method: string) {
  if (["/api/auth/session", "/api/user-preferences", "/api/sku-locks", "/api/records", "/api/attachments", "/api/sales-work", "/api/cargos", "/api/online-users", "/api/notifications", "/api/announcements", "/api/category-colors", "/api/email-templates", "/api/email-lists", "/api/inventory-emails", "/api/email-signatures", "/api/user-notes"].includes(path)) return true;
  return method === "GET" && ["/api/workspaces", "/api/company-setup", "/api/inventory-overview", "/api/vat-codes", "/api/exchange-rates", "/api/payment-terms", "/api/spec-options", "/api/login-branding"].includes(path);
}
