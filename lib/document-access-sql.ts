import { and, sql } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { canManagePendingInvoices } from "./document-access";
export function documentVisibility(user: { role: string; id?: number }) {
  return and(
    user.role === "sales" ? sql`${transactions.type} IN ('invoice') AND ${transactions.createdByUserId} = ${user.id ?? 0} AND EXISTS (SELECT 1 FROM contacts c WHERE c.company_id = ${transactions.companyId} AND c.type = 'customer' AND c.name = ${transactions.party} AND c.sales_owner_id = ${user.id ?? 0})` : undefined,
    !canManagePendingInvoices(user) ? sql`${transactions.type} <> 'pending invoice'` : undefined,
  );
}
