import { and, sql } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { canManagePendingInvoices, dubaiDay } from "./document-access";
export function documentVisibility(user: { role: string }) {
  return and(
    user.role === "inventory" ? sql`(${transactions.type} NOT IN ('bill', 'received item bill', 'item receipt') OR to_char(${transactions.createdAt} AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') = ${dubaiDay()})` : undefined,
    !canManagePendingInvoices(user) ? sql`${transactions.type} <> 'pending invoice'` : undefined,
  );
}
