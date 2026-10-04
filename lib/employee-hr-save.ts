import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, auditLog } from "@/db/schema";
import { employeeHrValues, employeeLoanAccount } from "./employee-hr";
import { normalizeComparableText } from "./text-normalization";

/** Called inside the contact write transaction: Cancel never creates an account. */
export async function employeeHrForSave(payload: Record<string, unknown>, companyId: number, existing: Record<string, unknown> = {}) {
  const db = getDb();
  const rows = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
  const currency = String(existing.currency || payload.currency || "AED").trim().toUpperCase();
  const values = { ...payload, currency };
  if (payload.loanAccountId !== "create-employee-loan") return employeeHrValues(values, companyId, rows, existing);
  const hr = employeeHrValues({ ...values, loanAccountId: "" }, companyId, rows, existing);
  const name = `Employee loans - ${String(payload.name ?? existing.name).trim()} (${currency})`;
  const match = rows.find(row => normalizeComparableText(row.name) === normalizeComparableText(name));
  if (match) return { ...hr, loanAccountId: employeeLoanAccount(match.id, companyId, currency, rows)!.id };
  let suffix = Math.max(0, ...rows.map(row => row.id)) + 1;
  while (rows.some(row => row.code.toUpperCase() === `EMP-LOAN-${suffix}`)) suffix++;
  const [account] = await db.insert(accounts).values({ companyId, code: `EMP-LOAN-${suffix}`, name, type: "Other Current Asset", currency, balance: 0 }).returning();
  await db.insert(auditLog).values({ companyId, action: "created", entityType: "account", entityId: account.id, details: `Employee loan account created from HR profile: ${name}; opening balance 0` });
  return { ...hr, loanAccountId: account.id };
}
