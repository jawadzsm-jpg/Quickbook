import { and, sql } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { canManagePendingInvoices, dubaiDay } from "./document-access";
export function documentVisibility(user: { role: string; id?: number }) {
  return and(
    user.role === "sales" ? sql`${transactions.type} IN ('quotation', 'estimate', 'sales order') AND ${transactions.createdByUserId} = ${user.id ?? 0} AND EXISTS (SELECT 1 FROM contacts c WHERE c.company_id = ${transactions.companyId} AND c.type = 'customer' AND c.name = ${transactions.party} AND c.sales_owner_id = ${user.id ?? 0})` : undefined,
    user.role === "inventory" ? sql`(${transactions.type} NOT IN ('bill', 'received item bill', 'item receipt') OR to_char(${transactions.createdAt} AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') = ${dubaiDay()})` : undefined,
    !canManagePendingInvoices(user) ? sql`${transactions.type} <> 'pending invoice'` : undefined,
  );
}
