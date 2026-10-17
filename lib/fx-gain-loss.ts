import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";

export { FX_GAIN_LOSS_ACCOUNT, FX_GAIN_LOSS_ROLE, exchangeDifference, fxPaymentTypes, withExchangeDifference } from "./fx-difference";
import { FX_GAIN_LOSS_ACCOUNT, FX_GAIN_LOSS_ROLE } from "./fx-difference";

type Executor = Pick<ReturnType<typeof getDb>, "select" | "insert" | "update">;

/** The company's Exchange Gain or Loss account in home currency, linking or creating it when missing. */
export async function ensureFxGainLossAccount(db: Executor, companyId: number, baseCurrency: string) {
  const [linked] = await db.select().from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.systemRole, FX_GAIN_LOSS_ROLE), eq(accounts.currency, baseCurrency))).limit(1);
  if (linked) return linked;
  const [named] = await db.select().from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.name, FX_GAIN_LOSS_ACCOUNT.name), eq(accounts.currency, baseCurrency), isNull(accounts.systemRole))).limit(1);
  if (named) return (await db.update(accounts).set({ systemRole: FX_GAIN_LOSS_ROLE, active: true }).where(eq(accounts.id, named.id)).returning())[0];
  const [codeTaken] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.code, FX_GAIN_LOSS_ACCOUNT.code))).limit(1);
  const [created] = await db.insert(accounts).values({ companyId, code: codeTaken ? `FX-${baseCurrency}` : FX_GAIN_LOSS_ACCOUNT.code, name: FX_GAIN_LOSS_ACCOUNT.name, type: FX_GAIN_LOSS_ACCOUNT.type, systemRole: FX_GAIN_LOSS_ROLE, currency: baseCurrency }).returning();
  return created;
}

/** Ids of payments whose journal has no exchange line yet (used to post past differences once). */
export const unpostedFxPaymentsSql = (companyId: number, fxAccountId: number) => sql`
  SELECT t.id FROM transactions t JOIN companies c ON c.id = t.company_id
  WHERE t.company_id = ${companyId} AND t.type IN ('customer payment', 'bill payment', 'cheque') AND upper(t.currency) <> upper(c.base_currency)
    AND lower(t.status) NOT IN ('void', 'voided', 'cancelled', 'canceled', 'deleted', 'draft')
    AND EXISTS (SELECT 1 FROM journal_entries j WHERE j.transaction_id = t.id AND j.posted)
    AND NOT EXISTS (SELECT 1 FROM journal_entries j JOIN journal_lines l ON l.journal_entry_id = j.id WHERE j.transaction_id = t.id AND l.account_id = ${fxAccountId})
  ORDER BY t.transaction_date, t.id`;
