import { and, sql } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { canManagePendingInvoices } from "./document-access";
export function documentVisibility(user: { role: string; id?: number }) {
  return and(
    user.role === "sales" ? sql`${transactions.type} IN ('invoice') AND ${transactions.createdByUserId} = ${user.id ?? 0} AND EXISTS (SELECT 1 FROM contacts c WHERE c.company_id = ${transactions.companyId} AND c.type = 'customer' AND c.name = ${transactions.party} AND c.sales_owner_id = ${user.id ?? 0})` : undefined,
    // Inventory users see invoices but not the rest of the sales workflow or customer money movements.
    user.role === "inventory" ? sql`${transactions.type} NOT IN ('quotation', 'estimate', 'proforma invoice', 'sales order', 'customer payment', 'sales receipt', 'credit memo', 'statement charge', 'finance charge')` : undefined,
    !canManagePendingInvoices(user) ? sql`${transactions.type} <> 'pending invoice'` : undefined,
  );
}
