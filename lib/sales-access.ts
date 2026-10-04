// Sales is an operational workspace, not a company-wide reporting role.
export const salesDocumentTypes = ["quotation", "estimate", "sales order", "proforma invoice"];
export function salesRouteAllowed(path: string, method: string) {
  if (["/api/auth/session", "/api/user-preferences", "/api/sku-locks", "/api/records", "/api/attachments", "/api/sales-work"].includes(path)) return true;
  return method === "GET" && ["/api/workspaces", "/api/company-setup", "/api/inventory-overview", "/api/vat-codes", "/api/exchange-rates", "/api/payment-terms", "/api/spec-options", "/api/login-branding"].includes(path);
}
